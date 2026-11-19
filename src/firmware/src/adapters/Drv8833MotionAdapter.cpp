#include "adapters/Drv8833MotionAdapter.hpp"
#include "domain/PivotClearance.hpp"
#include "domain/RobotGeometry.hpp"
#include "domain/SweptFootprint.hpp"
#include "domain/WallCentering.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>

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
// Rampa de tensão: depois de mais que isto sem comando o motor recomeça do zero; no 1º comando conta-se um
// passo de controle (10 ms).
constexpr double kSlewGapS = 0.1;
constexpr double kControlDtForRampS = 0.01;
constexpr char kShortOfCellFailure[] = "nao chegou ao fim da celula";
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
// Parado por mais que isto, o robô foi mexido à mão: o erro de rumo acumulado não vale mais.
constexpr int64_t kHeadingStaleUs = 4'000'000;
// Ajuste fino depois do arco (18/11): o freio é fixo, mas a inércia varia de 0,3 a 4 graus, e o arco
// terminava 1 a 4 graus curto (D2: 86,1 / -86,2 / 88,9). Se faltar de 1 a 8 graus, gira o resto no
// lugar, devagar (o canto da frente varre ~7 mm em 4 graus).
constexpr double kTrimMinDeg = 1.0;
constexpr double kTrimMaxDeg = 8.0;
constexpr double kTrimMaxDegPerS = 45.0;
constexpr double kTrimMaxDegPerS2 = 300.0;
constexpr double kTrimToleranceDeg = 0.5;
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
    double worstDt_{0.0};

public:
    double tick() {
        const int64_t now = esp_timer_get_time();
        const double dt = static_cast<double>(now - lastUs_) * 1e-6;
        lastUs_ = now;
        worstDt_ = std::max(worstDt_, dt);
        return std::clamp(dt, kMinDtS, kMaxDtS);
    }
    // A volta mais demorada do laço, SEM o limite: em 11/11 um ToF sem resposta levou cada volta
    // da reta de ~2 ms para ~20 ms e nada no log mostrava.
    [[nodiscard]] double worstMs() const { return worstDt_ * 1000.0; }
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
    // Rampa de tensão (soft-start): o degrau do atrito estático nas duas rodas é um pico de corrente que
    // derrubava a alimentação na partida. Um intervalo longo sem comandos (robô parado) recomeça do zero.
    const int64_t nowUs = esp_timer_get_time();
    const double dtS = static_cast<double>(nowUs - lastDriveUs_) / 1e6;
    lastDriveUs_ = nowUs;
    leftSlew_.setRamp(calibration_.voltageRampVPerS);
    rightSlew_.setRamp(calibration_.voltageRampVPerS);
    if (dtS > kSlewGapS) {
        leftSlew_.reset();
        rightSlew_.reset();
    }
    leftVolts = leftSlew_.step(leftVolts, dtS > kSlewGapS ? kControlDtForRampS : dtS);
    rightVolts = rightSlew_.step(rightVolts, dtS > kSlewGapS ? kControlDtForRampS : dtS);
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
        // Desconta o desvio medido em repouso e corrige a escala do chip (`calib escala_giro`).
        lastGyroRate_ = (*rate - gyroBias_) * calibration_.gyroScale;
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

double Drv8833MotionAdapter::gyroRestRate(int samples) { return measureGyroRest(samples).mean; }

Drv8833MotionAdapter::GyroRest Drv8833MotionAdapter::measureGyroRest(int samples) {
    double sum = 0.0;
    GyroRest rest{0.0, 0.0, 0.0, 0, 0};
    for (int i = 0; i < samples; ++i) {
        if (const std::optional<double> rate = imu_.readGyroZDegPerSec()) {
            sum += *rate;
            rest.min = rest.valid == 0 ? *rate : std::min(rest.min, *rate);
            rest.max = rest.valid == 0 ? *rate : std::max(rest.max, *rate);
            ++rest.valid;
        } else {
            ++rest.missed;
        }
        vTaskDelay(kControlPeriod);
    }
    rest.mean = rest.valid > 0 ? sum / rest.valid : 0.0;
    return rest;
}

bool Drv8833MotionAdapter::calibrateGyro(int samples, bool quiet) {
    const GyroRest rest = measureGyroRest(samples);
    const bool still = rest.valid * 2 >= samples &&
                       rest.max - rest.min <= controller::robot::kGyroRestMaxSpreadDps &&
                       std::fabs(rest.mean) <= controller::robot::kGyroRestMaxBiasDps;
    if (still) {
        gyroBias_ = rest.mean;
        gyroBiasMeasured_ = true;
    }
    if (quiet) {
        return still;
    }
    if (still) {
        ESP_LOGI("giro",
                 "giroscopio em repouso: %.3f graus/s (min %.2f max %.2f, %d leituras, %d "
                 "perdidas): descontado a partir de agora",
                 rest.mean, rest.min, rest.max, rest.valid, rest.missed);
    } else {
        ESP_LOGW("giro",
                 "giroscopio em repouso: %.3f graus/s (min %.2f max %.2f, %d leituras, %d "
                 "perdidas): NAO usado, o robo se mexeu ou o valor esta fora do normal; continua "
                 "valendo %.3f (%s)",
                 rest.mean, rest.min, rest.max, rest.valid, rest.missed, gyroBias_,
                 gyroBiasMeasured_ ? "medido antes" : "nunca medido");
    }
    return still;
}

void Drv8833MotionAdapter::readEncoders(long& left, long& right) const {
    left = encoders_.left();
    right = encoders_.right();
}

void Drv8833MotionAdapter::resetEncoders() { encoders_.reset(); }

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
        if (aborted()) {
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
    clearLastMove();
}

