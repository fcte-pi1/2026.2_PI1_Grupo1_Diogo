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
// Os limites de cada tipo de movimento ficam em controller/RobotMotion.hpp (k*TimeoutS).
constexpr char kTimeoutFailure[] = "tempo de 3 s esgotado";
constexpr char kArcTimeoutFailure[] = "tempo de 4,5 s esgotado";
constexpr char kStallFailure[] = "curva travada";
constexpr char kGyroFailure[] = "giroscopio sem leitura";
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
// Espera por uma medida nova do ToF frontal com o robô parado (ele mede a cada 50 ms, com 50 ms de
// medida: 150 ms cobre o pior caso, como no sense() do adaptador dos ToF).
constexpr uint32_t kFrontFreshTimeoutMs = 150;

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

double Drv8833MotionAdapter::gyroRate() {
    if (const std::optional<double> rate = imu_.readGyroZDegPerSec()) {
        gyroMisses_ = 0;
        lastGyroRate_ = *rate;
    } else {
        ++gyroMisses_;
        ++gyroMissesTotal_;
    }
    return lastGyroRate_;
}

bool Drv8833MotionAdapter::gyroLost() {
    if (gyroMisses_ < controller::robot::kMaxGyroMisses) {
        return false;
    }
    lastMoveOk_ = false;
    lastMoveFailure_ = kGyroFailure;
    return true;
}

double Drv8833MotionAdapter::gyroRestRate(int samples) {
    double sum = 0.0;
    int valid = 0;
    for (int i = 0; i < samples; ++i) {
        if (const std::optional<double> rate = imu_.readGyroZDegPerSec()) {
            sum += *rate;
            ++valid;
        }
        vTaskDelay(kControlPeriod);
    }
    return valid > 0 ? sum / valid : 0.0;
}

