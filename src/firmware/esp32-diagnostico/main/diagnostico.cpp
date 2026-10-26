// Firmware de diagnóstico do "Rato Borrachudo": um console na serial com um comando por
// componente, para a equipe de hardware testar peça por peça (documento 7.3, AP12).
//
// Usa os MESMOS adapters do firmware do robô: testar o hardware aqui também testa os
// drivers. Cada periférico só é iniciado no primeiro comando que o usa, então um
// componente ausente não impede o teste dos outros. Roteiro: ../../TESTES_HARDWARE.md

#include <cinttypes>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <optional>
#include <stdexcept>
#include <string>

#include "adapters/BleTelemetryAdapter.hpp"
#include "adapters/BoardPins.hpp"
#include "adapters/DipReaderAdapter.hpp"
#include "adapters/Encoders.hpp"
#include "adapters/I2cBus.hpp"
#include "adapters/Ina219.hpp"
#include "adapters/LocalInterfaceAdapter.hpp"
#include "adapters/MotorDriver.hpp"
#include "adapters/Mpu6050.hpp"
#include "adapters/Vl53l1xSensorAdapter.hpp"
#include "domain/ImuIdentity.hpp"
#include "driver/gpio.h"
#include "driver/i2c_master.h"
#include "esp_chip_info.h"
#include "esp_console.h"
#include "esp_flash.h"
#include "esp_idf_version.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"

using namespace micromouse;
namespace pins = micromouse::adapters::pins;