// ---- Testes de hardware (12/11): só nos builds de teste, com o robô SUSPENSO ----
namespace {
// Uma roda sozinha: da tensão em que ela parte até a velocidade em dois patamares.
constexpr double kSweepFirstVolts = 0.6;
constexpr double kSweepStepVolts = 0.2;
constexpr double kSweepLastVolts = 4.0;
constexpr uint32_t kSweepStepMs = 150;
constexpr long kSweepMovedPulses = 8;  // pulsos num degrau para dizer que a roda partiu
constexpr double kSweepPlateauVolts[2] = {3.0, 6.0};
constexpr uint32_t kSweepPlateauMs = 700;
constexpr uint32_t kSweepMeasureMs = 400;  // a velocidade é medida no fim do patamar
// Limites do veredito. *** Referências iniciais, NÃO calibradas: servem para apontar uma roda
// muito diferente da outra (roda prendendo, motor fraco, fio solto), não para aprovar o robô. ***
constexpr double kSweepMaxStartVolts = 3.5;      // o controle empurra com 2,5 V para sair do lugar
constexpr double kSweepMaxStartSpread = 1.0;     // V entre a que parte mais fácil e a mais dura
constexpr double kSweepMaxSpeedSpread = 0.25;    // diferença entre a mais rápida e a mais lenta
constexpr long kSweepMaxOtherWheelPulses = 20;   // pulsos da roda que devia estar parada
}  // namespace

void Drv8833MotionAdapter::wheelTest(bool left, bool right, double volts, uint32_t ms) {
    clearLastMove();
    encoders_.reset();
    const char* which = left && right ? "E+D" : left ? "E" : "D";
    const int64_t start = esp_timer_get_time();
    int64_t nextLog = start + 100000;
    long lastLeft = 0;
    long lastRight = 0;
    long stepLeft = 0;
    long stepRight = 0;
    double ampsSum = 0.0;
    double ampsMax = 0.0;
    int ampsCount = 0;
    double minBattery = 99.0;
    bool stopped = false;
    while (true) {
        const int64_t now = esp_timer_get_time();
        const double elapsedMs = static_cast<double>(now - start) / 1000.0;
        if (elapsedMs >= ms) {
            break;
        }
        if (aborted()) {
            stopped = true;
            break;
        }
        const double ramp = std::min(elapsedMs / 80.0, 1.0);
        drive(left ? ramp * volts : 0.0, right ? ramp * volts : 0.0);
        if (now >= nextLog) {
            const long leftCount = encoders_.left();
            const long rightCount = encoders_.right();
            stepLeft = leftCount - lastLeft;
            stepRight = rightCount - lastRight;
            lastLeft = leftCount;
            lastRight = rightCount;
            double amps = 0.0;
            double battery = 0.0;
            if (power_ != nullptr) {
                amps = power_->currentA();
                battery = power_->busVoltageV();
                ampsSum += amps;
                ampsMax = std::max(ampsMax, amps);
                ++ampsCount;
                if (battery > 1.0) {
                    minBattery = std::min(minBattery, battery);
                }
            }
            ESP_LOGI("teste",
                     "motor %s t=%4.0f ms V=%.1f enc E=%ld D=%ld (em 100 ms: E=%ld D=%ld) I=%.2f A "
                     "bat=%.2f V",
                     which, elapsedMs, ramp * volts, leftCount, rightCount, stepLeft, stepRight,
                     amps, battery);
            nextLog += 100000;
        }
        vTaskDelay(kControlPeriod);
    }
    motors_.brake();
    vTaskDelay(pdMS_TO_TICKS(150));
    // Velocidade pelos últimos 100 ms: 10x os pulsos do intervalo.
    ESP_LOGI("teste",
             "motor fim: roda %s a %.1f V por %lu ms%s: enc E=%ld D=%ld, velocidade no fim E=%ld "
             "D=%ld pulsos/s (%.0f / %.0f mm/s), corrente media %.2f A max %.2f A, bateria minima "
             "%.2f V (%s)",
             which, volts, static_cast<unsigned long>(ms), stopped ? " (PARADO pelo operador)" : "",
             encoders_.left(), encoders_.right(), stepLeft * 10, stepRight * 10,
             mmFromPulses(stepLeft * 10), mmFromPulses(stepRight * 10),
             ampsCount > 0 ? ampsSum / ampsCount : 0.0, ampsMax,
             minBattery < 99.0 ? minBattery : 0.0, kMotorDecayName);
    clearLastMove();
}

