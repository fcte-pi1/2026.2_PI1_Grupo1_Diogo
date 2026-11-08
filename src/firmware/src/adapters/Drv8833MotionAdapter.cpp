#include "adapters/Drv8833MotionAdapter.hpp"

#include <cmath>
#include <cstdio>

#include "domain/RobotParameters.hpp"
#include "domain/SoftStart.hpp"
#include "esp_timer.h"
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
constexpr char kTimeoutFailure[] = "tempo de 3 s esgotado";

// Potências (fração da tensão da bateria) e perfil da curva: em domain/RobotParameters.hpp, para a
// simulação do host usar os mesmos valores.
constexpr double kBaseSpeed = domain::robot::kStraightBaseSpeed;
constexpr double kMaxSpeed = domain::robot::kStraightMaxSpeed;
constexpr double kDeltaTimeSeconds = 0.001;
constexpr TickType_t kControlPeriod = pdMS_TO_TICKS(1);
// RF-44: de quanto em quanto tempo pergunta aos ToF laterais se há medida nova (eles medem a cada
// 50 ms; perguntar mais vezes só pega a medida mais cedo).
constexpr uint32_t kWallPollMs = 10;
// Pausa depois de cada movimento, com o freio ligado.
constexpr uint32_t kSettleMs = 40;

// Segundos desde a leitura anterior do giroscópio (relógio de µs do esp_timer). O laço espera 1 tick
// por volta, mas a leitura I²C, a tarefa do BLE e o log atrasam algumas voltas.
class GyroClock {
private:
    int64_t lastUs_{esp_timer_get_time()};

public:
    double secondsSinceLast() {
        const int64_t now = esp_timer_get_time();
        const double seconds = static_cast<double>(now - lastUs_) * 1e-6;
        lastUs_ = now;
        return seconds;
    }
};
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
    lastMoveFailure_ = "";
    lastMoveName_ = "andar 1 celula";
    lastMoveWasTurn_ = false;
    while (odometry.distanceMm() < wheels_.cellSizeMm) {
        if (elapsedMsSince(start) > kMoveTimeoutMs) {
            lastMoveOk_ = false;  // as rodas não levaram o robô a uma célula no tempo
            lastMoveFailure_ = kTimeoutFailure;
            break;
        }
        const long left = encoders_.left();
        const long right = encoders_.right();
        // Uma roda parada e a outra andando: sem isto, suspenso, a célula "terminava" pela média dos
        // encoders com uma roda só, e no chão o robô girava contra a parede até o tempo limite
        // (07/11: "enc E=0 D=123 pot E=0.85").
        const domain::StalledWheel stalled =
            domain::detectStalledWheel(left, right, domain::robot::kWheelStall);
        if (stalled != domain::StalledWheel::None) {
            lastMoveOk_ = false;
            lastMoveFailure_ = domain::stalledWheelName(stalled);
            break;
        }
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
             stats.steps, wallTerm, lastMoveOk_ ? "ok" : lastMoveFailure_);
#endif
    vTaskDelay(pdMS_TO_TICKS(kSettleMs));
}

void Drv8833MotionAdapter::pivot(double degrees, controller::PivotTurn::Direction direction) {
    encoders_.reset();
    // Uma curva nova por manobra: a referência angular parte de zero a cada curva, e o erro da
    // deriva do giroscópio não se propaga entre curvas consecutivas (RNF-34).
    controller::PivotTurn turn(degrees, direction, domain::robot::kPivot);
    const TickType_t start = xTaskGetTickCount();
    lastMoveOk_ = true;
    lastMoveFailure_ = "";
    lastMoveName_ = degrees > 135.0 ? "meia-volta" : "curva de 90 graus";
    lastMoveWasTurn_ = true;

    // Só o giroscópio encerra a curva (07/11: pelos pulsos, com as rodas patinando, ela "terminava"
    // com o robô parado). Sem girar, quem para é o tempo limite, e a corrida vai para Erro.
    GyroClock clock;
    while (true) {
        if (elapsedMsSince(start) > kMoveTimeoutMs) {
            lastMoveOk_ = false;  // o giroscópio não confirmou a curva no tempo
            lastMoveFailure_ = kTimeoutFailure;
            break;
        }
        const double rate = imu_.gyroZDegPerSec();
        const controller::WheelSpeeds speeds = turn.step(rate, clock.secondsSinceLast());
        if (turn.done()) {
            break;
        }
        // Partida suave dentro do laço: o giro já é integrado durante a rampa.
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
    const double stopDeg = turn.angle();
    const uint32_t turnMs = elapsedMsSince(start);
#endif
    // A pausa com o freio também mede quanto o robô ainda gira depois de frear.
    const TickType_t settleStart = xTaskGetTickCount();
    while (elapsedMsSince(settleStart) < kSettleMs) {
        vTaskDelay(kControlPeriod);
        turn.settle(imu_.gyroZDegPerSec(), clock.secondsSinceLast());
    }
    lastTurnDeg_ = turn.angle();
#if CONFIG_RATO_LOG_RETA
    // Calibração da curva (E1 do roteiro): "final" é o ângulo depois do freio, e os pulsos medidos
    // contra os esperados sem patinar mostram quanto as rodas patinaram.
    ESP_LOGI("curva", "alvo=%.0f parou=%.1f final=%.1f tempo=%lu ms enc E=%ld D=%ld esperado=%.0f %s",
             degrees, stopDeg, lastTurnDeg_, static_cast<unsigned long>(turnMs), endLeftCount_,
             endRightCount_, domain::pulsesForTurn(turnConfig_, degrees),
             lastMoveOk_ ? "ok" : lastMoveFailure_);
#endif
}

void Drv8833MotionAdapter::describeLastMove(char* out, size_t size) const {
    if (lastMoveWasTurn_) {
        std::snprintf(out, size, "enc E=%ld D=%ld pot E=%.2f D=%.2f giro=%.0f", endLeftCount_,
                      endRightCount_, endLeftCmd_, endRightCmd_, lastTurnDeg_);
        return;
    }
    std::snprintf(out, size, "enc E=%ld D=%ld pot E=%.2f D=%.2f", endLeftCount_, endRightCount_,
                  endLeftCmd_, endRightCmd_);
}

void Drv8833MotionAdapter::turnLeft() { pivot(90.0, controller::PivotTurn::Direction::Left); }

void Drv8833MotionAdapter::turnRight() { pivot(90.0, controller::PivotTurn::Direction::Right); }

void Drv8833MotionAdapter::turnAround() { pivot(180.0, controller::PivotTurn::Direction::Right); }

}  // namespace micromouse::adapters
