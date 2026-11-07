#include "adapters/Drv8833MotionAdapter.hpp"

#include <cmath>
#include <cstdio>

#include "domain/RobotParameters.hpp"
#include "domain/SoftStart.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"

#if CONFIG_RATO_LOG_RETA
#include "esp_log.h"
#endif

namespace micromouse::adapters {

namespace {
uint32_t elapsedMsSince(TickType_t start) {
    return static_cast<uint32_t>((xTaskGetTickCount() - start) * portTICK_PERIOD_MS);
}

// Tempo máximo de um movimento (uma célula ou uma curva). No teste de 04/11, uma célula levou
// ~0,5 s; sem limite, uma curva que não terminava (robô no ar, rodas paradas) esperou 92 s.
constexpr uint32_t kMoveTimeoutMs = 3000;

// Potências (fração da tensão da bateria). As da reta ficam em domain/RobotParameters.hpp (0,70 e
// teto 0,85), junto dos ganhos, para a simulação do host usar os mesmos valores. Em 04/11, com 0,40
// na curva, as rodas às vezes não venciam o atrito estático; o firmware de teste do hardware usa 100%.
constexpr double kBaseSpeed = domain::robot::kStraightBaseSpeed;
constexpr double kMaxSpeed = domain::robot::kStraightMaxSpeed;
constexpr double kTurnSpeed = 0.60;
constexpr double kTurnToleranceDeg = 2.0;
constexpr double kDeltaTimeSeconds = 0.001;
constexpr TickType_t kControlPeriod = pdMS_TO_TICKS(1);
// RF-44: de quanto em quanto tempo pergunta aos ToF laterais se há medida nova (eles medem a cada
// 50 ms; perguntar mais vezes só pega a medida mais cedo).
constexpr uint32_t kWallPollMs = 10;
}  // namespace

Drv8833MotionAdapter::Drv8833MotionAdapter(const domain::WheelConfig& wheels,
                                           const domain::TurnConfig& turnConfig,
                                           const domain::PidGains& straightGains,
                                           double maxCorrection,
                                           Mpu6050& imu)
    : imu_(imu),
      wheels_(wheels),
      turnConfig_(turnConfig),
      straight_(straightGains, kBaseSpeed, kMaxSpeed, maxCorrection) {}

void Drv8833MotionAdapter::begin() {
    motors_.begin();
    encoders_.begin();
}

void Drv8833MotionAdapter::advanceCell() {
    domain::Odometry odometry(wheels_);
    encoders_.reset();
    straight_.reset();

    long previousAverage = 0;
    // RF-44: última leitura de cada parede lateral nesta célula e o termo que ela dá (0 sem walls_).
    domain::SideReading leftWall{};
    domain::SideReading rightWall{};
    double wallTerm = 0.0;
    uint32_t lastWallPollMs = 0;
    const TickType_t start = xTaskGetTickCount();
    lastMoveOk_ = true;
    lastMoveName_ = "andar 1 celula";
    while (odometry.distanceMm() < wheels_.cellSizeMm) {
        if (elapsedMsSince(start) > kMoveTimeoutMs) {
            lastMoveOk_ = false;  // as rodas não levaram o robô a uma célula no tempo
            break;
        }
        const long left = encoders_.left();
        const long right = encoders_.right();
        const long average = (left + right) / 2;
        odometry.onEncoderPulses(average - previousAverage);
        previousAverage = average;

        if (walls_ != nullptr && elapsedMsSince(start) - lastWallPollMs >= kWallPollMs) {
            lastWallPollMs = elapsedMsSince(start);
            using Side = Vl53l1xSensorAdapter::Side;
            auto refresh = [this](Side side, domain::SideReading& out) {
                if (const auto reading = walls_->freshReading(side)) {
                    out = {reading->kind == drivers::ReadingKind::Distance,
                           static_cast<double>(reading->mm)};
                }
            };
            refresh(Side::Left, leftWall);
            refresh(Side::Right, rightWall);
            wallTerm =
                domain::wallCenteringError(leftWall, rightWall, domain::robot::kWallCentering);
        }
        const double error = static_cast<double>(left - right) + wallTerm;
        const controller::WheelSpeeds speeds = straight_.correct(error, kDeltaTimeSeconds);
        // Partida suave: a potência sobe em rampa no começo de cada célula.
        const double ramp = domain::softStartFactor(elapsedMsSince(start));
        endLeftCmd_ = ramp * speeds.left;
        endRightCmd_ = ramp * speeds.right;
        motors_.setNormalized(endLeftCmd_, endRightCmd_);
        vTaskDelay(kControlPeriod);
    }
    endLeftCount_ = encoders_.left();
    endRightCount_ = encoders_.right();
    motors_.brake();
#if CONFIG_RATO_LOG_RETA
    // Calibração do ganho da reta (roteiro do PR): saturou > 0 ou erro máximo perto de
    // kStraightMaxCorrection / kp indicam ganho baixo ou roda com problema.
    const controller::StraightStats& stats = straight_.stats();
    ESP_LOGI("reta",
             "kp=%.4f enc E=%ld D=%ld erro final=%.0f max=%.0f corr max=%.3f saturou=%d/%d "
             "parede=%.1f %s",
             domain::robot::kStraightGains.proportionalGain, endLeftCount_, endRightCount_,
             stats.lastError, stats.maxAbsError, stats.maxAbsCorrection, stats.saturatedSteps,
             stats.steps, wallTerm, lastMoveOk_ ? "ok" : "TEMPO ESGOTADO");
#endif
    vTaskDelay(pdMS_TO_TICKS(40));
}

void Drv8833MotionAdapter::pivot(double degrees, double leftSpeed, double rightSpeed) {
    encoders_.reset();
    // Um controlador novo por curva: a referência angular parte de zero a cada manobra, e o erro
    // da deriva do giroscópio não se propaga entre curvas consecutivas (RNF-34).
    domain::GyroTurnController gyro(degrees, kTurnToleranceDeg);
    const double targetPulses = domain::pulsesForTurn(turnConfig_, degrees);
    const TickType_t start = xTaskGetTickCount();
    lastMoveOk_ = true;
    lastMoveName_ = degrees > 135.0 ? "meia-volta" : "curva de 90 graus";

    while (!gyro.reached()) {
        if (elapsedMsSince(start) > kMoveTimeoutMs) {
            lastMoveOk_ = false;  // nem o giro nem os encoders confirmaram a curva no tempo
            break;
        }
        // Partida suave dentro do laço: o giro já é integrado durante a rampa.
        const double ramp = domain::softStartFactor(elapsedMsSince(start));
        endLeftCmd_ = ramp * leftSpeed;
        endRightCmd_ = ramp * rightSpeed;
        motors_.setNormalized(endLeftCmd_, endRightCmd_);
        const double turned =
            (std::fabs(encoders_.left()) + std::fabs(encoders_.right())) / 2.0;
        if (turned >= targetPulses) {
            break;
        }
        gyro.integrate(imu_.gyroZDegPerSec(), kDeltaTimeSeconds);
        vTaskDelay(kControlPeriod);
    }
    endLeftCount_ = encoders_.left();
    endRightCount_ = encoders_.right();
    motors_.brake();
    vTaskDelay(pdMS_TO_TICKS(40));
}

void Drv8833MotionAdapter::describeLastMove(char* out, size_t size) const {
    std::snprintf(out, size, "enc E=%ld D=%ld pot E=%.2f D=%.2f", endLeftCount_, endRightCount_,
                  endLeftCmd_, endRightCmd_);
}

void Drv8833MotionAdapter::turnLeft() { pivot(90.0, -kTurnSpeed, kTurnSpeed); }

void Drv8833MotionAdapter::turnRight() { pivot(90.0, kTurnSpeed, -kTurnSpeed); }

void Drv8833MotionAdapter::turnAround() { pivot(180.0, kTurnSpeed, -kTurnSpeed); }

}  // namespace micromouse::adapters