void Drv8833MotionAdapter::wheelSweep() {
    clearLastMove();
    double fastest = 0.0;
    double slowest = 1e9;
    double worstStart = 0.0;
    double bestStart = 1e9;
    bool problem = false;
    bool stopped = false;
    char problems[160] = "";
    size_t problemsUsed = 0;
    auto addProblem = [&problems, &problemsUsed, &problem](const char* text) {
        problem = true;
        if (problemsUsed < sizeof problems) {
            const int n = std::snprintf(problems + problemsUsed, sizeof problems - problemsUsed,
                                        "%s%s", problemsUsed == 0 ? "" : "; ", text);
            problemsUsed += n > 0 ? static_cast<size_t>(n) : 0;
        }
    };
    // Dirige só a roda em teste e espera `ms`; devolve false se o operador mandou parar.
    auto run = [this](bool leftWheel, double volts, uint32_t ms) {
        const int64_t start = esp_timer_get_time();
        while (esp_timer_get_time() - start < static_cast<int64_t>(ms) * 1000) {
            if (aborted()) {
                return false;
            }
            drive(leftWheel ? volts : 0.0, leftWheel ? 0.0 : volts);
            vTaskDelay(kControlPeriod);
        }
        return true;
    };

    for (int wheel = 0; wheel < 2 && !stopped; ++wheel) {
        const bool leftWheel = wheel == 0;
        for (int way = 0; way < 2 && !stopped; ++way) {
            const double sign = way == 0 ? 1.0 : -1.0;
            auto own = [this, leftWheel]() {
                return leftWheel ? encoders_.left() : encoders_.right();
            };
            auto other = [this, leftWheel]() {
                return leftWheel ? encoders_.right() : encoders_.left();
            };
            encoders_.reset();

            // 1) Tensão de partida: sobe em degraus até a roda andar.
            double startVolts = -1.0;
            for (double volts = kSweepFirstVolts; volts <= kSweepLastVolts + 1e-6;
                 volts += kSweepStepVolts) {
                const long before = own();
                if (!run(leftWheel, sign * volts, kSweepStepMs)) {
                    stopped = true;
                    break;
                }
                if (std::labs(own() - before) >= kSweepMovedPulses) {
                    startVolts = volts;
                    break;
                }
            }

            // 2) Dois patamares: velocidade e corrente no fim de cada um.
            double pulsesPerS[2] = {0.0, 0.0};
            double amps[2] = {0.0, 0.0};
            for (int level = 0; level < 2 && !stopped; ++level) {
                const double volts = sign * kSweepPlateauVolts[level];
                if (!run(leftWheel, volts, kSweepPlateauMs - kSweepMeasureMs)) {
                    stopped = true;
                    break;
                }
                const long before = own();
                double ampsSum = 0.0;
                int ampsCount = 0;
                const int64_t start = esp_timer_get_time();
                const int64_t measureUs = static_cast<int64_t>(kSweepMeasureMs) * 1000;
                while (esp_timer_get_time() - start < measureUs) {
                    if (!run(leftWheel, volts, 20)) {
                        stopped = true;
                        break;
                    }
                    if (power_ != nullptr) {
                        ampsSum += power_->currentA();
                        ++ampsCount;
                    }
                }
                const double seconds =
                    static_cast<double>(esp_timer_get_time() - start) * 1e-6;
                pulsesPerS[level] =
                    seconds > 0.0 ? static_cast<double>(own() - before) / seconds : 0.0;
                amps[level] = ampsCount > 0 ? ampsSum / ampsCount : 0.0;
            }
            const long ownTotal = own();
            const long otherTotal = other();
            motors_.brake();
            vTaskDelay(pdMS_TO_TICKS(300));
            if (stopped) {
                break;
            }

            const bool signOk = static_cast<double>(ownTotal) * sign > 0.0;
            const bool otherOk = std::labs(otherTotal) <= kSweepMaxOtherWheelPulses;
            const double speed = std::fabs(pulsesPerS[1]);
            fastest = std::max(fastest, speed);
            slowest = std::min(slowest, speed);
            if (startVolts > 0.0) {
                worstStart = std::max(worstStart, startVolts);
                bestStart = std::min(bestStart, startVolts);
            }
            const char* wheelName = leftWheel ? "E" : "D";
            const char* wayName = way == 0 ? "frente" : "tras";
            char partText[24];
            if (startVolts > 0.0) {
                std::snprintf(partText, sizeof partText, "parte com %.1f V", startVolts);
            } else {
                std::snprintf(partText, sizeof partText, "NAO partiu ate %.1f V", kSweepLastVolts);
            }
            ESP_LOGI("teste",
                     "rodas: roda %s para %s: %s | 3 V: %.0f pulsos/s (%.0f mm/s) %.2f A | 6 V: "
                     "%.0f pulsos/s (%.0f mm/s) %.2f A | encoder: %ld pulsos, sentido %s | outra "
                     "roda: %ld pulsos%s",
                     wheelName, wayName, partText, pulsesPerS[0],
                     pulsesPerS[0] * controller::robot::kMmPerPulse, amps[0], pulsesPerS[1],
                     pulsesPerS[1] * controller::robot::kMmPerPulse, amps[1], ownTotal,
                     signOk ? "certo" : "ERRADO", otherTotal, otherOk ? "" : " (DEVIA ser ~0)");
            char text[48];
            if (ownTotal == 0) {
                std::snprintf(text, sizeof text, "roda %s %s: encoder nao contou", wheelName,
                              wayName);
                addProblem(text);
            } else if (!signOk) {
                std::snprintf(text, sizeof text, "roda %s %s: encoder invertido", wheelName,
                              wayName);
                addProblem(text);
            }
            if (!otherOk) {
                std::snprintf(text, sizeof text, "roda %s %s: a outra roda contou", wheelName,
                              wayName);
                addProblem(text);
            }
            // Com o encoder mudo não dá para saber se a roda partiu: o problema é o encoder.
            if (ownTotal != 0 && (startVolts < 0.0 || startVolts > kSweepMaxStartVolts)) {
                std::snprintf(text, sizeof text, "roda %s %s: partida dura", wheelName, wayName);
                addProblem(text);
            }
        }
    }
    motors_.brake();
    if (stopped) {
        ESP_LOGW("teste", "rodas: resumo: PARADO pelo operador antes do fim");
        clearLastMove();
        return;
    }
    const double spread = fastest > 0.0 ? (fastest - slowest) / fastest : 1.0;
    if (spread > kSweepMaxSpeedSpread) {
        addProblem("velocidades a 6 V muito diferentes");
    }
    if (bestStart < 1e8 && worstStart - bestStart > kSweepMaxStartSpread) {
        addProblem("uma roda parte bem mais dura que a outra");
    }
    // A lista vai numa linha própria, ANTES do resumo: junto com ele, a linha passava dos 320
    // caracteres da fila do BLE e saía cortada.
    if (problem) {
        ESP_LOGW("teste", "rodas: problemas: %s", problems);
    }
    ESP_LOGI("teste",
             "rodas: resumo: a 6 V de %.0f a %.0f pulsos/s (dif %.0f%%, limite %.0f%%); partida "
             "de %.1f a %.1f V (limites %.1f V e dif %.1f V); bat=%.2f V -> %s",
             slowest, fastest, spread * 100.0, kSweepMaxSpeedSpread * 100.0,
             bestStart < 1e8 ? bestStart : 0.0, worstStart, kSweepMaxStartVolts,
             kSweepMaxStartSpread, batteryVolts_,
             problem ? "PROBLEMA (ver a linha 'rodas: problemas' acima)" : "OK");
    clearLastMove();
}