void Drv8833MotionAdapter::logTofAfter(const char* what) const {
#if CONFIG_RATO_LOG_RETA
    if (front_ == nullptr) {
        return;
    }
    using Side = Vl53l1xSensorAdapter::Side;
    const auto tof = front_->settledReadings();
    ESP_LOGI("tof", "%s: E=%d (%s) F=%d (%s) D=%d (%s)", what, tof[0].mm,
             front_->statusText(Side::Left), tof[1].mm, front_->statusText(Side::Front), tof[2].mm,
             front_->statusText(Side::Right));
#else
    (void)what;
#endif
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

void Drv8833MotionAdapter::testManeuver(Maneuver maneuver) {
    using Direction = controller::PivotMove::Direction;
    clearLastMove();
    lastShortMm_ = 0.0;
    // Manobra avulsa: o robô foi posto à mão, e a última leitura guardada dos ToF é de outro
    // lugar. A curva se posiciona pelo frontal, então lê de novo antes (10/11).
    if (front_ != nullptr) {
        (void)front_->settledReadings();
    }
    switch (maneuver) {
        case Maneuver::TurnLeft:
        case Maneuver::TurnRight:
            // Avulsa: depois do arco, volta ao centro da célula (na corrida, a reta seguinte anda
            // o resto).
            maneuver == Maneuver::TurnLeft ? turnLeft() : turnRight();
            if (aheadMm_ > 0.0) {
                straight(-aheadMm_, "volta ao centro", false);
                aheadMm_ = 0.0;
            }
            break;
        case Maneuver::ArcLeft:
            pivot(90.0, Direction::Left, controller::robot::kArcTurn);
            break;
        case Maneuver::ArcRight:
            pivot(90.0, Direction::Right, controller::robot::kArcTurn);
            break;
        case Maneuver::PivotLeft:
            pivot(90.0, Direction::Left, controller::robot::kPivotMove);
            break;
        case Maneuver::PivotRight:
            pivot(90.0, Direction::Right, controller::robot::kPivotMove);
            break;
        case Maneuver::Advance:
            advanceCell();
            break;
        case Maneuver::Reverse:
            reverseCell();
            break;
        case Maneuver::None:
            break;
    }
    ESP_LOGI("teste", "manobra %s: %s", lastMoveName_, lastMoveOk_ ? "ok" : lastMoveFailure_);
    clearLastMove();
}

void Drv8833MotionAdapter::advanceCell() {
    // Depois de uma curva em arco o robô já está na borda de saída da célula: anda só o resto.
    const double distance = domain::robot::kCellSizeMm - aheadMm_;
    aheadMm_ = 0.0;
    straight(distance, "andar 1 celula", walls_ != nullptr);
}

// Uma célula de ré, sem girar (saída de um beco). Sem o RF-44: os ToF laterais ficam à frente do
// eixo e, andando de ré, a correção por eles tende a oscilar. Se a reta anterior parou antes do
// centro pela parede da frente, o robô já está esse tanto para trás, e a ré desconta.
void Drv8833MotionAdapter::reverseCell() {
    const double distance = domain::robot::kCellSizeMm + aheadMm_ - lastShortMm_;
    aheadMm_ = 0.0;
    straight(-distance, "re de 1 celula", false);
}

std::optional<int> Drv8833MotionAdapter::settledFrontMm() const {
    if (front_ == nullptr) {
        return std::nullopt;
    }
    using Side = Vl53l1xSensorAdapter::Side;
    (void)front_->freshReading(Side::Front);  // a que já estava pronta pode ser do robô andando
    constexpr uint32_t kPollMs = 5;
    for (uint32_t waited = 0; waited < kFrontFreshTimeoutMs; waited += kPollMs) {
        vTaskDelay(pdMS_TO_TICKS(kPollMs));
        if (const auto reading = front_->freshReading(Side::Front)) {
            if (reading->kind == drivers::ReadingKind::Distance) {
                return reading->mm;
            }
            return std::nullopt;
        }
    }
    return std::nullopt;
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
    double headingDeg = 0.0;  // giro do robô durante a reta, pelo giroscópio
    gyroMisses_ = 0;
    lastGyroRate_ = 0.0;
    // Os ToF laterais são lidos na reta mesmo sem o RF-44, só para o log (a última leitura de cada
    // lado diz se o robô chegou centrado). Com o RF-44, quem lê é ele.
    const Vl53l1xSensorAdapter* sides = walls_ != nullptr ? walls_ : front_;

    LoopClock clock;
    while (true) {
        const double dt = clock.tick();
        const double now = clock.elapsed();
        if (aborted()) {
            break;
        }
        if (now > controller::robot::kStraightTimeoutS) {
            lastMoveOk_ = false;  // as rodas não levaram o robô ao fim no tempo
            lastMoveFailure_ = kTimeoutFailure;
            break;
        }
        headingDeg += gyroRate() * dt;
        if (gyroLost()) {
            break;
        }
        if (std::fabs(headingDeg) > controller::robot::kMaxHeadingErrorDeg) {
            lastMoveOk_ = false;
            lastMoveFailure_ = "rumo perdido";
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

        if (sides != nullptr && now - lastWallPoll >= kWallPollS) {
            lastWallPoll = now;
            using Side = Vl53l1xSensorAdapter::Side;
            auto refresh = [sides](Side side, domain::SideReading& out) {
                if (const auto reading = sides->freshReading(side)) {
                    out = {reading->kind == drivers::ReadingKind::Distance,
                           static_cast<double>(reading->mm)};
                }
            };
            refresh(Side::Left, leftWall);
            refresh(Side::Right, rightWall);
            if (centerOnWalls && walls_ != nullptr) {
                wallMm = domain::wallCenteringError(leftWall, rightWall,
                                                    domain::robot::kWallCentering) *
                         controller::robot::kMmPerPulse;
            }
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
                    ++frontStops_;
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
             "frente=%d mm parou antes=%.0f mm giro=%.1f lat E=%.0f D=%.0f %s",
             name, distanceMm, endLeftCount_, endRightCount_, mmFromPulses(endLeftCount_),
             mmFromPulses(endRightCount_), move.maxDifferenceMm(), move.lastDifferenceMm(),
             move.maxLeftVolts(), move.maxRightVolts(), move.saturatedSteps(), move.steps(),
             move.elapsed() * 1000.0, move.duration() * 1000.0, batteryVolts_, wallMm, frontMm,
             lastShortMm_, headingDeg, leftWall.valid ? leftWall.mm : -1.0,
             rightWall.valid ? rightWall.mm : -1.0, lastMoveOk_ ? "ok" : lastMoveFailure_);
    // Uma reta que falha: onde o robô ficou, pelos três ToF com ele parado.
    if (!lastMoveOk_) {
        logTofAfter("depois da reta que falhou");
    }
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
    const bool arc = config.turnRadiusMm > 0.0;
    lastMoveName_ = degrees > 135.0 ? "meia-volta"
                    : arc           ? "curva de 90 graus em arco"
                                    : "curva de 90 graus";
    lastMoveWasTurn_ = true;
    lastTurnJammed_ = false;
    endLeftVolts_ = 0.0;
    endRightVolts_ = 0.0;
    gyroMisses_ = 0;
    lastGyroRate_ = 0.0;
    const double timeoutS =
        arc ? controller::robot::kArcTimeoutS : controller::robot::kPivotTimeoutS;
    domain::TurnStallDetector stall(controller::robot::kTurnStall);
#if CONFIG_RATO_LOG_RETA
    // Ângulo a cada 100 ms, para ver ONDE a curva perde velocidade ou trava.
    constexpr int kTraceMax = 48;
    int trace[kTraceMax];
    int traceCount = 0;
    double nextTrace = 0.1;
#endif

    // O giroscópio decide o fim (07/11: pelos pulsos, com as rodas patinando, a curva "terminava"
    // com o robô parado). Sem girar (suspenso ou preso numa parede), quem para é a detecção de
    // curva travada, e a corrida vai a Erro (ou, no arco, à segunda tentativa).
    LoopClock clock;
    while (true) {
        const double dt = clock.tick();
        const double now = clock.elapsed();
        if (aborted()) {
            break;
        }
        if (now > timeoutS) {
            lastMoveOk_ = false;  // o giroscópio não confirmou a curva no tempo
            lastMoveFailure_ = arc ? kArcTimeoutFailure : kTimeoutFailure;
            lastTurnJammed_ = true;
            break;
        }
        const double leftMm = mmFromPulses(encoders_.left());
        const double rightMm = mmFromPulses(encoders_.right());
        const double rate = gyroRate();
        if (gyroLost()) {
            break;
        }
        const controller::PivotMove::Output out =
            turn.step(dt, rate, leftMm, rightMm, leftSpeed.update(leftMm, now),
                      rightSpeed.update(rightMm, now));
        if (out.done) {
            break;
        }
        if (stall.update(now, turn.angle())) {
            lastMoveOk_ = false;
            lastMoveFailure_ = kStallFailure;
            lastTurnJammed_ = true;
            break;
        }
#if CONFIG_RATO_LOG_RETA
        if (now >= nextTrace && traceCount < kTraceMax) {
            trace[traceCount++] = static_cast<int>(std::lround(turn.angle()));
            nextTrace += 0.1;
        }
#endif
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
        turn.settle(gyroRate(), clock.tick());
    }
    lastTurnDeg_ = turn.angle();
#if CONFIG_RATO_LOG_RETA
    // Calibração da curva (E1 do roteiro): "final" é o ângulo depois do freio; os pulsos contra os
    // esperados sem patinar mostram quanto as rodas patinaram, e "continuou" se o perfil acabou sem
    // o giroscópio chegar ao alvo.
    ESP_LOGI("curva",
             "alvo=%.0f parou=%.1f final=%.1f tempo=%.0f ms enc E=%ld D=%ld (esperado %.0f) "
             "V max=%.1f V fim E=%.1f D=%.1f bat=%.2f V continuou=%s giro perdido=%d %s",
             degrees, stopDeg, lastTurnDeg_, turnMs, endLeftCount_, endRightCount_,
             turn.expectedArcMm() / controller::robot::kMmPerPulse, turn.maxVolts(), endLeftVolts_,
             endRightVolts_, batteryVolts_, turn.crept() ? "sim" : "nao", gyroMisses_,
             lastMoveOk_ ? "ok" : lastMoveFailure_);
    char line[260];
    size_t used = 0;
    for (int i = 0; i < traceCount && used + 6 < sizeof line; ++i) {
        const int n = std::snprintf(line + used, sizeof line - used, "%s%d", i == 0 ? "" : " ",
                                    trace[i]);
        used += n > 0 ? static_cast<size_t>(n) : 0;
    }
    line[used < sizeof line ? used : sizeof line - 1] = '\0';
    ESP_LOGI("curva", "angulo a cada 100 ms: %s", line);
    logTofAfter(lastMoveOk_ ? "depois da curva" : "depois da curva que falhou");
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
// célula e faz o quarto de círculo com as duas rodas para a frente. O robô termina na borda de
// SAÍDA da célula, já virado, e NÃO recua: a reta seguinte (o Navigator sempre anda depois de
// virar) anda só o que falta até o centro da célula seguinte. Na corrida 14 de 09/11, o recuo
// depois da curva fazia o robô passar duas vezes pela ponta da parede B3/B4, e na segunda a roda
// traseira enganchou nela ("rumo perdido").
void Drv8833MotionAdapter::arcTurn(controller::PivotMove::Direction direction) {
    // Recua a meia célula inteira, mesmo se a reta anterior parou antes pela parede da frente: com
    // o eixo atrás do centro, o arco tem espaço no canto (V3b de 09/11).
    lastShortMm_ = 0.0;
    positionForArc(controller::robot::kArcStartFrontMm);
    pivot(90.0, direction, controller::robot::kArcTurn);
    // Segunda tentativa (10/11): um arco que trava (quina na parede) levava direto ao Erro, e a
    // corrida acabava ali. Agora o robô desfaz o que girou, começa um pouco mais longe da parede
    // da frente e tenta de novo; se travar outra vez, aí sim é Erro.
    for (int attempt = 1; attempt <= controller::robot::kArcRetries; ++attempt) {
        if (lastMoveOk_ || !lastTurnJammed_) {
            break;  // deu certo, ou falhou por outro motivo (operador, giroscópio)
        }
        const char* firstFailure = lastMoveFailure_;
        ++arcRetriesUsed_;
        lastMoveOk_ = true;
        lastMoveFailure_ = "";
        if (!undoArc(direction)) {
            lastMoveOk_ = false;
            lastMoveFailure_ = firstFailure;
            lastMoveName_ = "curva de 90 graus em arco";
            lastMoveWasTurn_ = true;
            break;
        }
        positionForArc(controller::robot::kArcStartFrontMm +
                       attempt * controller::robot::kArcRetryExtraFrontMm);
#if CONFIG_RATO_LOG_RETA
        ESP_LOGW("curva", "tentativa %d do arco (a anterior: %s)", attempt + 1, firstFailure);
#endif
        pivot(90.0, direction, controller::robot::kArcTurn);
    }
    if (lastMoveOk_) {
        // O arco de raio kArcSetbackMm leva o robô meia célula à frente na nova direção.
        aheadMm_ = controller::robot::kArcSetbackMm;
    }
}

void Drv8833MotionAdapter::positionForArc(double frontTargetMm) {
    // Com parede à frente NESTA célula, posiciona pelo frontal: recua (ou avança) até ele ler
    // `frontTargetMm`. Sem parede à frente (ou sem leitura), usa o recuo fixo. Uma parede no fim
    // da célula SEGUINTE (leitura acima de kArcFrontWallMaxMm) não conta: antes de 10/11 ela fazia
    // o robô avançar ~120 mm para dentro da célula seguinte antes do arco.
    domain::ArcStartConfig config = controller::robot::kArcStart;
    config.frontTargetMm = frontTargetMm;
    bool frontValid = false;
    double frontMm = 0.0;
    if (front_ != nullptr) {
        const auto reading = front_->reading(Vl53l1xSensorAdapter::Side::Front);
        frontValid = reading.kind == drivers::ReadingKind::Distance;
        frontMm = static_cast<double>(reading.mm);
    }
    const domain::ArcStart start = domain::arcStart(frontValid, frontMm, config);
    if (std::fabs(start.setbackMm) > 3.0) {
        straight(-start.setbackMm,
                 start.setbackMm > 0.0 ? "recuo antes da curva" : "avanco antes da curva", false);
    }
    // Confere a posição com uma medida nova, feita com o robô parado e já longe da parede, e
    // corrige uma vez. O arco tem 1 a 3 cm de folga: não pode depender de uma leitura só, feita a
    // 3-4 cm da parede (kArcStartToleranceMm em RobotMotion.hpp).
    if (start.byFrontWall && lastMoveOk_) {
        const std::optional<int> settled = settledFrontMm();
        const double fix =
            domain::arcStartCorrection(settled.has_value(), settled.value_or(0), config);
#if CONFIG_RATO_LOG_RETA
        ESP_LOGI("curva",
                 "inicio do arco: alvo %.0f mm, frontal %.0f mm na parada, %d mm depois do recuo, "
                 "ajuste %.0f mm",
                 frontTargetMm, frontMm, settled.value_or(-1), fix);
#endif
        if (fix != 0.0) {
            straight(-fix, "ajuste antes da curva", false);
        }
    } else {
#if CONFIG_RATO_LOG_RETA
        ESP_LOGI("curva",
                 "inicio do arco: sem parede a frente (frontal %.0f mm%s), recuo fixo %.0f mm",
                 frontMm, frontValid ? "" : ", invalido", start.setbackMm);
#endif
    }
}

bool Drv8833MotionAdapter::undoArc(controller::PivotMove::Direction direction) {
    // O arco travou em `lastTurnDeg_` (com o sinal do giroscópio). Volta de ré pelo mesmo caminho:
    // a roda de fora mais forte que a de dentro, até o giroscópio marcar ~0. Tensões fixas, sem
    // perfil: é uma manobra curta de recuperação, e os encoders não servem (as rodas patinaram).
    double angle = lastTurnDeg_;
    const double startAngle = angle;
    const bool right = direction == controller::PivotMove::Direction::Right;
    const double outer = -controller::robot::kArcUndoOuterVolts;
    const double inner = -controller::robot::kArcUndoInnerVolts;
    encoders_.reset();
    gyroMisses_ = 0;
    LoopClock clock;
    bool back = std::fabs(angle) <= controller::robot::kArcUndoDoneDeg;
    while (!back) {
        const double dt = clock.tick();
        if (aborted() || clock.elapsed() > controller::robot::kArcUndoTimeoutS) {
            break;
        }
        angle += gyroRate() * dt;
        if (gyroLost()) {
            break;
        }
        // Chegou perto de zero, ou passou para o outro lado.
        if (std::fabs(angle) <= controller::robot::kArcUndoDoneDeg || angle * startAngle < 0.0) {
            back = true;
            break;
        }
        drive(right ? outer : inner, right ? inner : outer);
        vTaskDelay(kControlPeriod);
    }
    stopAndSettle();
#if CONFIG_RATO_LOG_RETA
    ESP_LOGW("curva", "desfez o arco: de %.1f para %.1f graus em %.0f ms, enc E=%ld D=%ld %s",
             startAngle, angle, clock.elapsed() * 1000.0, endLeftCount_, endRightCount_,
             back ? "ok" : "NAO voltou");
#endif
    vTaskDelay(pdMS_TO_TICKS(kSettleMs));
    // Medida nova dos ToF com o robô parado: o reposicionamento para a nova tentativa usa o
    // frontal, e a última leitura guardada é de antes da curva.
    if (front_ != nullptr) {
        (void)front_->settledReadings();
    }
    logTofAfter("depois de desfazer o arco");
    return back && lastMoveOk_;
}

void Drv8833MotionAdapter::turnLeft() { arcTurn(controller::PivotMove::Direction::Left); }

void Drv8833MotionAdapter::turnRight() { arcTurn(controller::PivotMove::Direction::Right); }

// Meia-volta no lugar. O Navigator NÃO usa mais (10/11): num beco ele sai de ré (reverseCell). Com
// o eixo na traseira, as quinas da frente passam a ~100 mm do centro do giro e o corredor tem 84 mm
// livres para cada lado: o robô trava atravessado (beco A1, relato de 10/11; em 09/11 o giro de 90 graus no
// lugar já travava a 68-75 graus em A4). Só para área aberta.
void Drv8833MotionAdapter::turnAround() {
    pivot(180.0, controller::PivotMove::Direction::Right, controller::robot::kPivotMove);
}

}  // namespace micromouse::adapters
