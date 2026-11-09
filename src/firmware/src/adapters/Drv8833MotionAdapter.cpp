#include "adapters/Drv8833MotionAdapter.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>

#include "controller/RobotMotion.hpp"
#include "domain/MotorVoltage.hpp"
#include "domain/RobotParameters.hpp"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"

#include "esp_log.h"

namespace micromouse::adapters {

namespace {
// Tempo máximo de um movimento (uma célula ou uma curva). No teste de 04/11, uma célula levou
// ~0,5 s; sem limite, uma curva que não terminava (robô no ar, rodas paradas) esperou 92 s.
constexpr double kMoveTimeoutS = 3.0;
constexpr char kTimeoutFailure[] = "tempo de 3 s esgotado";
// Laço de controle: 2 ms. O intervalo real é medido a cada volta (I²C do giroscópio, BLE, log).
constexpr TickType_t kControlPeriod = pdMS_TO_TICKS(2);
// O intervalo medido é limitado: uma volta muito atrasada não pode virar um salto no integral.
constexpr double kMinDtS = 0.0005;
constexpr double kMaxDtS = 0.02;
// RF-44: de quanto em quanto tempo pergunta aos ToF laterais se há medida nova (eles medem a cada
// 50 ms; perguntar mais vezes só pega a medida mais cedo).
constexpr double kWallPollS = 0.01;
// Pausa depois de cada movimento, com o freio ligado (mede também o giro depois do freio).
constexpr uint32_t kSettleMs = 40;

double mmFromPulses(long pulses) {
    return static_cast<double>(pulses) * controller::robot::kMmPerPulse;
}

// Relógio do laço: segundos desde o começo do movimento e intervalo desde a volta anterior.
class LoopClock {
private:
    int64_t startUs_{esp_timer_get_time()};
    int64_t lastUs_{startUs_};

public:
    double tick() {
        const int64_t now = esp_timer_get_time();
        const double dt = static_cast<double>(now - lastUs_) * 1e-6;
        lastUs_ = now;
        return std::clamp(dt, kMinDtS, kMaxDtS);
    }
    [[nodiscard]] double elapsed() const {
        return static_cast<double>(esp_timer_get_time() - startUs_) * 1e-6;
    }
};
}  // namespace

Drv8833MotionAdapter::Drv8833MotionAdapter(Mpu6050& imu)
    : imu_(imu), batteryVolts_(controller::robot::kNominalBatteryVolts) {}

void Drv8833MotionAdapter::begin() {
    motors_.begin();
    encoders_.begin();
}

void Drv8833MotionAdapter::setBatteryVolts(double volts) noexcept {
    batteryVolts_ = domain::usableBatteryVolts(volts, controller::robot::kNominalBatteryVolts);
}

void Drv8833MotionAdapter::drive(double leftVolts, double rightVolts) {
    endLeftVolts_ = leftVolts;
    endRightVolts_ = rightVolts;
    motors_.setNormalized(domain::commandForVolts(leftVolts, batteryVolts_, kMotorDecay),
                          domain::commandForVolts(rightVolts, batteryVolts_, kMotorDecay));
}

bool Drv8833MotionAdapter::aborted() {
    if (abort_ == nullptr || !abort_->load()) {
        return false;
    }
    lastMoveOk_ = false;
    lastMoveFailure_ = "parado pelo operador";
    return true;
}

void Drv8833MotionAdapter::stopAndSettle() {
    endLeftCount_ = encoders_.left();
    endRightCount_ = encoders_.right();
    motors_.brake();
}

void Drv8833MotionAdapter::openLoopTest(double command, uint32_t ms) {
    encoders_.reset();
    const int64_t start = esp_timer_get_time();
    int64_t nextLog = start;
    while (true) {
        const int64_t now = esp_timer_get_time();
        const double elapsedMs = static_cast<double>(now - start) / 1000.0;
        if (elapsedMs >= ms) {
            break;
        }
        const double ramp = std::min(elapsedMs / 80.0, 1.0);  // a rampa do firmware do hardware
        motors_.setNormalized(ramp * command, ramp * command);
        if (now >= nextLog) {
            ESP_LOGI("teste", "t=%4.0f ms pot=%.2f enc E=%ld D=%ld", elapsedMs, ramp * command,
                     encoders_.left(), encoders_.right());
            nextLog += 100000;
        }
        vTaskDelay(kControlPeriod);
    }
    motors_.brake();
    ESP_LOGI("teste", "fim: pot=%.2f por %lu ms enc E=%ld D=%ld bat=%.2f V (%s)", command,
             static_cast<unsigned long>(ms), encoders_.left(), encoders_.right(), batteryVolts_,
             kMotorDecayName);
}

void Drv8833MotionAdapter::advanceCell() {
    straight(domain::robot::kCellSizeMm, "andar 1 celula", walls_ != nullptr);
}

void Drv8833MotionAdapter::straight(double distanceMm, const char* name, bool centerOnWalls) {
    if (!lastMoveOk_) {
        return;  // um movimento anterior deste passo falhou: não anda com o robô na pose errada
    }
    // Para trás (distância negativa): o mesmo controle, com os encoders e a tensão invertidos.
    const double sign = distanceMm < 0.0 ? -1.0 : 1.0;
    encoders_.reset();
    controller::StraightMove move(std::fabs(distanceMm), controller::robot::kStraightMove);
    controller::SpeedEstimator leftSpeed;
    controller::SpeedEstimator rightSpeed;
    leftSpeed.reset(0.0, 0.0);
    rightSpeed.reset(0.0, 0.0);

    // RF-44: última leitura de cada parede lateral nesta célula e o termo que ela dá.
    domain::SideReading leftWall{};
    domain::SideReading rightWall{};
    double wallMm = 0.0;
    double lastWallPoll = -kWallPollS;

    lastMoveName_ = name;
    lastMoveWasTurn_ = false;
    endLeftVolts_ = 0.0;
    endRightVolts_ = 0.0;
    lastShortMm_ = 0.0;
    double lastFrontPoll = -kWallPollS;
    int frontMm = -1;  // última leitura válida do frontal nesta reta (-1 = nenhuma)

    LoopClock clock;
    while (true) {
        const double dt = clock.tick();
        const double now = clock.elapsed();
        if (aborted()) {
            break;
        }
        if (now > kMoveTimeoutS) {
            lastMoveOk_ = false;  // as rodas não levaram o robô ao fim no tempo
            lastMoveFailure_ = kTimeoutFailure;
            break;
        }
        const long left = static_cast<long>(sign) * encoders_.left();
        const long right = static_cast<long>(sign) * encoders_.right();
        // Uma roda parada e a outra andando (roda travada, motor ou encoder solto): Erro na hora.
        const domain::StalledWheel stalled =
            domain::detectStalledWheel(left, right, domain::robot::kWheelStall);
        if (stalled != domain::StalledWheel::None) {
            lastMoveOk_ = false;
            lastMoveFailure_ = domain::stalledWheelName(stalled);
            break;
        }
        const double leftMm = mmFromPulses(left);
        const double rightMm = mmFromPulses(right);

        if (centerOnWalls && walls_ != nullptr && now - lastWallPoll >= kWallPollS) {
            lastWallPoll = now;
            using Side = Vl53l1xSensorAdapter::Side;
            auto refresh = [this](Side side, domain::SideReading& out) {
                if (const auto reading = walls_->freshReading(side)) {
                    out = {reading->kind == drivers::ReadingKind::Distance,
                           static_cast<double>(reading->mm)};
                }
            };
            refresh(Side::Left, leftWall);
            refresh(Side::Right, rightWall);
            wallMm = domain::wallCenteringError(leftWall, rightWall, domain::robot::kWallCentering) *
                     controller::robot::kMmPerPulse;
        }

        // Parada pela parede da frente: só para a frente, depois de meia reta.
        const double travelled = 0.5 * (leftMm + rightMm);
        if (sign > 0.0 && front_ != nullptr && now - lastFrontPoll >= kWallPollS &&
            travelled > 0.5 * std::fabs(distanceMm)) {
            lastFrontPoll = now;
            if (const auto reading = front_->freshReading(Vl53l1xSensorAdapter::Side::Front);
                reading && reading->kind == drivers::ReadingKind::Distance) {
                frontMm = reading->mm;
                if (reading->mm < controller::robot::kFrontStopMm) {
                    lastShortMm_ = std::max(0.0, std::fabs(distanceMm) - travelled);
                    break;
                }
            }
        }

        const controller::StraightMove::Output out =
            move.step(dt, leftMm, rightMm, leftSpeed.update(leftMm, now),
                      rightSpeed.update(rightMm, now), wallMm);
        if (out.done) {
            if (!move.reachedTarget()) {
                lastMoveOk_ = false;
                lastMoveFailure_ = "nao chegou ao fim da celula";
            }
            break;
        }
        drive(sign * out.leftVolts, sign * out.rightVolts);
        vTaskDelay(kControlPeriod);
    }
    stopAndSettle();
#if CONFIG_RATO_LOG_RETA
    // Calibração da reta: "dif" é a diferença de caminho entre as rodas (mm; ~0,65 grau de rumo
    // por mm com a bitola de 88 mm), "satur" os passos com uma roda no teto de tensão.
    ESP_LOGI("reta",
             "%s %.0f mm: enc E=%ld D=%ld (%.1f / %.1f mm) dif max=%.1f fim=%.1f mm V max E=%.1f "
             "D=%.1f satur=%d/%d tempo=%.0f ms perfil=%.0f ms bat=%.2f V parede=%.1f mm "
             "frente=%d mm parou antes=%.0f mm %s",
             name, distanceMm, endLeftCount_, endRightCount_, mmFromPulses(endLeftCount_),
             mmFromPulses(endRightCount_), move.maxDifferenceMm(), move.lastDifferenceMm(),
             move.maxLeftVolts(), move.maxRightVolts(), move.saturatedSteps(), move.steps(),
             move.elapsed() * 1000.0, move.duration() * 1000.0, batteryVolts_, wallMm, frontMm,
             lastShortMm_, lastMoveOk_ ? "ok" : lastMoveFailure_);
#endif
    vTaskDelay(pdMS_TO_TICKS(kSettleMs));
}

void Drv8833MotionAdapter::pivot(double degrees, controller::PivotMove::Direction direction,
                                 const controller::PivotMoveConfig& config) {
    if (!lastMoveOk_) {
        return;  // um movimento anterior deste passo falhou
    }
    encoders_.reset();
    // Uma curva nova por manobra: o ângulo parte de zero, e o erro da deriva do giroscópio não se
    // propaga entre curvas consecutivas (RNF-34).
    controller::PivotMove turn(degrees, direction, config);
    controller::SpeedEstimator leftSpeed;
    controller::SpeedEstimator rightSpeed;
    leftSpeed.reset(0.0, 0.0);
    rightSpeed.reset(0.0, 0.0);
    lastMoveName_ = degrees > 135.0 ? "meia-volta"
                    : config.turnRadiusMm > 0.0 ? "curva de 90 graus em arco"
                                                : "curva de 90 graus";
    lastMoveWasTurn_ = true;
    endLeftVolts_ = 0.0;
    endRightVolts_ = 0.0;

    // O giroscópio decide o fim (07/11: pelos pulsos, com as rodas patinando, a curva "terminava"
    // com o robô parado). Sem girar (suspenso), quem para é o tempo limite, e a corrida vai a Erro.
    LoopClock clock;
    while (true) {
        const double dt = clock.tick();
        const double now = clock.elapsed();
        if (aborted()) {
            break;
        }
        if (now > kMoveTimeoutS) {
            lastMoveOk_ = false;  // o giroscópio não confirmou a curva no tempo
            lastMoveFailure_ = kTimeoutFailure;
            break;
        }
        const double leftMm = mmFromPulses(encoders_.left());
        const double rightMm = mmFromPulses(encoders_.right());
        const controller::PivotMove::Output out =
            turn.step(dt, imu_.gyroZDegPerSec(), leftMm, rightMm, leftSpeed.update(leftMm, now),
                      rightSpeed.update(rightMm, now));
        if (out.done) {
            break;
        }
        drive(out.leftVolts, out.rightVolts);
        vTaskDelay(kControlPeriod);
    }
    stopAndSettle();
#if CONFIG_RATO_LOG_RETA
    const double stopDeg = turn.angle();
    const double turnMs = clock.elapsed() * 1000.0;
#endif
    // A pausa com o freio também mede quanto o robô ainda gira depois de frear.
    const int64_t settleStart = esp_timer_get_time();
    clock.tick();
    while (esp_timer_get_time() - settleStart < static_cast<int64_t>(kSettleMs) * 1000) {
        vTaskDelay(kControlPeriod);
        turn.settle(imu_.gyroZDegPerSec(), clock.tick());
    }
    lastTurnDeg_ = turn.angle();
#if CONFIG_RATO_LOG_RETA
    // Calibração da curva (E1 do roteiro): "final" é o ângulo depois do freio; os pulsos contra os
    // esperados sem patinar mostram quanto as rodas patinaram, e "continuou" se o perfil acabou sem
    // o giroscópio chegar ao alvo.
    ESP_LOGI("curva",
             "alvo=%.0f parou=%.1f final=%.1f tempo=%.0f ms enc E=%ld D=%ld (esperado %.0f) "
             "V max=%.1f bat=%.2f V continuou=%s %s",
             degrees, stopDeg, lastTurnDeg_, turnMs, endLeftCount_, endRightCount_,
             turn.expectedArcMm() / controller::robot::kMmPerPulse, turn.maxVolts(), batteryVolts_,
             turn.crept() ? "sim" : "nao", lastMoveOk_ ? "ok" : lastMoveFailure_);
#endif
}

void Drv8833MotionAdapter::describeLastMove(char* out, size_t size) const {
    if (lastMoveWasTurn_) {
        std::snprintf(out, size, "enc E=%ld D=%ld V E=%.1f D=%.1f bat=%.1f giro=%.0f",
                      endLeftCount_, endRightCount_, endLeftVolts_, endRightVolts_, batteryVolts_,
                      lastTurnDeg_);
        return;
    }
    std::snprintf(out, size, "enc E=%ld D=%ld V E=%.1f D=%.1f bat=%.1f", endLeftCount_,
                  endRightCount_, endLeftVolts_, endRightVolts_, batteryVolts_);
}

// Curva de 90° em arco (controller/RobotMotion.hpp, kArcTurn): recua até a borda de entrada da
// célula, faz o quarto de círculo com as duas rodas para a frente e recua até o centro, já virado.
void Drv8833MotionAdapter::arcTurn(controller::PivotMove::Direction direction) {
    // Se a reta anterior parou antes pela parede da frente, o robô já está mais perto da borda de
    // entrada: recua só o que falta até ela.
    const double setback = std::max(0.0, controller::robot::kArcSetbackMm - lastShortMm_);
    lastShortMm_ = 0.0;
    if (setback > 1.0) {
        straight(-setback, "recuo antes da curva", false);
    }
    pivot(90.0, direction, controller::robot::kArcTurn);
    straight(-controller::robot::kArcSetbackMm, "recuo depois da curva", false);
}

void Drv8833MotionAdapter::turnLeft() { arcTurn(controller::PivotMove::Direction::Left); }

void Drv8833MotionAdapter::turnRight() { arcTurn(controller::PivotMove::Direction::Right); }

// Meia-volta: só num beco, sem outro jeito a não ser girar no lugar.
void Drv8833MotionAdapter::turnAround() {
    pivot(180.0, controller::PivotMove::Direction::Right, controller::robot::kPivotMove);
}

}  // namespace micromouse::adapters