void Drv8833MotionAdapter::encoderWatch(int seconds) {
    clearLastMove();
    motors_.coast();  // motores soltos, para girar a roda à mão (em qualquer modo de decay)
    encoders_.reset();
    for (int second = 1; second <= seconds; ++second) {
        const int64_t start = esp_timer_get_time();
        while (esp_timer_get_time() - start < 1000000) {
            if (aborted()) {
                second = seconds + 1;
                break;
            }
            vTaskDelay(pdMS_TO_TICKS(10));
        }
        if (second <= seconds) {
            ESP_LOGI("teste", "enc %d/%d s: E=%ld D=%ld", second, seconds, encoders_.left(),
                     encoders_.right());
        }
    }
    ESP_LOGI("teste",
             "enc fim: E=%ld D=%ld pulsos (uma volta da roda para a frente = +%d; para tras = -%d)",
             encoders_.left(), encoders_.right(), domain::robot::kCountsPerRevolution,
             domain::robot::kCountsPerRevolution);
    motors_.brake();
    clearLastMove();
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
    // O robô está parado esperando a manobra: mede e desconta o desvio do giroscópio (12/11).
    (void)calibrateGyro(100);
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
            pivot(90.0, Direction::Left, arcConfig());
            break;
        case Maneuver::ArcRight:
            pivot(90.0, Direction::Right, arcConfig());
            break;
        case Maneuver::PivotLeft:
            pivot(90.0, Direction::Left, pivotConfig());
            break;
        case Maneuver::PivotRight:
            pivot(90.0, Direction::Right, pivotConfig());
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

void Drv8833MotionAdapter::setCalibration(const domain::Calibration& calibration) noexcept {
    calibration_ = calibration;
    arcBrake_.reset(calibration_.arcBrakeDeg);
    pivotBrake_.reset(calibration_.pivotBrakeDeg);
    oneWheelBrake_.reset(calibration_.oneWheelBrakeDeg);
    // A faixa de início da curva com uma roda depende do corpo em uso: calcula agora (robô parado,
    // boot ou `calib`), não no meio da corrida.
    oneWheelTargetMm_ =
        calibration_.turnMode >= 0.5 ? domain::oneWheelStartTargetMm(calibration_) : -1.0;
}

double Drv8833MotionAdapter::arcBrakeDeg() const noexcept {
    return calibration_.autoBrake >= 0.5 ? arcBrake_.brakeDeg() : calibration_.arcBrakeDeg;
}

double Drv8833MotionAdapter::pivotBrakeDeg() const noexcept {
    return calibration_.autoBrake >= 0.5 ? pivotBrake_.brakeDeg() : calibration_.pivotBrakeDeg;
}

controller::PivotMoveConfig Drv8833MotionAdapter::arcConfig() const noexcept {
    controller::PivotMoveConfig config = controller::robot::kArcTurn;
    config.toleranceDeg = arcBrakeDeg();
    return config;
}

double Drv8833MotionAdapter::oneWheelBrakeDeg() const noexcept {
    return calibration_.autoBrake >= 0.5 ? oneWheelBrake_.brakeDeg() : calibration_.oneWheelBrakeDeg;
}

controller::PivotMoveConfig Drv8833MotionAdapter::oneWheelConfig() const noexcept {
    controller::PivotMoveConfig config = controller::robot::kOneWheelTurn;
    config.toleranceDeg = oneWheelBrakeDeg();
    return config;
}

controller::PivotMoveConfig Drv8833MotionAdapter::pivotConfig() const noexcept {
    controller::PivotMoveConfig config = controller::robot::kPivotMove;
    config.toleranceDeg = pivotBrakeDeg();
    return config;
}

double Drv8833MotionAdapter::arcStartFrontMm() const noexcept {
    const domain::BodyGeometry body{calibration_.axleToFrontMm, calibration_.frontWidthMm / 2.0,
                                    calibration_.axleToFrontTofMm};
    return domain::arcStartFrontMm(body, controller::robot::kArcSetbackMm,
                                   controller::robot::kArcFrontClearanceMm);
}

void Drv8833MotionAdapter::advanceCell() {
    // Depois de uma curva em arco o robô já está na borda de saída da célula: anda só o resto.
    const double distance = domain::robot::kCellSizeMm - aheadMm_;
    aheadMm_ = 0.0;
    straight(distance, "andar 1 celula", walls_ != nullptr && calibration_.centerOnWalls >= 0.5);
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
            if (reading->kind == drivers::ReadingKind::TooClose) {
                return Vl53l1xSensorAdapter::kFrontTooCloseMm;  // a parede está a menos disto
            }
            return std::nullopt;
        }
    }
    return std::nullopt;
}