namespace {

// Endereços I²C da placa (4.3 - Projeto conceitual de hardware, §5.2).
constexpr uint16_t kAddrTofDefault = 0x29;  // VL53L1X antes do reendereçamento
constexpr uint16_t kAddrTofLeft = 0x30;
constexpr uint16_t kAddrTofFront = 0x31;
constexpr uint16_t kAddrTofRight = 0x32;
constexpr uint16_t kAddrIna219 = 0x40;
constexpr uint16_t kAddrMpu6050 = 0x68;
constexpr int kProbeTimeoutMs = 50;
constexpr int kStubMm = 9999;  // valor do stub do Vl53l1xSensorAdapter
// Potência até a qual os N20 (6 V) ficam na tensão nominal com a bateria 2S cheia (8,4 V).
constexpr double kPotenciaNominal = 0.7;

adapters::I2cBus gI2c;
adapters::Vl53l1xSensorAdapter gSensor;
adapters::Mpu6050 gImu;
adapters::Ina219 gPower;
adapters::LocalInterfaceAdapter gLocal;
adapters::DipReaderAdapter gDip;
adapters::MotorDriver gMotors;
adapters::Encoders gEncoders;
adapters::BleTelemetryAdapter gBle;

// Cada periférico é iniciado uma vez, no primeiro comando que o usa.
struct Started {
    bool sensor, imu, power, local, dip, motors, encoders, ble;
} gStarted{};

void ensureSensor() {
    if (!gStarted.sensor) {
        gSensor.begin(gI2c.handle());
        gStarted.sensor = true;
    }
}
void ensureImu() {
    if (!gStarted.imu) {
        gImu.begin(gI2c.handle());
        gStarted.imu = true;
    }
}
void ensurePower() {
    if (!gStarted.power) {
        gPower.begin(gI2c.handle());
        gStarted.power = true;
    }
}
void ensureLocal() {
    if (!gStarted.local) {
        gLocal.begin();
        gStarted.local = true;
    }
}
void ensureDip() {
    if (!gStarted.dip) {
        gDip.begin();
        gStarted.dip = true;
    }
}
void ensureMotors() {
    if (!gStarted.motors) {
        gMotors.begin();
        gStarted.motors = true;
    }
}
void ensureEncoders() {
    if (!gStarted.encoders) {
        gEncoders.begin();
        gStarted.encoders = true;
    }
}

int64_t nowUs() { return esp_timer_get_time(); }
void sleepMs(int ms) { vTaskDelay(pdMS_TO_TICKS(ms)); }

// --- Argumentos -------------------------------------------------------------

bool parseLong(const char* text, long min, long max, long& out) {
    char* end = nullptr;
    const long value = std::strtol(text, &end, 10);
    if (end == text || *end != '\0' || value < min || value > max) {
        std::printf("valor inválido: '%s' (esperado inteiro de %ld a %ld)\n", text, min, max);
        return false;
    }
    out = value;
    return true;
}

bool parseDouble(const char* text, double min, double max, double& out) {
    char* end = nullptr;
    const double value = std::strtod(text, &end);
    if (end == text || *end != '\0' || !(value >= min && value <= max)) {
        std::printf("valor inválido: '%s' (esperado número de %.1f a %.1f)\n", text, min, max);
        return false;
    }
    out = value;
    return true;
}

// Argumento opcional na posição `index`, com valor padrão.
bool optionalLong(int argc, char** argv, int index, long min, long max, long fallback,
                  long& out) {
    if (argc <= index) {
        out = fallback;
        return true;
    }
    return parseLong(argv[index], min, max, out);
}

// --- I²C ----------------------------------------------------------------------

bool probe(uint16_t address) {
    return i2c_master_probe(gI2c.handle(), address, kProbeTimeoutMs) == ESP_OK;
}

const char* knownDevice(uint16_t address) {
    switch (address) {
        case kAddrTofDefault: return "VL53L1X (endereço de fábrica)";
        case kAddrTofLeft: return "VL53L1X esquerdo";
        case kAddrTofFront: return "VL53L1X frontal";
        case kAddrTofRight: return "VL53L1X direito";
        case kAddrIna219: return "INA219";
        case kAddrMpu6050: return "MPU-6050";
        case 0x69: return "MPU-6050 com AD0 em nível alto";
        default: return "desconhecido";
    }
}

int cmdI2c(int /*argc*/, char** /*argv*/) {
    std::printf("Varredura do I2C (SDA=GPIO%d, SCL=GPIO%d):\n", pins::kI2cSda, pins::kI2cScl);
    // Cada endereço vazio gera um NACK, que o driver registraria como erro.
    esp_log_level_set("i2c.master", ESP_LOG_NONE);
    int found = 0;
    for (uint16_t address = 0x08; address < 0x78; ++address) {
        if (probe(address)) {
            std::printf("  0x%02X  %s\n", address, knownDevice(address));
            ++found;
        }
    }
    esp_log_level_set("i2c.master", ESP_LOG_WARN);
    std::printf("%d dispositivo(s). Esperados: 0x40 (INA219), 0x68 (MPU-6050) e os ToF "
                "(0x29 antes do reendereçamento; 0x30, 0x31, 0x32 depois).\n",
                found);
    if (found == 0) {
        std::printf("Nenhum: confira a alimentação (3V3 e GND), SDA/SCL trocados e os pull-ups.\n");
    }
    return 0;
}

// --- ToF (VL53L1X) -----------------------------------------------------------

struct TofLine {
    const char* name;
    gpio_num_t xshut;
};
constexpr TofLine kTofLines[] = {
    {"esquerdo", pins::kTofLeftXshut},
    {"frontal", pins::kTofFrontXshut},
    {"direito", pins::kTofRightXshut},
};

// Liga um sensor por vez pelo XSHUT e confere se ele responde no 0x29. Testa a fiação de
// cada XSHUT e de cada sensor, sem depender do driver (passo 1 do reendereçamento, #295).
int tofXshut() {
    esp_log_level_set("i2c.master", ESP_LOG_NONE);
    for (const TofLine& line : kTofLines) {
        gpio_set_direction(line.xshut, GPIO_MODE_OUTPUT);
        gpio_set_level(line.xshut, 0);
    }
    sleepMs(5);
    const bool anyWithAllOff = probe(kAddrTofDefault);
    int ok = 0;
    for (const TofLine& line : kTofLines) {
        gpio_set_level(line.xshut, 1);
        sleepMs(5);  // boot do VL53L1X: ~1,2 ms
        const bool answers = probe(kAddrTofDefault);
        std::printf("  %-9s XSHUT=GPIO%-2d  %s\n", line.name, line.xshut,
                    answers ? "responde em 0x29  OK" : "NÃO responde em 0x29");
        ok += answers ? 1 : 0;
        gpio_set_level(line.xshut, 0);
        sleepMs(2);
    }
    esp_log_level_set("i2c.master", ESP_LOG_WARN);
    if (anyWithAllOff) {
        std::printf("Atenção: algo responde em 0x29 com todos os XSHUT em 0. Um XSHUT está "
                    "solto ou ligado direto ao 3V3.\n");
    }
    std::printf("%d de 3 sensores responderam.\n", ok);
    gStarted.sensor = false;  // o próximo `tof` refaz o reendereçamento
    return ok == 3 && !anyWithAllOff ? 0 : 1;
}

int cmdTof(int argc, char** argv) {
    if (argc >= 2 && std::strcmp(argv[1], "xshut") == 0) {
        return tofXshut();
    }
    long samples = 0;
    if (!optionalLong(argc, argv, 1, 1, 1000, 20, samples)) return 1;
    ensureSensor();
    std::printf("esquerdo  frontal  direito (mm)  paredes E/F/D\n");
    for (long i = 0; i < samples; ++i) {
        const int left = gSensor.rangeLeftMm();
        const int front = gSensor.rangeFrontMm();
        const int right = gSensor.rangeRightMm();
        if (i == 0 && left == kStubMm && front == kStubMm && right == kStubMm) {
            std::printf("Atenção: as leituras estão em STUB (9999). O driver do VL53L1X ainda "
                        "não foi implementado em Vl53l1xSensorAdapter.cpp. Use `tof xshut` "
                        "para testar a fiação.\n");
            return 1;
        }
        const ports::WallsAhead walls = gSensor.sense();
        std::printf("%8d %8d %8d       %c/%c/%c\n", left, front, right, walls.left ? 'S' : '-',
                    walls.front ? 'S' : '-', walls.right ? 'S' : '-');
        sleepMs(100);
    }
    return 0;
}

// --- IMU (MPU-6050) ------------------------------------------------------------

int cmdImu(int argc, char** argv) {
    long seconds = 0;
    if (!optionalLong(argc, argv, 1, 1, 60, 3, seconds)) return 1;
    ensureImu();
    const std::optional<uint8_t> id = gImu.whoAmI();
    if (!id) {
        std::printf("MPU-6050 não respondeu em 0x68. Rode `i2c` para ver o barramento.\n");
        return 1;
    }
    const domain::ImuModel model = domain::classifyImu(*id);
    std::printf("WHO_AM_I = 0x%02X (%s)%s\n", *id, domain::imuModelName(model),
                domain::isSupportedImu(model)
                    ? ""
                    : ": modelo não aceito, o auto-teste do robô reprova");

    std::printf("Lendo o giro Z por %ld s. Parado: o ângulo deve ficar perto de 0. Gire o robô "
                "90° à mão: deve dar perto de ±90.\n",
                seconds);
    double angle = 0.0;
    double sum = 0.0;
    long count = 0;
    int64_t last = nowUs();
    int64_t nextPrint = last + 500000;
    const int64_t end = last + seconds * 1000000;
    while (nowUs() < end) {
        const double rate = gImu.gyroZDegPerSec();
        const int64_t now = nowUs();
        angle += rate * static_cast<double>(now - last) / 1e6;
        last = now;
        sum += rate;
        ++count;
        if (now >= nextPrint) {
            std::printf("  giro Z %8.2f °/s   ângulo %8.1f °\n", rate, angle);
            nextPrint += 500000;
        }
        sleepMs(5);
    }
    std::printf("Média do giro: %.3f °/s (com o robô parado, é o desvio a compensar). Ângulo "
                "final: %.1f °. Amostras: %ld.\n",
                count > 0 ? sum / count : 0.0, angle, count);
    return 0;
}

// --- Energia (INA219) -------------------------------------------------------------

int cmdIna(int argc, char** argv) {
    long samples = 0;
    if (!optionalLong(argc, argv, 1, 1, 1000, 10, samples)) return 1;
    ensurePower();
    if (!gPower.present()) {
        std::printf("INA219 não respondeu (ou não guardou a calibração) em 0x40.\n");
        return 1;
    }
    std::printf("tensão (V)  corrente (A)  potência (W). Compare com o multímetro.\n");
    for (long i = 0; i < samples; ++i) {
        std::printf("%9.3f %13.4f %12.3f\n", gPower.busVoltageV(), gPower.currentA(),
                    gPower.powerW());
        sleepMs(200);
    }
    return 0;
}

// --- Motores e encoders ------------------------------------------------------------

int cmdMotor(int argc, char** argv) {
    if (argc < 3) {
        std::printf("uso: motor <esq> <dir> [ms]   (potência de -1 a 1; padrão 1000 ms)\n");
        return 1;
    }
    double left = 0.0;
    double right = 0.0;
    long ms = 0;
    if (!parseDouble(argv[1], -1.0, 1.0, left) || !parseDouble(argv[2], -1.0, 1.0, right) ||
        !optionalLong(argc, argv, 3, 50, 5000, 1000, ms)) {
        return 1;
    }
    // Fração da tensão da bateria: com a 2S cheia (8,4 V), acima de 0.7 os N20 (6 V) recebem
    // mais que a tensão nominal.
    if (std::fabs(left) > kPotenciaNominal || std::fabs(right) > kPotenciaNominal) {
        std::printf("Atenção: acima de %.1f, com a bateria cheia (8,4 V), os motores N20 de 6 V "
                    "recebem mais que a tensão nominal. Use no máximo 2 s.\n",
                    kPotenciaNominal);
    }
    ensureMotors();
    ensureEncoders();
    gEncoders.reset();
    std::printf("Motores: esq %.2f, dir %.2f por %ld ms (depois freia)...\n", left, right, ms);
    gMotors.setNormalized(left, right);
    sleepMs(static_cast<int>(ms));
    gMotors.brake();
    const long countLeft = gEncoders.left();
    const long countRight = gEncoders.right();
    std::printf("Encoders: esq %ld, dir %ld pulsos (%.0f e %.0f pulsos/s).\n", countLeft,
                countRight, countLeft * 1000.0 / ms, countRight * 1000.0 / ms);
    std::printf("Com potência positiva, os dois devem contar para frente (positivo). Sinal "
                "trocado: inverta A/B do encoder ou os fios do motor.\n");
    return 0;
}

int cmdEnc(int argc, char** argv) {
    ensureEncoders();
    if (argc >= 2 && std::strcmp(argv[1], "zerar") == 0) {
        gEncoders.reset();
        std::printf("Encoders zerados.\n");
        return 0;
    }
    long seconds = 0;
    if (!optionalLong(argc, argv, 1, 1, 120, 5, seconds)) return 1;
    std::printf("Contagem por %ld s. Para aferir os pulsos por volta: `enc zerar`, gire a "
                "roda UMA volta à mão e rode `enc 1`.\n",
                seconds);
    for (long i = 0; i < seconds * 5; ++i) {
        std::printf("  esq %8ld   dir %8ld\n", gEncoders.left(), gEncoders.right());
        sleepMs(200);
    }
    return 0;
}

// --- Interface local ---------------------------------------------------------------

int cmdDip(int /*argc*/, char** /*argv*/) {
    ensureDip();
    const bool dip1 = gpio_get_level(pins::kDip1) == 0;
    const bool dip2 = gpio_get_level(pins::kDip2) == 0;
    const bool dip3 = gpio_get_level(pins::kDip3) == 0;
    std::printf("DIP 1 (GPIO%d): %s   DIP 2 (GPIO%d): %s   DIP 3 (GPIO%d): %s\n", pins::kDip1,
                dip1 ? "fechada" : "aberta", pins::kDip2, dip2 ? "fechada" : "aberta",
                pins::kDip3, dip3 ? "fechada" : "aberta");
    try {
        const domain::MazeSetup setup = gDip.read();
        const char* type = setup.type == domain::MazeType::Small4x4    ? "4x4"
                           : setup.type == domain::MazeType::Medium8x4 ? "8x4"
                                                                         : "12x4";
        std::printf("Labirinto %s (%d linhas x %d colunas), partida (%d, %d), objetivo (%d, %d).\n",
                    type, setup.rows, setup.columns, setup.start.row, setup.start.column,
                    setup.goal.row, setup.goal.column);
    } catch (const std::invalid_argument&) {
        std::printf("Combinação reservada (vias 1 e 2 fechadas): o robô sinaliza erro.\n");
        return 1;
    }
    return 0;
}

int cmdBotao(int argc, char** argv) {
    long seconds = 0;
    if (!optionalLong(argc, argv, 1, 1, 120, 10, seconds)) return 1;
    ensureLocal();
    std::printf("Aperte o botão (GPIO%d) nos próximos %ld s...\n", pins::kButton, seconds);
    bool pressed = gLocal.buttonPressed();
    if (pressed) {
        std::printf("Atenção: o botão já começa pressionado (fio em curto com o GND?).\n");
    }
    int presses = 0;
    const int64_t end = nowUs() + seconds * 1000000;
    while (nowUs() < end) {
        const bool now = gLocal.buttonPressed();
        if (now != pressed) {
            pressed = now;
            if (now) ++presses;
            std::printf("  %s\n", now ? "pressionado" : "solto");
        }
        sleepMs(10);
    }
    std::printf("%d toque(s).\n", presses);
    return 0;
}

int cmdLed(int argc, char** argv) {
    ensureLocal();
    const char* option = argc >= 2 ? argv[1] : "";
    if (std::strcmp(option, "pronto") == 0) {
        gpio_set_level(pins::kLedReady, 1);
    } else if (std::strcmp(option, "erro") == 0) {
        gpio_set_level(pins::kLedError, 1);
    } else if (std::strcmp(option, "apagar") == 0) {
        gpio_set_level(pins::kLedReady, 0);
        gpio_set_level(pins::kLedError, 0);
    } else {
        std::printf("uso: led pronto | erro | apagar\n");
        return 1;
    }
    return 0;
}

// buzzer [ms | pronto | objetivo | alarme]: sem nome, um tom de 2,5 kHz por ms; com o nome, o
// padrão que o robô toca (#392). O buzzer é passivo e o pino é do LEDC.
int cmdBuzzer(int argc, char** argv) {
    ensureLocal();
    constexpr domain::BuzzerPattern kPatterns[] = {domain::BuzzerPattern::Ready,
                                                   domain::BuzzerPattern::Goal,
                                                   domain::BuzzerPattern::Alarm};
    if (argc >= 2) {
        for (const domain::BuzzerPattern pattern : kPatterns) {
            if (std::strcmp(argv[1], domain::patternName(pattern)) == 0) {
                const uint32_t duration = domain::patternDurationMs(pattern);
                std::printf("Padrão \"%s\" (%lu ms).\n", domain::patternName(pattern),
                            static_cast<unsigned long>(duration));
                gLocal.playPattern(pattern);
                sleepMs(static_cast<int>(duration) + 50);
                return 0;
            }
        }
    }
    long ms = 0;
    if (!optionalLong(argc, argv, 1, 10, 5000, 300, ms)) return 1;
    gLocal.beep(2500, static_cast<uint32_t>(ms));
    return 0;
}

// --- Bluetooth ------------------------------------------------------------------

int cmdBle(int argc, char** argv) {
    long seconds = 0;
    if (!optionalLong(argc, argv, 1, 5, 600, 30, seconds)) return 1;
    if (!gStarted.ble) {
        gBle.begin("RatoBorrachudo");
        gStarted.ble = true;
    }
    std::printf("Anunciando como 'RatoBorrachudo' por %ld s. No PC: python ble_ws_bridge.py "
                "--print-only (pasta bridge/).\n",
                seconds);
    long sent = 0;
    bool wasConnected = false;
    const int64_t start = nowUs();
    const int64_t end = start + seconds * 1000000;
    while (nowUs() < end) {
        const bool connected = gBle.isConnected();
        if (connected != wasConnected) {
            std::printf("  %s\n", connected ? "ponte conectada (notificações assinadas)"
                                            : "ponte desconectada");
            wasConnected = connected;
        }
        if (connected) {
            // `corrida` e `sequencia` (a partir de 1) deixam a ponte contar as lacunas.
            char line[128];
            std::snprintf(
                line, sizeof line,
                R"({"tipo":"diagnostico","corrida":"diagnostico","sequencia":%ld,"tempo_ms":%lld})",
                sent + 1, static_cast<long long>((nowUs() - start) / 1000));
            gBle.publish(line);
            ++sent;
        }
        sleepMs(100);
    }
    const adapters::BleStats stats = gBle.stats();
    std::printf("%ld mensagens publicadas (sequência 1 a %ld). Do lado da placa: %u entregues "
                "à pilha BLE, %u descartadas, %u notify recusados, %u erros de status, MTU %u.\n",
                sent, sent, static_cast<unsigned>(stats.sentMessages),
                static_cast<unsigned>(stats.droppedMessages),
                static_cast<unsigned>(stats.failedNotifies),
                static_cast<unsigned>(stats.statusErrors), static_cast<unsigned>(stats.mtu));
    std::printf("Compare com o resumo da ponte (Ctrl+C nela): faltar sequência lá, com zero "
                "descartadas aqui, "
                "indica perda no rádio ou no receptor (bridge/README.md, #381).\n");
    return 0;
}

// --- Taxa de amostragem ----------------------------------------------------------

int cmdTaxa(int argc, char** argv) {
    if (argc < 2) {
        std::printf("uso: taxa imu | ina | tof [ms]   (padrão 1000 ms)\n");
        return 1;
    }
    long ms = 0;
    if (!optionalLong(argc, argv, 2, 100, 10000, 1000, ms)) return 1;
    const std::string sensor = argv[1];
    if (sensor == "imu") {
        ensureImu();
    } else if (sensor == "ina") {
        ensurePower();
    } else if (sensor == "tof") {
        ensureSensor();
    } else {
        std::printf("sensor inválido: '%s' (imu, ina ou tof)\n", argv[1]);
        return 1;
    }
    long reads = 0;
    const int64_t end = nowUs() + ms * 1000;
    int64_t nextYield = nowUs() + 50000;
    while (nowUs() < end) {
        if (sensor == "imu") {
            (void)gImu.gyroZDegPerSec();
        } else if (sensor == "ina") {
            (void)gPower.busVoltageV();
        } else {
            (void)gSensor.rangeFrontMm();
        }
        ++reads;
        // Cede 1 ms a cada 50 ms: sem isso, a tarefa ociosa não roda e o watchdog reclama.
        if (nowUs() >= nextYield) {
            sleepMs(1);
            nextYield += 50000;
        }
    }
    std::printf("%s: %ld leituras em %ld ms = %.0f leituras/s (máximo, sem pausa entre "
                "leituras).\n",
                sensor.c_str(), reads, ms, reads * 1000.0 / ms);
    return 0;
}

// --- Visão geral -------------------------------------------------------------------

void printCheck(const char* item, bool ok, const char* detail) {
    std::printf("  [%s] %-22s %s\n", ok ? " OK " : "FALHA", item, detail);
}

int cmdVerificar(int /*argc*/, char** /*argv*/) {
    std::printf("Verificação rápida (o que dá para conferir sem mexer no robô):\n");
    esp_log_level_set("i2c.master", ESP_LOG_NONE);
    ensureImu();
    const std::optional<uint8_t> id = gImu.whoAmI();
    char detail[64] = "não responde em 0x68";
    if (id) {
        std::snprintf(detail, sizeof detail, "WHO_AM_I = 0x%02X (%s)", *id,
                      domain::imuModelName(domain::classifyImu(*id)));
    }
    printCheck("MPU-6050", id && domain::isSupportedImu(domain::classifyImu(*id)), detail);

    ensurePower();
    printCheck("INA219", gPower.present(), "calibração gravada e lida de volta em 0x40");

    const bool tofAddressed = probe(kAddrTofLeft) && probe(kAddrTofFront) && probe(kAddrTofRight);
    printCheck("ToF (endereços)", tofAddressed,
               tofAddressed ? "0x30, 0x31 e 0x32 respondem"
                            : "rode `tof xshut` para testar cada sensor");
    esp_log_level_set("i2c.master", ESP_LOG_WARN);

    ensureLocal();
    printCheck("Botão", !gLocal.buttonPressed(), "solto em repouso");
    std::printf("Motores, encoders, LEDs, buzzer e BLE: teste com `motor`, `enc`, `led`, "
                "`buzzer` e `ble`.\n");
    return 0;
}

int cmdPinos(int /*argc*/, char** /*argv*/) {
#if CONFIG_IDF_TARGET_ESP32
    std::printf("Mapa de BANCADA (ESP32 clássico), não corresponde ao esquemático:\n");
#else
    std::printf("Mapa da placa oficial (ESP32-S3), de include/adapters/BoardPins.hpp:\n");
#endif
    std::printf("  I2C        SDA=GPIO%d  SCL=GPIO%d\n", pins::kI2cSda, pins::kI2cScl);
    std::printf("  XSHUT ToF  frente=GPIO%d  esquerda=GPIO%d  direita=GPIO%d\n",
                pins::kTofFrontXshut, pins::kTofLeftXshut, pins::kTofRightXshut);
    std::printf("  Motor esq  IN1=GPIO%d  IN2=GPIO%d\n", pins::kMotorLeftIn1, pins::kMotorLeftIn2);
    std::printf("  Motor dir  IN1=GPIO%d  IN2=GPIO%d\n", pins::kMotorRightIn1,
                pins::kMotorRightIn2);
    std::printf("  Enc esq    A=GPIO%d  B=GPIO%d\n", pins::kEncLeftA, pins::kEncLeftB);
    std::printf("  Enc dir    A=GPIO%d  B=GPIO%d\n", pins::kEncRightA, pins::kEncRightB);
    std::printf("  LEDs       pronto=GPIO%d  erro=GPIO%d   buzzer=GPIO%d   botão=GPIO%d\n",
                pins::kLedReady, pins::kLedError, pins::kBuzzer, pins::kButton);
    std::printf("  DIP        1=GPIO%d  2=GPIO%d  3=GPIO%d   INT MPU=GPIO%d\n", pins::kDip1,
                pins::kDip2, pins::kDip3, pins::kImuInt);
    std::printf("  Sentido    roda esquerda invertida: motor %s, encoder %s (`inverter`)\n",
                gMotors.leftInverted() ? "sim" : "não", gEncoders.leftInverted() ? "sim" : "não");
    return 0;
}

// Inverte o sentido da roda esquerda sem recompilar, para achar a combinação certa no chassi
// (#394). Vale até reiniciar: depois, ajuste kInvertLeftMotor e kInvertLeftEncoder em
// BoardPins.hpp.
int cmdInverter(int argc, char** argv) {
    if (argc >= 2) {
        if (std::strcmp(argv[1], "motor") == 0) {
            gMotors.setLeftInverted(!gMotors.leftInverted());
        } else if (std::strcmp(argv[1], "enc") == 0) {
            gEncoders.setLeftInverted(!gEncoders.leftInverted());
        } else {
            std::printf("uso: inverter [motor|enc]\n");
            return 1;
        }
    }
    std::printf("Roda esquerda: motor %s, encoder %s (padrão do firmware: motor %s, encoder %s).\n",
                gMotors.leftInverted() ? "invertido" : "normal",
                gEncoders.leftInverted() ? "invertido" : "normal",
                pins::kInvertLeftMotor ? "invertido" : "normal",
                pins::kInvertLeftEncoder ? "invertido" : "normal");
    std::printf("Vale só até reiniciar. Teste com `motor 0.5 0.5` (robô suspenso): as duas rodas "
                "para frente e os dois encoders positivos.\n");
    return 0;
}

int cmdInfo(int /*argc*/, char** /*argv*/) {
    esp_chip_info_t chip{};
    esp_chip_info(&chip);
    uint32_t flashSize = 0;
    esp_flash_get_size(nullptr, &flashSize);
    std::printf("Chip %s, %d núcleo(s), revisão %d. Flash %" PRIu32 " MB. Heap livre %" PRIu32
                " bytes. ESP-IDF %s.\n",
                CONFIG_IDF_TARGET, chip.cores, chip.revision, flashSize / (1024 * 1024),
                esp_get_free_heap_size(), esp_get_idf_version());
    return 0;
}

// --- Registro dos comandos -----------------------------------------------------------

struct Command {
    const char* name;
    const char* help;
    esp_console_cmd_func_t func;
};

constexpr Command kCommands[] = {
    {"verificar", "Confere de uma vez IMU, INA219, endereços dos ToF e botão", cmdVerificar},
    {"i2c", "Varre o barramento I2C e lista quem responde", cmdI2c},
    {"tof", "tof [n] lê os 3 ToF n vezes (padrão 20). tof xshut testa cada XSHUT", cmdTof},
    {"imu", "imu [s] giro Z e ângulo integrado por s segundos (padrão 3)", cmdImu},
    {"ina", "ina [n] tensão, corrente e potência n vezes (padrão 10)", cmdIna},
    {"motor", "motor <esq> <dir> [ms] potência de -1 a 1 por ms (padrão 1000) e freia", cmdMotor},
    {"enc", "enc [s] mostra os encoders por s segundos (padrão 5). enc zerar", cmdEnc},
    {"dip", "Lê o DIP switch e mostra o labirinto escolhido", cmdDip},
    {"botao", "botao [s] mostra os toques no botão por s segundos (padrão 10)", cmdBotao},
    {"led", "led pronto | erro | apagar", cmdLed},
    {"buzzer", "buzzer [ms | pronto | objetivo | alarme] toca um tom por ms (padrão 300) ou um padrão do robô", cmdBuzzer},
    {"ble", "ble [s] anuncia e envia mensagens de teste por s segundos (padrão 30)", cmdBle},
    {"taxa", "taxa imu | ina | tof [ms] mede leituras por segundo", cmdTaxa},
    {"inverter", "inverter [motor|enc] inverte o sentido do motor ou do encoder esquerdo", cmdInverter},
    {"pinos", "Mostra o mapa de pinos em uso", cmdPinos},
    {"info", "Chip, memória e versão do ESP-IDF", cmdInfo},
};

}  // namespace