void Drv8833MotionAdapter::dropStaleHeading() {
    if (esp_timer_get_time() - lastMoveEndUs_ > kHeadingStaleUs) {
        headingResidualDeg_ = 0.0;
    }
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
    [[maybe_unused]] bool poseValid = false;           // estimativa de pose lateral (item 4)
    [[maybe_unused]] double poseOffsetMm = 0.0;        // eixo para a direita do centro, mm
    double lastWallPoll = -kWallPollS;

    lastMoveName_ = name;
    lastMoveWasTurn_ = false;
    endLeftVolts_ = 0.0;
    endRightVolts_ = 0.0;
    lastShortMm_ = 0.0;
    double lastFrontPoll = -kWallPollS;
    // Última leitura válida do frontal nesta reta (-1 = nenhuma). Só o log usa.
    [[maybe_unused]] int frontMm = -1;
    double headingDeg = 0.0;  // giro do robô durante a reta, pelo giroscópio
    dropStaleHeading();
    gyroMisses_ = 0;
    lastGyroRate_ = 0.0;
    // Os ToF laterais são lidos na reta mesmo sem o RF-44, só para o log (a última leitura de cada
    // lado diz se o robô chegou centrado). Com o RF-44, quem lê é ele.
    // `tof_na_reta=0`: não lê os ToF durante a reta (nem laterais nem frontal), só nas paradas (19/11).
    const bool readTofInStraight = calibration_.tofInStraight >= 0.5;
    const Vl53l1xSensorAdapter* sides = !readTofInStraight ? nullptr : (walls_ != nullptr ? walls_ : front_);
#if CONFIG_RATO_LOG_RETA
    // Erros de I²C e leituras puladas de cada ToF ANTES da reta, para logar só os desta reta.
    using TofSide = Vl53l1xSensorAdapter::Side;
    constexpr TofSide kTofSides[3] = {TofSide::Left, TofSide::Front, TofSide::Right};
    unsigned tofErrorsBefore[3] = {0, 0, 0};
    unsigned tofSkippedBefore[3] = {0, 0, 0};
    if (front_ != nullptr) {
        for (int i = 0; i < 3; ++i) {
            const Vl53l1xSensorAdapter::Health health = front_->health(kTofSides[i]);
            tofErrorsBefore[i] = health.i2cErrors;
            tofSkippedBefore[i] = health.skippedReads;
        }
    }
    const int gyroMissesBefore = gyroMissesTotal_;
#endif

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
        if (domain::headingLost(headingDeg, controller::robot::kMaxHeadingErrorDeg)) {
            lastMoveOk_ = false;
            // Para na hora (sem recentralizar: girar de volta num corredor de ~26 mm de folga
            // raspa na parede) e leva ao Erro com o desvio no motivo.
            std::snprintf(headingFailure_, sizeof headingFailure_,
                          "rumo perdido: desviou %.0f graus na reta (parede?)", headingDeg);
            lastMoveFailure_ = headingFailure_;
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
                // Pose lateral do EIXO (19/11): desconta o rumo (os ToF ficam ~59 mm à frente do eixo)
                // e desliga se o rumo for grande. Nunca usa leitura inválida nem 0 mm.
                const domain::LateralPose pose = domain::estimateLateralPose(
                    leftWall, rightWall, headingResidualDeg_ + headingDeg,
                    domain::robot::lateralPoseConfig(calibration_));
                poseValid = pose.valid;
                poseOffsetMm = pose.rightOffsetMm;
                wallMm = domain::lateralCorrectionPulses(pose, domain::robot::kWallCentering) *
                         controller::robot::kMmPerPulse;
            }
        }

        // Parada pela parede da frente: só para a frente, depois de meia reta.
        const double travelled = 0.5 * (leftMm + rightMm);
        if (readTofInStraight && !suppressFrontStop_ && sign > 0.0 && front_ != nullptr &&
            now - lastFrontPoll >= kWallPollS &&
            travelled > 0.5 * std::fabs(distanceMm)) {
            lastFrontPoll = now;
            if (const auto reading = front_->freshReading(Vl53l1xSensorAdapter::Side::Front);
                reading && (reading->kind == drivers::ReadingKind::Distance ||
                            reading->kind == drivers::ReadingKind::TooClose)) {
                frontMm = reading->mm;
                // "Muito perto" (< 40 mm, parede encostada) também para a reta.
                if (reading->kind == drivers::ReadingKind::TooClose ||
                    reading->mm < calibration_.frontStopMm) {
                    lastShortMm_ = std::max(0.0, std::fabs(distanceMm) - travelled);
                    ++frontStops_;
                    break;
                }
            }
        }

        // Rumo pelo giroscópio (`calib ganho_rumo`, 0 = desligado): o robô girado para a esquerda
        // (ângulo positivo) recebe uma correção para a direita, e vice-versa. Só para a frente; o
        // limite impede que uma leitura ruim torça o robô.
        const double headingMm =
            sign > 0.0 ? std::clamp(-calibration_.headingGain * (headingResidualDeg_ + headingDeg),
                                    -controller::robot::kHeadingHoldMaxMm,
                                    controller::robot::kHeadingHoldMaxMm)
                       : 0.0;
        const controller::StraightMove::Output out =
            move.step(dt, leftMm, rightMm, leftSpeed.update(leftMm, now),
                      rightSpeed.update(rightMm, now), wallMm + headingMm);
        if (out.done) {
            if (!move.reachedTarget()) {
                lastMoveOk_ = false;
                lastMoveFailure_ = kShortOfCellFailure;
            }
            break;
        }
        drive(sign * out.leftVolts, sign * out.rightVolts);
        vTaskDelay(kControlPeriod);
    }
    stopAndSettle();
    if (sign > 0.0 && lastMoveOk_) {
        headingResidualDeg_ += headingDeg;  // o que a reta girou, com a correção, entra na conta
    }
    lastMoveEndUs_ = esp_timer_get_time();
#if CONFIG_RATO_LOG_RETA
    const double loopMs = clock.elapsed() * 1000.0;
    const double worstLoopMs = clock.worstMs();
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
    if (centerOnWalls && walls_ != nullptr) {
        ESP_LOGI("reta", "pose lateral: eixo %s%.1f mm para a direita do centro, rumo %.1f graus, correcao %.1f mm",
                 poseValid ? "" : "(sem estimativa) ", poseOffsetMm, headingResidualDeg_ + headingDeg,
                 wallMm);
    }
    // Saúde do laço e dos sensores DURANTE a reta (12/11). O laço normal leva ~2,3 ms por volta;
    // uma volta de ~20 ms é um sensor I²C sem resposta. "pulou" = leituras não feitas porque o
    // sensor tinha acabado de falhar (ele fica em silêncio por 0,5 s).
    {
        unsigned errors[3] = {0, 0, 0};
        unsigned skipped[3] = {0, 0, 0};
        if (front_ != nullptr) {
            for (int i = 0; i < 3; ++i) {
                const Vl53l1xSensorAdapter::Health health = front_->health(kTofSides[i]);
                errors[i] = health.i2cErrors - tofErrorsBefore[i];
                skipped[i] = health.skippedReads - tofSkippedBefore[i];
            }
        }
        const int steps = move.steps();
        ESP_LOGI("reta",
                 "laco: %d voltas, media %.1f ms, pior %.1f ms | tof na reta: erros I2C E=%u F=%u "
                 "D=%u, pulou E=%u F=%u D=%u | giro: %d leituras perdidas, desvio descontado "
                 "%.2f graus/s%s",
                 steps, steps > 0 ? loopMs / steps : 0.0, worstLoopMs,
                 errors[0], errors[1], errors[2], skipped[0], skipped[1], skipped[2],
                 gyroMissesTotal_ - gyroMissesBefore, gyroBias_,
                 gyroBiasMeasured_ ? "" : " (nunca medido)");
    }
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
    dropStaleHeading();
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
    const double stopDeg = turn.angle();
#if CONFIG_RATO_LOG_RETA
    const double turnMs = clock.elapsed() * 1000.0;
    const double worstLoopMs = clock.worstMs();  // só as voltas da curva, sem a pausa do freio
#endif
    // A pausa com o freio também mede quanto o robô ainda gira depois de frear.
    const int64_t settleStart = esp_timer_get_time();
    clock.tick();
    while (esp_timer_get_time() - settleStart < static_cast<int64_t>(kSettleMs) * 1000) {
        vTaskDelay(kControlPeriod);
        turn.settle(gyroRate(), clock.tick());
    }
    lastTurnDeg_ = turn.angle();
    if (lastMoveOk_) {
        // Esquerda é ângulo positivo. O que faltou (ou passou) dos 90 graus fica como erro de rumo.
        const double target = direction == controller::PivotMove::Direction::Left ? degrees : -degrees;
        headingResidualDeg_ += lastTurnDeg_ - target;
    }
    lastMoveEndUs_ = esp_timer_get_time();
    // Autoajuste do freio (`calib autoajuste_freio=1`): só curvas de 90 graus que terminaram bem e
    // pelo giroscópio (sem "continuar devagar", que chega ao alvo quase parado).
    bool brakeLearned = false;
    if (calibration_.autoBrake >= 0.5 && lastMoveOk_ && degrees < 135.0 && !turn.crept()) {
        domain::BrakeLearner& learner = oneWheelActive_ ? oneWheelBrake_ : arc ? arcBrake_ : pivotBrake_;
        brakeLearned = learner.update(std::fabs(stopDeg), std::fabs(lastTurnDeg_));
    }
    (void)brakeLearned;
#if CONFIG_RATO_LOG_RETA
    if (calibration_.autoBrake >= 0.5) {
        ESP_LOGI("curva", "freio: esta curva freou %.1f graus antes do alvo e girou %.1f depois; %s "
                          "(proxima: arco %.1f, pivo %.1f)",
                 config.toleranceDeg, std::fabs(lastTurnDeg_) - std::fabs(stopDeg),
                 brakeLearned ? "aprendeu" : "nao usada no autoajuste", arcBrakeDeg(),
                 pivotBrakeDeg());
    }
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
    ESP_LOGI("curva", "laco: pior volta %.1f ms | giro: %d leituras perdidas no total, desvio "
                      "descontado %.2f graus/s%s",
             worstLoopMs, gyroMissesTotal_, gyroBias_,
             gyroBiasMeasured_ ? "" : " (nunca medido)");
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
void Drv8833MotionAdapter::trimArc(controller::PivotMove::Direction direction) {
    if (!lastMoveOk_) {
        return;
    }
    const double target =
        direction == controller::PivotMove::Direction::Left ? 90.0 : -90.0;
    const double error = target - lastTurnDeg_;  // > 0: falta girar para a esquerda
    if (std::fabs(error) < kTrimMinDeg || std::fabs(error) > kTrimMaxDeg) {
        return;
    }
    controller::PivotMoveConfig config = controller::robot::kPivotMove;
    config.limits = {kTrimMaxDegPerS, kTrimMaxDegPerS2};
    config.toleranceDeg = kTrimToleranceDeg;
#if CONFIG_RATO_LOG_RETA
    ESP_LOGI("curva", "ajuste fino depois do arco: faltaram %.1f graus", error);
#endif
    pivot(std::fabs(error),
          error > 0.0 ? controller::PivotMove::Direction::Left
                      : controller::PivotMove::Direction::Right,
          config);
    // O ajuste é um extra: se ele falhar (travou, tempo), a curva já estava feita e segue valendo.
    // Só a parada do operador continua cancelando.
    if (!aborted()) {
        lastMoveOk_ = true;
        lastMoveFailure_ = "";
        lastTurnJammed_ = false;
    }
}