extern "C" void app_main() {
    gI2c.begin();

    esp_console_repl_t* repl = nullptr;
    esp_console_repl_config_t replConfig = ESP_CONSOLE_REPL_CONFIG_DEFAULT();
    replConfig.prompt = "rato> ";
    replConfig.max_cmdline_length = 128;
    replConfig.task_stack_size = 8192;

    // O esp_console_new_repl_* inicia o console; os comandos só podem ser registrados depois.
#if defined(CONFIG_ESP_CONSOLE_UART_DEFAULT) || defined(CONFIG_ESP_CONSOLE_UART_CUSTOM)
    esp_console_dev_uart_config_t device = ESP_CONSOLE_DEV_UART_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_console_new_repl_uart(&device, &replConfig, &repl));
#elif defined(CONFIG_ESP_CONSOLE_USB_SERIAL_JTAG)
    esp_console_dev_usb_serial_jtag_config_t device =
        ESP_CONSOLE_DEV_USB_SERIAL_JTAG_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_console_new_repl_usb_serial_jtag(&device, &replConfig, &repl));
#elif defined(CONFIG_ESP_CONSOLE_USB_CDC)
    esp_console_dev_usb_cdc_config_t device = ESP_CONSOLE_DEV_CDC_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_console_new_repl_usb_cdc(&device, &replConfig, &repl));
#endif

    for (const Command& command : kCommands) {
        esp_console_cmd_t entry{};
        entry.command = command.name;
        entry.help = command.help;
        entry.func = command.func;
        ESP_ERROR_CHECK(esp_console_cmd_register(&entry));
    }
    esp_console_register_help_command();

    std::printf("\n=== Rato Borrachudo: firmware de diagnóstico ===\n"
                "Digite `help` para ver os comandos, ou `verificar` para começar.\n\n");
    ESP_ERROR_CHECK(esp_console_start_repl(repl));
}