// Curva fechada com UMA roda (item 1, 19/11): o eixo começa o giro `oneWheelTargetMm_` antes do centro
// da célula, pela ODOMETRIA (o ToF frontal lê perto do alcance mínimo ali), e o ToF só confirma
// quando a leitura é válida. A roda de dentro fica parada; o robô termina meia bitola além do centro
// e deslocado do eixo do corredor de saída (a centralização do item 4 corrige na reta seguinte).
void Drv8833MotionAdapter::oneWheelTurn(controller::PivotMove::Direction direction) {
    if (!lastMoveOk_) {
        return;
    }
    if (oneWheelTargetMm_ < 0.0) {
        lastMoveOk_ = false;
        lastMoveFailure_ = "curva com uma roda nao cabe com as medidas do corpo";
        return;
    }
    // Onde o eixo está agora em relação ao centro da célula (positivo = à frente): depois de um arco,
    // já passou do centro; depois de uma reta que parou pela parede da frente, está atrás dele.
    const double axleAheadMm = aheadMm_ - lastShortMm_;
    aheadMm_ = 0.0;
    lastShortMm_ = 0.0;
    const double backMm = axleAheadMm + oneWheelTargetMm_;
    if (std::fabs(backMm) > 3.0) {
        straight(-backMm, backMm > 0.0 ? "recuo antes da curva" : "avanco antes da curva", false);
    }
    // Confirmação pelo frontal quando ele tem distância válida: lê (parede - frente do ToF) no ponto
    // de partida. "Muito perto" vale como a leitura mínima, como no arco.
    if (lastMoveOk_ && front_ != nullptr) {
        const double expectedMm = domain::robot::kCorridorWidthMm / 2.0 + oneWheelTargetMm_ -
                                  calibration_.axleToFrontTofMm;
        domain::ArcStartConfig config = controller::robot::kArcStart;
        config.frontTargetMm = expectedMm;
        const std::optional<int> settled = settledFrontMm();
        const double fix =
            domain::arcStartCorrection(settled.has_value(), settled.value_or(0), config);
#if CONFIG_RATO_LOG_RETA
        ESP_LOGI("curva",
                 "uma roda: eixo comeca %.0f mm antes do centro, frontal esperado %.0f mm, lido %d "
                 "mm, ajuste %.0f mm; termina %.0f mm a frente e a %.0f mm do eixo da saida",
                 oneWheelTargetMm_, expectedMm, settled.value_or(-1), fix,
                 domain::oneWheelEnd(oneWheelTargetMm_).aheadOfCenterMm,
                 domain::oneWheelEnd(oneWheelTargetMm_).inwardOffsetMm);
#endif
        if (fix != 0.0) {
            straight(-fix, "ajuste antes da curva", false);
        }
    }
    if (!lastMoveOk_ && lastMoveFailure_ != nullptr &&
        std::strcmp(lastMoveFailure_, kShortOfCellFailure) == 0 && !aborted()) {
        // Sem espaço para recuar: gira no lugar, como o arco faz (andando antes até a faixa em que cabe).
        lastMoveOk_ = true;
        lastMoveFailure_ = "";
        pivotInBoxedCell(direction);
        aheadMm_ = 0.0;
        return;
    }
    oneWheelActive_ = true;
    pivot(90.0, direction, oneWheelConfig());
    oneWheelActive_ = false;
    trimArc(direction);
    if (lastMoveOk_) {
        aheadMm_ = domain::oneWheelEnd(oneWheelTargetMm_).aheadOfCenterMm;
    }
}

// Giro de 90 graus no lugar numa célula fechada (parede atrás e, em geral, na frente): o canto da frente
// (100 mm do eixo) e o de trás varrem o círculo, e o corredor tem só 84 mm de meio vão. Só cabe com o eixo
// 17 a 27,5 mm ATRÁS do centro (domain::planPivotInPlace). Onde o eixo está vem do frontal (parede
// a 84 mm do centro); sem leitura, supõe a traseira encostada na parede de trás. O reposicionamento
// é só pelos encoders (o frontal lê abaixo do mínimo ali). Se não cabe (frente do CAD), avisa e gira
// como antes.
void Drv8833MotionAdapter::pivotInBoxedCell(controller::PivotMove::Direction direction) {
    constexpr double kHalfCorridorMm = domain::robot::kCorridorWidthMm / 2.0;
    const std::optional<int> settled = settledFrontMm();
    const bool frontWall =
        settled.has_value() && static_cast<double>(*settled) < controller::robot::kArcFrontWallMaxMm;
    const double axleMm = frontWall ? kHalfCorridorMm - calibration_.axleToFrontTofMm - *settled
                                    : -(kHalfCorridorMm - domain::robot::kAxleToRearMm);
    const domain::CellWalls walls{frontWall, true, false, false};
    const domain::PivotPlan plan = domain::planPivotInPlace(
        calibration_, direction == controller::PivotMove::Direction::Left, walls, axleMm);
#if CONFIG_RATO_LOG_RETA
    const char* planName = plan.action == domain::PivotAction::PivotNow        ? "gira ja"
                           : plan.action == domain::PivotAction::MoveThenPivot ? "anda e gira"
                                                                               : "NAO CABE";
    ESP_LOGI("curva", "giro em celula fechada: eixo a %.0f mm do centro (%s), plano %s, mover %.0f mm, alvo %.0f mm",
             axleMm, frontWall ? "frontal" : "supondo a traseira na parede", planName, plan.moveMm,
             plan.targetMm);
#endif
    if (plan.action == domain::PivotAction::MoveThenPivot && std::fabs(plan.moveMm) > 2.0) {
        suppressFrontStop_ = true;
        straight(plan.moveMm, plan.moveMm > 0.0 ? "avanco para girar" : "recuo para girar", false);
        suppressFrontStop_ = false;
    }
    if (lastMoveOk_ && !aborted()) {
        pivot(90.0, direction, pivotConfig());
    }
}

void Drv8833MotionAdapter::arcTurn(controller::PivotMove::Direction direction) {
    if (calibration_.turnMode >= 0.5) {
        oneWheelTurn(direction);
        return;
    }
    // Recua a meia célula inteira, mesmo se a reta anterior parou antes pela parede da frente: com
    // o eixo atrás do centro, o arco tem espaço no canto (V3b de 09/11).
    lastShortMm_ = 0.0;
    positionForArc(arcStartFrontMm());
    // Sem espaço para recuar (a traseira encostou na parede de trás: A1 virado para A2, 18/11), o
    // arco não cabe. Em vez de falhar, o robô gira no lugar, que não precisa de recuo, e segue.
    if (!lastMoveOk_ && lastMoveFailure_ != nullptr &&
        std::strcmp(lastMoveFailure_, kShortOfCellFailure) == 0 && !aborted()) {
#if CONFIG_RATO_LOG_RETA
        ESP_LOGW("curva", "sem espaco para recuar antes do arco: gira no lugar");
#endif
        lastMoveOk_ = true;
        lastMoveFailure_ = "";
        pivotInBoxedCell(direction);
        aheadMm_ = 0.0;
        return;
    }
    pivot(90.0, direction, arcConfig());
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
        undoFailure_[0] = '\0';
        if (!undoArc(direction)) {
            lastMoveOk_ = false;
            // Um desfazer que falhou diz por quê; parada do operador ou giroscópio mantêm o motivo.
            lastMoveFailure_ = undoFailure_[0] != '\0' ? undoFailure_ : firstFailure;
            lastMoveName_ = "curva de 90 graus em arco";
            lastMoveWasTurn_ = true;
            break;
        }
        positionForArc(arcStartFrontMm() +
                       attempt * controller::robot::kArcRetryExtraFrontMm);
#if CONFIG_RATO_LOG_RETA
        ESP_LOGW("curva", "tentativa %d do arco (a anterior: %s)", attempt + 1, firstFailure);
#endif
        pivot(90.0, direction, arcConfig());
    }
    trimArc(direction);
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
    bool frontTooClose = false;
    double frontMm = 0.0;
    if (front_ != nullptr) {
        const auto reading = front_->reading(Vl53l1xSensorAdapter::Side::Front);
        frontValid = reading.kind == drivers::ReadingKind::Distance;
        frontTooClose = reading.kind == drivers::ReadingKind::TooClose;
        frontMm = static_cast<double>(reading.mm);
    }
    const domain::ArcStart start = frontTooClose ? domain::arcStartTooClose(config)
                                                 : domain::arcStart(frontValid, frontMm, config);
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
    // O arco travou em `lastTurnDeg_` (com o sinal do giroscópio). Volta de ré pelo mesmo caminho
    // (controller::ArcUndo) até o giroscópio marcar ~0, acompanhando o progresso medido: sem
    // progresso (robô preso ou segurado, rodas patinando) para na hora, em vez de girar as rodas
    // até o tempo limite. Os encoders não servem aqui: as rodas patinaram.
    const double startAngle = lastTurnDeg_;
    controller::ArcUndo undo(startAngle, direction == controller::PivotMove::Direction::Right);
    controller::ArcUndo::State state = controller::ArcUndo::State::Running;
    encoders_.reset();
    gyroMisses_ = 0;
    LoopClock clock;
    while (state == controller::ArcUndo::State::Running) {
        const double dt = clock.tick();
        if (aborted()) {
            break;
        }
        const double rate = gyroRate();
        if (gyroLost()) {
            break;
        }
        const controller::ArcUndo::Output out = undo.step(dt, rate);
        state = out.state;
        if (state == controller::ArcUndo::State::Running) {
            drive(out.leftVolts, out.rightVolts);
            vTaskDelay(kControlPeriod);
        }
    }
    stopAndSettle();
    const bool back = state == controller::ArcUndo::State::Done;
#if CONFIG_RATO_LOG_RETA
    ESP_LOGW("curva", "desfez o arco: de %.1f para %.1f graus em %.0f ms, enc E=%ld D=%ld %s",
             startAngle, undo.angle(), clock.elapsed() * 1000.0, endLeftCount_, endRightCount_,
             back ? "ok" : "NAO voltou");
#endif
    if (!back && lastMoveOk_) {
        // Falha segura e explícita: o robô fica parado e torto, e a corrida vai ao Erro com o motivo.
        const char* why = state == controller::ArcUndo::State::NoProgress
                              ? "sem progresso (preso, segurado ou rodas patinando)"
                              : "tempo esgotado";
        std::snprintf(undoFailure_, sizeof undoFailure_,
                      "curva travada e o desfazer nao voltou: %s, robo torto em %d graus", why,
                      static_cast<int>(undo.angle()));
    }
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
    pivot(180.0, controller::PivotMove::Direction::Right, pivotConfig());
}

}  // namespace micromouse::adapters
