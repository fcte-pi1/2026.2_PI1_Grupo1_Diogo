// Composition Root do firmware - entrada do ESP-IDF (main).
// Liga o núcleo aos adapters e às tarefas FreeRTOS. Compilado
// apenas no alvo ESP32; o build de host usa src/main.cpp (stub).

#include <atomic>
#include <cstdlib>
#include <cmath>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>

#include "adapters/BenchMotionAdapter.hpp"
#include "adapters/BleTelemetryAdapter.hpp"
#include "adapters/BoardPins.hpp"
#include "adapters/DipReaderAdapter.hpp"
#include "adapters/Drv8833MotionAdapter.hpp"
#include "controller/RaceTimeModel.hpp"
#include "controller/RobotMotion.hpp"
#include "adapters/I2cBus.hpp"
#include "adapters/Ina219.hpp"
#include "adapters/LocalInterfaceAdapter.hpp"
#include "adapters/Mpu6050.hpp"
#include "adapters/Vl53l1xSensorAdapter.hpp"
#include "domain/BatteryMonitor.hpp"
#include "domain/ButtonGesture.hpp"
#include "domain/Calibration.hpp"
#include "domain/Calibration.hpp"
#include "domain/DipDecoder.hpp"
#include "domain/ReportFrame.hpp"
#include "domain/Maneuver.hpp"
#include "domain/Maze.hpp"
#include "domain/Odometry.hpp"
#include "domain/Pid.hpp"
#include "domain/RobotParameters.hpp"
#include "domain/SensorHealthMonitor.hpp"
#include "driver/gpio.h"
#include "esp_app_desc.h"
#include "esp_err.h"
#include "esp_log.h"
#include "esp_random.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "protocol/ProtocolV1.hpp"
#include "sdkconfig.h"
#include "telemetry/TelemetryBuffer.hpp"
#include "telemetry/TelemetryEmitter.hpp"
#include "use_cases/Navigator.hpp"
#include "use_cases/SessionManager.hpp"

using namespace micromouse;

#ifndef TELEMETRY_TOKEN
#define TELEMETRY_TOKEN "troque-em-build"
#endif

namespace {

constexpr char kTag[] = "main";

adapters::I2cBus gI2c;
adapters::Vl53l1xSensorAdapter gSensor;
adapters::Mpu6050 gImu;
adapters::Ina219 gPower;
adapters::LocalInterfaceAdapter gLocal;
adapters::DipReaderAdapter gDip;
#if CONFIG_RATO_BANCADA
// Modo bancada: placa solta, movimento simulado (ver Kconfig.projbuild).
adapters::BenchMotionAdapter gMotion;
#else
// Movimentos em volts no motor: parâmetros em controller/RobotMotion.hpp.
adapters::Drv8833MotionAdapter gMotion{gImu};
#endif
adapters::BleTelemetryAdapter gBle;

#if !CONFIG_RATO_BANCADA
// ---- Calibração trocável pelo BLE (16/11), gravada na NVS ----
// O que depende do robô montado e do piso (medidas do corpo, escala do giroscópio, freio das
// curvas, parada pela parede da frente...) fica em domain::Calibration. O comando `calib` troca
// os valores sem regravar o firmware; eles valem a partir do boot seguinte também.
constexpr char kCalibNamespace[] = "rato";
constexpr char kCalibKey[] = "calib15";  // mude o número se a struct mudar de formato (calib1: 13 campos)

domain::Calibration defaultCalibration() {
    domain::Calibration calibration;
#if CONFIG_RATO_CENTRALIZAR_PAREDES
    calibration.centerOnWalls = 1.0;  // a opção do Kconfig vira só o PADRÃO do `calib centralizar`
#endif
    return calibration;
}

// Lê a calibração gravada. Sem nada gravado (ou com algo ilegível), valem os padrões.
domain::Calibration loadCalibration() {
    domain::Calibration calibration = defaultCalibration();
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        (void)nvs_flash_erase();
        err = nvs_flash_init();
    }
    nvs_handle_t handle = 0;
    if (err == ESP_OK && nvs_open(kCalibNamespace, NVS_READONLY, &handle) == ESP_OK) {
        domain::Calibration stored;
        size_t size = sizeof stored;
        if (nvs_get_blob(handle, kCalibKey, &stored, &size) == ESP_OK && size == sizeof stored) {
            calibration = stored;
            if (const int fixed = domain::sanitizeCalibration(calibration); fixed > 0) {
                ESP_LOGW("calib", "%d valor(es) gravado(s) fora da faixa voltaram ao padrao", fixed);
            }
            ESP_LOGI("calib", "valores lidos da memoria do robo");
        } else {
            ESP_LOGI("calib", "nada gravado: valores padrao");
        }
        nvs_close(handle);
    } else {
        ESP_LOGI("calib", "nada gravado: valores padrao");
    }
    return calibration;
}

bool saveCalibration(const domain::Calibration& calibration) {
    nvs_handle_t handle = 0;
    if (nvs_open(kCalibNamespace, NVS_READWRITE, &handle) != ESP_OK) {
        return false;
    }
    const bool ok = nvs_set_blob(handle, kCalibKey, &calibration, sizeof calibration) == ESP_OK &&
                    nvs_commit(handle) == ESP_OK;
    nvs_close(handle);
    return ok;
}

// Os valores em uso, um por linha: "calib: nome = valor unidade (faixa a..b) [padrao|MEDIDO]".
void logCalibration() {
    const domain::Calibration& now = gMotion.calibration();
    const domain::Calibration defaults = defaultCalibration();
    for (const domain::CalibrationField& field : domain::calibrationFields()) {
        const double value = now.*(field.member);
        const bool isDefault = value == defaults.*(field.member);
        ESP_LOGI("calib", "%.*s = %.3f %.*s (faixa %.2f a %.2f) %s",
                 static_cast<int>(field.name.size()), field.name.data(), value,
                 static_cast<int>(field.unit.size()), field.unit.data(), field.min, field.max,
                 isDefault ? "padrao" : "ALTERADO");
        vTaskDelay(pdMS_TO_TICKS(25));  // deixa a telemetria escoar a fila de log
    }
    ESP_LOGI("calib", "fim: arco comeca com o frontal a %.1f mm; freio em uso arco %.1f pivo %.1f "
                      "graus (%d curva(s) no autoajuste)",
             gMotion.arcStartTargetMm(), gMotion.arcBrakeDeg(), gMotion.pivotBrakeDeg(),
             gMotion.brakeTurnsLearned());
}

// `text` é o comando inteiro: "calib", "calib padrao" ou "calib nome=valor nome=valor ...".
[[maybe_unused]] void serviceCalibrationCommand(const char* text) {
    std::string_view arguments{text};
    arguments.remove_prefix(arguments.size() >= 5 ? 5 : arguments.size());
    while (!arguments.empty() && arguments.front() == ' ') {
        arguments.remove_prefix(1);
    }
    if (arguments.empty()) {
        logCalibration();
        return;
    }
    domain::Calibration calibration = gMotion.calibration();
    if (arguments == "padrao") {
        calibration = defaultCalibration();
    } else {
        const domain::CalibrationParse parsed = domain::applyCalibration(calibration, arguments);
        if (parsed.rejected > 0) {
            const char* reason =
                parsed.firstReason == domain::CalibrationSet::OutOfRange    ? "fora da faixa"
                : parsed.firstReason == domain::CalibrationSet::NotANumber ? "nao e numero"
                                                                            : "nome desconhecido";
            ESP_LOGE("calib", "RECUSADO, nada mudou: '%.*s' (%s). Mande 'calib' para ver os nomes "
                              "e as faixas",
                     static_cast<int>(parsed.firstRejected.size()), parsed.firstRejected.data(),
                     reason);
            return;
        }
    }
    gMotion.setCalibration(calibration);
    const bool saved = saveCalibration(calibration);
    ESP_LOGI("calib", "%s", saved ? "gravado na memoria do robo (vale tambem depois de reiniciar)"
                                  : "ATENCAO: vale agora, mas NAO consegui gravar na memoria");
    logCalibration();
}
#endif  // !CONFIG_RATO_BANCADA

telemetry::Snapshot gState{};
SemaphoreHandle_t gStateMutex = nullptr;

struct TeleEvent {
    enum Kind { Start, Cell, End } kind;
    long time;
    int runIndex;
    int mazeType;
    domain::Position position;
    bool north, east, south, west;
    bool success;
    char detail[190];  // motivo de uma falha, vai no campo "detalhe" do fim da corrida
};
QueueHandle_t gEventQueue = nullptr;

long nowMs() { return static_cast<long>(esp_timer_get_time() / 1000); }

// Mensagens que não couberam nas filas (a telemetria atrasou): antes sumiam sem aviso. O total sai
// no resumo do fim da corrida.
std::atomic<int> gDroppedEvents{0};
std::atomic<int> gDroppedLogLines{0};

void postEvent(const TeleEvent& event) {
    if (gEventQueue != nullptr && xQueueSend(gEventQueue, &event, 0) != pdTRUE) {
        ++gDroppedEvents;
    }
}

char directionLetter(domain::Direction direction) {
    switch (direction) {
        case domain::Direction::North: return 'N';
        case domain::Direction::East: return 'L';
        case domain::Direction::South: return 'S';
        case domain::Direction::West: return 'O';
    }
    return '?';
}

// Uma parede do mapa numa letra: P = parede, A = aberto, ? = ainda não visto.
[[maybe_unused]] char wallLetter(const domain::MazeMap& maze, const domain::Position& cell,
                                 domain::Direction direction) {
    switch (maze.getWall(cell, direction)) {
        case domain::Wall::Present: return 'P';
        case domain::Wall::Open: return 'A';
        case domain::Wall::Unknown: return '?';
    }
    return '?';
}

// Fora do #if do log: a escolha do labirinto e o toque longo valem também no modo prova (21/11: sem
// CONFIG_RATO_LOG_RETA o firmware não compilava, porque estas duas ficavam dentro do bloco dos comandos de teste).
// "labirinto <tipo>" (19/11): troca o tipo de labirinto da PRÓXIMA largada sem mexer no DIP, para o 4x8
// e o 4x12 (em pé), que o DIP não escolhe (via 1 + 2 fechadas é combinação proibida, #393). O canto
// de largada continua o da via 3. Vale até o reinício; "labirinto dip" volta ao que o DIP diz.
// -1 = o do DIP; senão o valor de domain::MazeType. O comando só muda a configuração: nada se move.
std::atomic<int> gMazeOverride{-1};
// Toque longo no botão (19/11): alterna a orientação (em pé <-> deitado; o 4x4 vira "4x4 girado", só
// para testar o relato girado com o único labirinto físico). O comando `labirinto` zera.
std::atomic<bool> gOrientationFlip{false};

#if CONFIG_RATO_LOG_RETA
// Diagnóstico sem cabo: na bateria, o serial não chega a ninguém (não se pode ligar o USB junto),
// então as linhas de log "reta", "curva" e "main" (motivo das falhas) também vão pelo BLE, como
// texto começando com "#". A ponte não as manda ao backend (não são mensagens do protocolo): grava
// num arquivo (bridge/ble_ws_bridge.py --log-robo).
struct DebugLine {
    char text[320];  // a linha "reta" passa de 200 caracteres (09/11: o giro no fim se perdia)
};
QueueHandle_t gDebugQueue = nullptr;
vprintf_like_t gSerialLog = nullptr;

int mirrorLogToBle(const char* format, va_list args) {
    va_list copy;
    va_copy(copy, args);
    const int written = gSerialLog != nullptr ? gSerialLog(format, args) : std::vprintf(format, args);
    if (gDebugQueue != nullptr) {
        DebugLine line{};
        std::vsnprintf(line.text, sizeof line.text, format, copy);
        if (std::strstr(line.text, " reta: ") != nullptr ||
            std::strstr(line.text, " curva: ") != nullptr ||
            std::strstr(line.text, " main: ") != nullptr ||
            std::strstr(line.text, " nav: ") != nullptr ||
            std::strstr(line.text, " tof: ") != nullptr ||
            std::strstr(line.text, " giro: ") != nullptr ||
            std::strstr(line.text, " diag: ") != nullptr ||
            std::strstr(line.text, " calib: ") != nullptr ||
            std::strstr(line.text, " teste: ") != nullptr) {
            if (xQueueSend(gDebugQueue, &line, 0) != pdTRUE) {
                ++gDroppedLogLines;
            }
        }
    }
    va_end(copy);
    return written;
}

// Comandos de teste pelo BLE (canal RX do NUS), para testar na bateria sem cabo e sem tocar no
// robô: "largar" faz o mesmo que o botão; "parar" freia na hora e leva a corrida ao Erro;
// "reiniciar" reinicia a placa, como o RST.
std::atomic<bool> gRemoteStart{false};
std::atomic<bool> gRemoteStop{false};
// "frente <potência> <ms>": teste sem controle, com o robô parado esperando a largada.
std::atomic<int> gTestPermille{0};
std::atomic<int> gTestMs{0};
// Manobra avulsa pedida pelo BLE (Drv8833MotionAdapter::Maneuver), executada esperando a largada.
std::atomic<int> gTestManeuver{0};
std::atomic<int> gTestRunCells{1};  // `andar N`: células do trecho contínuo
// "tof": 5 leituras dos três ToF com o robô parado, para calibrar fora do labirinto.
std::atomic<bool> gTestTof{false};
// "giro": deriva do giroscópio em repouso.
std::atomic<bool> gTestGyro{false};
// Diagnóstico de hardware (12/11), ver LOGS_E_MEDIDAS.md:
// "diag": relatório completo de sensores, entradas e erros, com veredito; "saude": os contadores.
std::atomic<bool> gTestDiag{false};
std::atomic<bool> gTestHealth{false};
// "tofmon [s]": os três ToF lidos sem parar por alguns segundos (estabilidade, cabo, calibração).
std::atomic<int> gTestTofMonSeconds{0};
std::atomic<int> gTestGyroAngleSeconds{0};  // `giroang [s]`
// "tofrec": reinicia pelo XSHUT os ToF que não respondem.
std::atomic<bool> gTestTofRecover{false};
// "motor e|d|ed <volts> <ms>": roda(s) em tensão fixa. Bit 0 = esquerda, bit 1 = direita.
std::atomic<int> gTestWheelMask{0};
std::atomic<int> gTestWheelMillivolts{0};
std::atomic<int> gTestWheelMs{0};
// "rodas": varredura das duas rodas nos dois sentidos.
std::atomic<bool> gTestWheelSweep{false};
// "enc [s]": pulsos dos encoders com os motores soltos, para girar as rodas à mão.
std::atomic<int> gTestEncoderSeconds{0};
// Comandos recusados (desconhecidos ou fora da faixa). O callback do BLE só conta; quem loga é a
// tarefa de navegação (a pilha da tarefa do NimBLE é pequena para formatar uma linha de log).
std::atomic<int> gRejectedCommands{0};
// "calib [nome=valor ...]" (16/11): valores do robô e do piso trocáveis sem regravar. O callback do
// BLE só guarda o texto; quem interpreta, grava na memória e loga é a tarefa de navegação.
char gCalibText[232] = "";
std::atomic<bool> gTestCalib{false};

// Descarta os comandos de teste pendentes. Um comando recebido DURANTE a corrida não pode rodar
// sozinho quando ela termina: o operador não deu o ok para ele naquele lugar.
void discardTestCommands() {
    bool any = gTestMs.exchange(0) != 0;
    any = (gTestManeuver.exchange(0) != 0) || any;
    any = (gTestWheelMask.exchange(0) != 0) || any;
    any = gTestWheelSweep.exchange(false) || any;
    any = (gTestEncoderSeconds.exchange(0) != 0) || any;
    any = (gTestTofMonSeconds.exchange(0) != 0) || any;
    any = (gTestGyroAngleSeconds.exchange(0) != 0) || any;
    any = gTestTof.exchange(false) || any;
    any = gTestGyro.exchange(false) || any;
    any = gTestDiag.exchange(false) || any;
    any = gTestHealth.exchange(false) || any;
    any = gTestTofRecover.exchange(false) || any;
    any = gTestCalib.exchange(false) || any;
    if (any) {
        ESP_LOGW("teste", "comandos recebidos durante a corrida foram descartados");
    }
}

void onBleCommand(const std::string& command) {
    if (command == "largar") {
        gRemoteStop = false;
        gRemoteStart = true;
    } else if (command == "parar") {
        gRemoteStop = true;
    } else if (command == "virar d" || command == "virar e" || command == "arco d" ||
               command == "arco e" || command == "pivo d" || command == "pivo e" ||
               command == "andar" || command == "re") {
        using M = adapters::Drv8833MotionAdapter::Maneuver;
        const bool right = command.back() == 'd';
        M maneuver = M::Advance;
        if (command.rfind("virar", 0) == 0) maneuver = right ? M::TurnRight : M::TurnLeft;
        if (command.rfind("arco", 0) == 0) maneuver = right ? M::ArcRight : M::ArcLeft;
        if (command.rfind("pivo", 0) == 0) maneuver = right ? M::PivotRight : M::PivotLeft;
        if (command == "re") maneuver = M::Reverse;  // uma célula de ré (saída de beco)
        gRemoteStop = false;  // zera aqui, e não ao começar: um "parar" que chegue depois vale
        gTestManeuver = static_cast<int>(maneuver);
    } else if (command == "curvac d" || command == "curvac e" || command.rfind("curvac d ", 0) == 0 ||
               command.rfind("curvac e ", 0) == 0) {
        // `curvac d|e [N]` (20/11): anda N células (1 a 8, padrão 1) e vira na última SEM parar (curva contínua),
        // terminando no centro da célula seguinte à curva.
        const int cells = command.size() > 9 ? std::atoi(command.c_str() + 9) : 1;
        if (cells >= 1 && cells <= 8) {
            using M = adapters::Drv8833MotionAdapter::Maneuver;
            gTestRunCells = cells;
            gRemoteStop = false;
            gTestManeuver = static_cast<int>(command[7] == 'd' ? M::RunTurnRight : M::RunTurnLeft);
        } else {
            ESP_LOGW("teste", "curvac d|e N: N de 1 a 8 (veio '%s')", command.c_str());
        }
    } else if (command.rfind("re ", 0) == 0) {
        // `re N` (20/11): N células de ré num movimento só, de 2 a 8.
        const int cells = std::atoi(command.c_str() + 3);
        if (cells >= 2 && cells <= 8) {
            gTestRunCells = cells;
            gRemoteStop = false;
            gTestManeuver = static_cast<int>(adapters::Drv8833MotionAdapter::Maneuver::ReverseRun);
        } else {
            ESP_LOGW("teste", "re N: N de 2 a 8 (veio '%s')", command.c_str());
        }
    } else if (command.rfind("andar ", 0) == 0) {
        // `andar N` (20/11): N células num movimento só (reta contínua), de 2 a 8.
        const int cells = std::atoi(command.c_str() + 6);
        if (cells >= 2 && cells <= 8) {
            gTestRunCells = cells;
            gRemoteStop = false;
            gTestManeuver = static_cast<int>(adapters::Drv8833MotionAdapter::Maneuver::AdvanceRun);
        } else {
            ESP_LOGW("teste", "andar N: N de 2 a 8 (veio '%s')", command.c_str());
        }
    } else if (command == "tof") {
        gTestTof = true;
    } else if (command == "giro") {
        gTestGyro = true;
    } else if (command == "diag") {
        gTestDiag = true;
    } else if (command == "saude") {
        gTestHealth = true;
    } else if (command == "tofrec") {
        gTestTofRecover = true;
    } else if (command == "rodas") {
        gRemoteStop = false;
        gTestWheelSweep = true;
    } else if (command == "tofmon" || command.rfind("tofmon ", 0) == 0) {
        int seconds = 10;
        if (command.size() > 7) {
            (void)std::sscanf(command.c_str() + 7, "%d", &seconds);
        }
        gRemoteStop = false;
        gTestTofMonSeconds = seconds < 1 ? 1 : seconds > 120 ? 120 : seconds;
    } else if (command == "giroang" || command.rfind("giroang ", 0) == 0) {
        int seconds = 8;
        if (command.size() > 8) {
            (void)std::sscanf(command.c_str() + 8, "%d", &seconds);
        }
        gRemoteStop = false;
        gTestGyroAngleSeconds = seconds < 2 ? 2 : seconds > 30 ? 30 : seconds;
    } else if (command == "enc" || command.rfind("enc ", 0) == 0) {
        int seconds = 10;
        if (command.size() > 4) {
            (void)std::sscanf(command.c_str() + 4, "%d", &seconds);
        }
        gRemoteStop = false;
        gTestEncoderSeconds = seconds < 1 ? 1 : seconds > 60 ? 60 : seconds;
    } else if (command.rfind("motor ", 0) == 0) {
        // "motor e 3.0 1000": roda esquerda a 3 V por 1 s (negativo = para trás). "d" = direita,
        // "ed" = as duas. No máximo o teto de tensão do controle e 3 s.
        char which[4] = "";
        float volts = 0.0F;
        int ms = 0;
        bool accepted = false;
        if (std::sscanf(command.c_str() + 6, "%3s %f %d", which, &volts, &ms) == 3 && ms > 0 &&
            ms <= 3000 && volts >= -static_cast<float>(controller::robot::kMotorMaxVolts) &&
            volts <= static_cast<float>(controller::robot::kMotorMaxVolts)) {
            int mask = 0;
            if (std::strchr(which, 'e') != nullptr) mask |= 1;
            if (std::strchr(which, 'd') != nullptr) mask |= 2;
            if (mask != 0) {
                gRemoteStop = false;
                gTestWheelMillivolts = static_cast<int>(volts * 1000.0F);
                gTestWheelMs = ms;
                gTestWheelMask = mask;
                accepted = true;
            }
        }
        if (!accepted) {
            ++gRejectedCommands;
        }
    } else if (command == "calib" || command.rfind("calib ", 0) == 0) {
        // Um de cada vez: o anterior ainda não foi atendido se a flag está ligada.
        if (command.size() < sizeof gCalibText && !gTestCalib.load()) {
            std::memcpy(gCalibText, command.c_str(), command.size() + 1);
            gTestCalib = true;
        } else {
            ++gRejectedCommands;
        }
    } else if (command.rfind("labirinto ", 0) == 0) {
        const std::string name = command.substr(10);
        if (name == "dip") {
            gMazeOverride = -1;
            gOrientationFlip = false;
        } else if (const std::optional<domain::MazeType> type = domain::parseMazeType(name)) {
            gMazeOverride = static_cast<int>(*type);
            gOrientationFlip = false;
        } else {
            ++gRejectedCommands;
        }
    } else if (command == "reiniciar") {
        esp_restart();  // como o botão RST: depois de um Erro, a placa só larga de novo reiniciando
    } else if (command.rfind("frente ", 0) == 0) {
        float power = 0.0F;
        int ms = 0;
        if (std::sscanf(command.c_str() + 7, "%f %d", &power, &ms) == 2 && ms > 0 && ms <= 3000 &&
            power >= -1.0F && power <= 1.0F) {
            gRemoteStop = false;
            gTestPermille = static_cast<int>(power * 1000.0F);
            gTestMs = ms;
        } else {
            ++gRejectedCommands;
        }
    } else {
        ++gRejectedCommands;
    }
}

// Tira as cores ANSI e a quebra de linha do log do ESP-IDF.
std::string plainLogLine(const char* text) {
    std::string out = "#";
    for (const char* c = text; *c != '\0'; ++c) {
        if (*c == '\033') {
            while (*c != '\0' && *c != 'm') ++c;
            if (*c == '\0') break;
            continue;
        }
        if (*c != '\n' && *c != '\r') out.push_back(*c);
    }
    return out;
}

#if !CONFIG_RATO_BANCADA
// ===================== Diagnóstico de hardware pelo BLE (12/11) =====================
// Em 11/11 o ToF direito parava no meio do teste, o giroscópio lia de -0,1 a +5 graus/s parado e
// linhas de log sumiam, e nada no log dizia por quê. Estes comandos fazem o robô contar o que vê,
// para separar defeito de hardware de defeito de firmware sem abrir o robô. Ver LOGS_E_MEDIDAS.md.

unsigned long uptimeSeconds() { return static_cast<unsigned long>(esp_timer_get_time() / 1000000); }

const char* resetReasonText() {
    switch (esp_reset_reason()) {
        case ESP_RST_POWERON: return "LIGOU (poweron)";
        case ESP_RST_EXT: return "botao RST";
        case ESP_RST_SW: return "reinicio por comando (sw)";
        case ESP_RST_PANIC: return "PANICO (erro do firmware)";
        case ESP_RST_INT_WDT:
        case ESP_RST_TASK_WDT:
        case ESP_RST_WDT: return "WATCHDOG (firmware travou)";
        case ESP_RST_BROWNOUT: return "BROWNOUT (a tensao caiu)";
        case ESP_RST_DEEPSLEEP: return "deep sleep";
        case ESP_RST_SDIO: return "sdio";
        default: return "outro";
    }
}

// Medidas de um ToF acumuladas, por tipo.
struct TofStats {
    int ok{0};
    int noTarget{0};
    int tooClose{0};  // abaixo do alcance mínimo (parede encostada, distância desconhecida)
    int uncertain{0};
    int fault{0};
    long sum{0};
    int min{99999};
    int max{-1};

    void add(const adapters::Vl53l1xSensorAdapter::Reading& reading) {
        switch (reading.kind) {
            case drivers::ReadingKind::Distance:
                ++ok;
                sum += reading.mm;
                min = reading.mm < min ? reading.mm : min;
                max = reading.mm > max ? reading.mm : max;
                break;
            case drivers::ReadingKind::TooClose: ++tooClose; break;
            case drivers::ReadingKind::NoTarget: ++noTarget; break;
            case drivers::ReadingKind::Uncertain: ++uncertain; break;
            case drivers::ReadingKind::Fault: ++fault; break;
        }
    }
    [[nodiscard]] int total() const { return ok + noTarget + uncertain + fault + tooClose; }
    [[nodiscard]] double mean() const { return ok > 0 ? static_cast<double>(sum) / ok : -1.0; }
    [[nodiscard]] int low() const { return ok > 0 ? min : -1; }
    [[nodiscard]] int high() const { return ok > 0 ? max : -1; }
};

constexpr adapters::Vl53l1xSensorAdapter::Side kTofSides[3] = {
    adapters::Vl53l1xSensorAdapter::Side::Left, adapters::Vl53l1xSensorAdapter::Side::Front,
    adapters::Vl53l1xSensorAdapter::Side::Right};
constexpr char kTofLetters[3] = {'E', 'F', 'D'};

// Pausa curta depois de cada linha, para a tarefa da telemetria escoar a fila do BLE.
void drainLog() { vTaskDelay(pdMS_TO_TICKS(40)); }

// Contadores desde o boot. Tudo zero = nenhum sensor falhou e nenhuma linha se perdeu.
void logHealth() {
    adapters::Vl53l1xSensorAdapter::Health tof[3];
    for (int i = 0; i < 3; ++i) {
        tof[i] = gSensor.health(kTofSides[i]);
    }
    ESP_LOGI("diag",
             "saude 1/2: ligado ha %lu s, reset=%s, bat=%.2f V, heap livre=%u min=%u, giro desvio "
             "em uso=%.3f graus/s (%s), ble perdidos: linhas=%d eventos=%d pedacos=%u",
             uptimeSeconds(), resetReasonText(), gPower.busVoltageV(),
             static_cast<unsigned>(esp_get_free_heap_size()),
             static_cast<unsigned>(esp_get_minimum_free_heap_size()), gMotion.gyroBias(),
             gMotion.gyroBiasMeasured() ? "medido" : "nunca medido", gDroppedLogLines.load(),
             gDroppedEvents.load(), adapters::BleTelemetryAdapter::droppedChunks());
    drainLog();
    ESP_LOGI("diag",
             "saude 2/2: i2c erros tof E=%u F=%u D=%u imu=%u ina=%u | lentas E=%u F=%u D=%u (pior "
             "%u/%u/%u ms) | tof quedas E=%u F=%u D=%u | reinicios XSHUT E=%u F=%u D=%u (falhos "
             "%u/%u/%u)",
             tof[0].i2cErrors, tof[1].i2cErrors, tof[2].i2cErrors, gImu.readErrors(),
             gPower.readErrors(), tof[0].i2cTimeouts, tof[1].i2cTimeouts, tof[2].i2cTimeouts,
             tof[0].i2cWorstMs, tof[1].i2cWorstMs, tof[2].i2cWorstMs, tof[0].dropouts,
             tof[1].dropouts, tof[2].dropouts, tof[0].recoveries, tof[1].recoveries,
             tof[2].recoveries, tof[0].failedRecoveries, tof[1].failedRecoveries,
             tof[2].failedRecoveries);
    drainLog();
}

// Uma vez por segundo, com o robô parado: loga quando um sensor para de responder e quando volta
// (com o tempo desde o boot), em vez de só descobrir no teste seguinte.
void watchHealth() {
    static bool imuOk = true;
    static bool powerOk = true;
    gSensor.watch();
    const bool imuNow = gImu.whoAmI().has_value();
    if (imuNow != imuOk) {
        imuOk = imuNow;
        if (imuNow) {
            ESP_LOGW("diag", "IMU VOLTOU a responder aos %lu s", uptimeSeconds());
        } else {
            ESP_LOGE("diag", "IMU PAROU de responder aos %lu s", uptimeSeconds());
        }
    }
    const bool powerNow = gPower.busVoltageV() > 1.0;  // uma leitura que falha devolve 0
    if (powerNow != powerOk) {
        powerOk = powerNow;
        if (powerNow) {
            ESP_LOGW("diag", "INA219 VOLTOU a ler aos %lu s", uptimeSeconds());
        } else {
            ESP_LOGE("diag", "INA219 PAROU de ler (ou a bateria esta abaixo de 1 V) aos %lu s",
                     uptimeSeconds());
        }
    }
}

// "tofmon": lê os três ToF sem parar por `seconds`. Uma linha por segundo e um resumo por sensor.
// Serve para ver se um sensor falha parado, mexendo no cabo dele, e para calibrar com uma parede a
// uma distância conhecida (a média de dezenas de medidas).
void runTofMonitor(int seconds) {
    TofStats total[3];
    TofStats second[3];
    unsigned errorsBefore[3];
    for (int i = 0; i < 3; ++i) {
        errorsBefore[i] = gSensor.health(kTofSides[i]).i2cErrors;
    }
    (void)gSensor.settledReadings();  // a primeira medida depois de um tempo parado sai com lixo
    const int64_t start = esp_timer_get_time();
    int64_t last = start;
    long worstGapMs = 0;
    int rounds = 0;
    int reported = 0;
    while (reported < seconds && !gRemoteStop.load()) {
        const auto readings = gSensor.settledReadings();
        const int64_t now = esp_timer_get_time();
        const long gapMs = static_cast<long>((now - last) / 1000);
        worstGapMs = gapMs > worstGapMs ? gapMs : worstGapMs;
        last = now;
        ++rounds;
        for (int i = 0; i < 3; ++i) {
            total[i].add(readings[static_cast<size_t>(i)]);
            second[i].add(readings[static_cast<size_t>(i)]);
        }
        if ((now - start) / 1000000 > reported) {
            ++reported;
            gSensor.watch();  // loga na hora "tof: <lado> PAROU/VOLTOU a responder"
            ESP_LOGI("teste",
                     "tofmon %d/%d s: E=%d..%d (%d ok, %d falha) F=%d..%d (%d ok, %d falha) "
                     "D=%d..%d (%d ok, %d falha)",
                     reported, seconds, second[0].low(), second[0].high(), second[0].ok,
                     second[0].fault, second[1].low(), second[1].high(), second[1].ok,
                     second[1].fault, second[2].low(), second[2].high(), second[2].ok,
                     second[2].fault);
            for (TofStats& stats : second) {
                stats = TofStats{};
            }
        }
    }
    const long elapsedMs = static_cast<long>((esp_timer_get_time() - start) / 1000);
    bool problem = false;
    for (int i = 0; i < 3; ++i) {
        const unsigned errors = gSensor.health(kTofSides[i]).i2cErrors - errorsBefore[i];
        problem = problem || total[i].fault > 0 || errors > 0;
        ESP_LOGI("teste",
                 "tofmon fim %c: %d medidas: ok=%d falha=%d sem alvo=%d incerto=%d | media=%.1f "
                 "min=%d max=%d mm | erros I2C=%u",
                 kTofLetters[i], total[i].total(), total[i].ok, total[i].fault, total[i].noTarget,
                 total[i].uncertain, total[i].mean(), total[i].low(), total[i].high(), errors);
        drainLog();
    }
    ESP_LOGI("teste", "tofmon fim: %d rodadas em %ld ms (media %ld ms, pior %ld ms) -> %s", rounds,
             elapsedMs, rounds > 0 ? elapsedMs / rounds : 0L, worstGapMs,
             problem ? "PROBLEMA: houve falha de leitura" : "OK: nenhuma falha");
}

// "diag": relatório do hardware com o robô PARADO e imóvel. Cada linha começa com "diag"; a última
// é o veredito ("diag fim: OK" ou a lista dos problemas).
void runDiagnostics(const domain::MazeSetup& setup) {
    char problems[220] = "";
    size_t used = 0;
    int problemCount = 0;
    auto problem = [&problems, &used, &problemCount](const char* text) {
        ++problemCount;
        if (used < sizeof problems) {
            const int n = std::snprintf(problems + used, sizeof problems - used, "%s%s",
                                        used == 0 ? "" : "; ", text);
            used += n > 0 ? static_cast<size_t>(n) : 0;
        }
    };

    // 1) Que firmware é este e por que a placa ligou.
    const esp_app_desc_t* app = esp_app_get_description();
    ESP_LOGI("diag",
             "firmware: versao %s, compilado em %s %s, IDF %s | motores: %s, %s | RF-44 %s | "
             "reset=%s, ligado ha %lu s",
             app->version, app->date, app->time, app->idf_ver, adapters::pins::kMotorWiringName,
             adapters::kMotorDecayName,
             gMotion.calibration().centerOnWalls >= 0.5 ? "ligado" : "desligado", resetReasonText(),
             uptimeSeconds());
    drainLog();
    switch (esp_reset_reason()) {
        case ESP_RST_PANIC:
        case ESP_RST_INT_WDT:
        case ESP_RST_TASK_WDT:
        case ESP_RST_WDT:
        case ESP_RST_BROWNOUT:
            problem("a placa reiniciou sozinha (ver reset)");
            break;
        default:
            break;
    }

    // 2) Quem responde no barramento I²C, 10 chamadas por endereço.
    constexpr int kProbes = 10;
    constexpr uint8_t kAddresses[6] = {0x30, 0x31, 0x32, 0x68, 0x40, 0x29};
    int answers[6] = {0, 0, 0, 0, 0, 0};
    for (int round = 0; round < kProbes; ++round) {
        for (int i = 0; i < 6; ++i) {
            answers[i] += gSensor.probe(kAddresses[i]) ? 1 : 0;
        }
    }
    ESP_LOGI("diag",
             "i2c (respostas em %d chamadas): ToF E 0x30=%d, ToF F 0x31=%d, ToF D 0x32=%d, IMU "
             "0x68=%d, INA219 0x40=%d | 0x29 (ToF fora do endereco, esperado 0)=%d",
             kProbes, answers[0], answers[1], answers[2], answers[3], answers[4], answers[5]);
    drainLog();
    if (answers[0] < kProbes) problem("ToF esquerdo nao responde sempre");
    if (answers[1] < kProbes) problem("ToF frontal nao responde sempre");
    if (answers[2] < kProbes) problem("ToF direito nao responde sempre");
    if (answers[3] < kProbes) problem("IMU nao responde sempre");
    if (answers[4] < kProbes) problem("INA219 nao responde sempre");
    if (answers[5] > 0) problem("um ToF voltou ao endereco 0x29 (reiniciou sozinho)");

    // 3) Cada ToF: identificação e 20 medidas (a primeira, descartada, costuma sair com lixo).
    TofStats stats[3];
    (void)gSensor.settledReadings();
    constexpr int kTofRounds = 20;
    for (int round = 0; round < kTofRounds; ++round) {
        const auto readings = gSensor.settledReadings();
        for (int i = 0; i < 3; ++i) {
            stats[i].add(readings[static_cast<size_t>(i)]);
        }
    }
    for (int i = 0; i < 3; ++i) {
        const bool ready = gSensor.ready(kTofSides[i]);
        const unsigned model = gSensor.modelId(kTofSides[i]);
        ESP_LOGI("diag",
                 "tof %s (0x%02X): configurado=%s id=0x%04X (esperado 0xEACC) | %d medidas: ok=%d "
                 "falha=%d sem alvo=%d incerto=%d | media=%.1f min=%d max=%d mm",
                 adapters::Vl53l1xSensorAdapter::sideName(kTofSides[i]),
                 static_cast<unsigned>(gSensor.address(kTofSides[i])), ready ? "sim" : "NAO", model,
                 kTofRounds, stats[i].ok, stats[i].fault, stats[i].noTarget, stats[i].uncertain,
                 stats[i].mean(), stats[i].low(), stats[i].high());
        drainLog();
        if (!ready || model != 0xEACC || stats[i].fault > 0) {
            char text[40];
            std::snprintf(text, sizeof text, "ToF %s com falha",
                          adapters::Vl53l1xSensorAdapter::sideName(kTofSides[i]));
            problem(text);
        }
    }

    // 4) IMU: identificação, temperatura, gravidade e o giroscópio parado.
    const std::optional<uint8_t> who = gImu.whoAmI();
    const std::optional<uint8_t> clock = gImu.powerManagement();
    const std::optional<adapters::Mpu6050::Sample> imu = gImu.readAll();
    const adapters::Drv8833MotionAdapter::GyroRest rest = gMotion.measureGyroRest(250);
    if (who && imu) {
        ESP_LOGI("diag",
                 "imu: WHO_AM_I=0x%02X PWR_MGMT_1=0x%02X temp=%.1f C | acel X=%.2f Y=%.2f Z=%.2f g "
                 "| giro X=%.2f Y=%.2f graus/s | giro Z em repouso: media %.3f min %.2f max %.2f "
                 "(%d leituras, %d perdidas), desvio em uso %.3f",
                 static_cast<unsigned>(*who), static_cast<unsigned>(clock.value_or(0xFF)),
                 imu->temperatureC, imu->accelG[0], imu->accelG[1], imu->accelG[2],
                 imu->gyroDps[0], imu->gyroDps[1], rest.mean, rest.min, rest.max, rest.valid,
                 rest.missed, gMotion.gyroBias());
        const double gravity = std::sqrt(imu->accelG[0] * imu->accelG[0] +
                                         imu->accelG[1] * imu->accelG[1] +
                                         imu->accelG[2] * imu->accelG[2]);
        if (gravity < 0.8 || gravity > 1.2) problem("acelerometro nao le 1 g");
    } else {
        ESP_LOGE("diag", "imu: NAO respondeu (WHO_AM_I %s, leitura %s)", who ? "ok" : "falhou",
                 imu ? "ok" : "falhou");
        problem("IMU sem leitura");
    }
    drainLog();
    if (rest.missed > 0) problem("leituras do giroscopio perdidas");
    if (rest.max - rest.min > controller::robot::kGyroRestMaxSpreadDps) {
        problem("giroscopio variou: o robo estava mesmo parado?");
    }
    if (std::fabs(rest.mean) > controller::robot::kGyroRestMaxBiasDps) {
        problem("desvio do giroscopio acima do normal");
    }

    // 5) Energia.
    const bool powerPresent = gPower.present();
    const double volts = gPower.busVoltageV();
    ESP_LOGI("diag", "energia: bateria=%.2f V corrente=%.2f A potencia=%.2f W, INA219 %s", volts,
             gPower.currentA(), gPower.powerW(), powerPresent ? "ok" : "NAO respondeu");
    drainLog();
    if (!powerPresent) problem("INA219 sem resposta");
    if (volts < 7.0) problem("bateria abaixo de 7,0 V");

    // 6) Entradas: botão e DIP agora, e o que o DIP valeu no boot.
    const int button = gpio_get_level(adapters::pins::kButton);
    const int dip1 = gpio_get_level(adapters::pins::kDip1);
    const int dip2 = gpio_get_level(adapters::pins::kDip2);
    const int dip3 = gpio_get_level(adapters::pins::kDip3);
    ESP_LOGI("diag",
             "entradas: botao START=%s | DIP agora via1=%s via2=%s via3=%s | DIP valendo (lido no "
             "boot): labirinto %dx%d, via 3 %s = borda a %s do robo",
             button == 0 ? "APERTADO" : "solto", dip1 == 0 ? "fechada" : "aberta",
             dip2 == 0 ? "fechada" : "aberta", dip3 == 0 ? "fechada" : "aberta", setup.columns,
             setup.rows, domain::startBorderIsOnTheLeft(setup) ? "aberta" : "fechada",
             domain::startBorderIsOnTheLeft(setup) ? "ESQUERDA" : "DIREITA");
    drainLog();
    if (button == 0) problem("botao START em nivel de apertado");
    if ((dip3 != 0) != domain::startBorderIsOnTheLeft(setup)) {
        problem("via 3 mexida depois do boot (reinicie)");
    }

    // 7) Encoders parados: não podem contar sozinhos.
    long left = 0;
    long right = 0;
    gMotion.resetEncoders();
    vTaskDelay(pdMS_TO_TICKS(1000));
    gMotion.readEncoders(left, right);
    ESP_LOGI("diag", "encoders: em 1 s parado contaram E=%ld D=%ld (esperado 0)", left, right);
    drainLog();
    if (left > 2 || left < -2 || right > 2 || right < -2) {
        problem("encoder contou com a roda parada");
    }

    // 8) Contadores desde o boot.
    logHealth();
    unsigned i2cErrors = gImu.readErrors() + gPower.readErrors();
    unsigned dropouts = 0;
    for (int i = 0; i < 3; ++i) {
        const adapters::Vl53l1xSensorAdapter::Health health = gSensor.health(kTofSides[i]);
        i2cErrors += health.i2cErrors;
        dropouts += health.dropouts + health.recoveries + health.failedRecoveries;
    }
    // Um erro isolado de I²C não é defeito; vários são (o número fica nas linhas "saude").
    if (i2cErrors > 5) problem("houve erros de I2C desde o boot (ver saude)");
    if (dropouts > 0) problem("um ToF caiu desde o boot (ver saude)");

    if (problemCount == 0) {
        ESP_LOGI("diag", "fim: OK, nenhum problema encontrado");
    } else {
        ESP_LOGE("diag", "fim: %d PROBLEMA(S): %s", problemCount, problems);
    }
}

// Atende os comandos de teste pendentes. Com `allowMotion` falso (robô em Erro), os que mexem os
// motores são recusados; os de leitura continuam valendo, para ver onde o robô ficou e por quê.
void serviceTestCommands(const domain::MazeSetup& setup, bool allowMotion) {
    auto refused = [allowMotion](const char* name) {
        if (!allowMotion) {
            ESP_LOGW("teste", "comando '%s' IGNORADO: o robo esta em Erro e nao mexe os motores. "
                              "Mande reiniciar", name);
        }
        return !allowMotion;
    };
    if (const int rejected = gRejectedCommands.exchange(0); rejected > 0) {
        ESP_LOGW("teste", "%d comando(s) recusado(s): desconhecido ou fora da faixa", rejected);
    }
    if (const int ms = gTestMs.exchange(0); ms > 0 && !refused("frente")) {
        gMotion.setBatteryVolts(gPower.busVoltageV());
        gMotion.openLoopTest(gTestPermille.load() / 1000.0, static_cast<uint32_t>(ms));
    }
    if (const int maneuver = gTestManeuver.exchange(0); maneuver != 0 && !refused("manobra")) {
        gMotion.setBatteryVolts(gPower.busVoltageV());
        gMotion.testManeuver(static_cast<adapters::Drv8833MotionAdapter::Maneuver>(maneuver),
                             gTestRunCells.load());
    }
    if (const int mask = gTestWheelMask.exchange(0); mask != 0 && !refused("motor")) {
        gMotion.setBatteryVolts(gPower.busVoltageV());
        gMotion.wheelTest((mask & 1) != 0, (mask & 2) != 0, gTestWheelMillivolts.load() / 1000.0,
                          static_cast<uint32_t>(gTestWheelMs.load()));
    }
    if (gTestWheelSweep.exchange(false) && !refused("rodas")) {
        gMotion.setBatteryVolts(gPower.busVoltageV());
        gMotion.wheelSweep();
    }
    if (const int seconds = gTestGyroAngleSeconds.exchange(0); seconds > 0) {
        gMotion.gyroAngleWatch(seconds);
    }
    if (const int seconds = gTestEncoderSeconds.exchange(0); seconds > 0) {
        gMotion.encoderWatch(seconds);
    }
    if (gTestTof.exchange(false)) {
        using Side = adapters::Vl53l1xSensorAdapter::Side;
        for (int i = 0; i < 5; ++i) {
            const auto tof = gSensor.settledReadings();
            ESP_LOGI("teste", "tof %d/5: E=%d (%s) F=%d (%s) D=%d (%s)", i + 1, tof[0].mm,
                     gSensor.statusText(Side::Left), tof[1].mm, gSensor.statusText(Side::Front),
                     tof[2].mm, gSensor.statusText(Side::Right));
        }
    }
    if (const int seconds = gTestTofMonSeconds.exchange(0); seconds > 0) {
        runTofMonitor(seconds);
    }
    if (gTestTofRecover.exchange(false)) {
        (void)gSensor.settledReadings();  // atualiza quem está em falha
        const int recovered = gSensor.recoverFailed();
        ESP_LOGI("teste", "tofrec: %d sensor(es) reiniciado(s) pelo XSHUT%s", recovered,
                 recovered == 0 ? " (nenhum estava em falha, ou o reinicio nao deu certo: veja as "
                                  "linhas tof acima)"
                                : "");
    }
    if (gTestGyro.exchange(false)) {
        const adapters::Drv8833MotionAdapter::GyroRest rest = gMotion.measureGyroRest(250);
        const std::optional<adapters::Mpu6050::Sample> imu = gImu.readAll();
        ESP_LOGI("teste",
                 "giroscopio em repouso: %.3f graus/s (media de %d leituras) min %.2f max %.2f, %d "
                 "perdidas, temp %.1f C, ligado ha %lu s, desvio em uso %.3f",
                 rest.mean, rest.valid, rest.min, rest.max, rest.missed,
                 imu ? imu->temperatureC : -99.0, uptimeSeconds(), gMotion.gyroBias());
    }
    if (gTestDiag.exchange(false)) {
        runDiagnostics(setup);
    }
    if (gTestHealth.exchange(false)) {
        logHealth();
    }
    if (gTestCalib.exchange(false)) {
        serviceCalibrationCommand(gCalibText);
    }
}
#endif  // !CONFIG_RATO_BANCADA
#endif

// Quadro de relato (19/11): o labirinto em pé sai girado como o deitado correspondente.
domain::ReportFrame gReport{domain::makeMazeSetup(domain::MazeType::Small4x4, false)};

// O tipo de labirinto desta largada: o do DIP lido no boot, ou o do comando `labirinto`.
domain::MazeSetup currentSetup(const domain::MazeSetup& boot) {
    const int forced = gMazeOverride.load();
    domain::MazeType type = forced < 0 ? boot.type : static_cast<domain::MazeType>(forced);
    if (gOrientationFlip.load()) {
        type = domain::flipOrientation(type);
    }
    return domain::makeMazeSetup(type, !domain::startBorderIsOnTheLeft(boot));
}

// Toque longo: alterna a orientação, loga e toca o som (3 bips = em pé, 1 bip longo = deitado).
void toggleOrientation(const domain::MazeSetup& boot, domain::MazeSetup& setup) {
    gOrientationFlip = !gOrientationFlip.load();
    setup = currentSetup(boot);
    gReport = domain::ReportFrame(setup);
    const bool portrait = domain::isPortrait(setup.type);
    ESP_LOGW(kTag, "toque longo: labirinto %dx%d %s (relato ao painel: %s%s)", setup.columns,
             setup.rows, portrait ? "EM PE" : "deitado",
             protocol::mazeToString(setup.type).c_str(),
             gReport.rotated() ? ", mapa girado 90 graus" : "");
    gLocal.playPattern(portrait ? domain::BuzzerPattern::Portrait
                                : domain::BuzzerPattern::Landscape);
}

void writeState(const telemetry::Snapshot& raw) {
    telemetry::Snapshot state = raw;
    state.position = gReport.position(raw.position);
    state.heading = gReport.direction(raw.heading);
    if (xSemaphoreTake(gStateMutex, portMAX_DELAY) == pdTRUE) {
        gState = state;
        xSemaphoreGive(gStateMutex);
    }
}

telemetry::Snapshot readState() {
    telemetry::Snapshot state{};
    if (xSemaphoreTake(gStateMutex, portMAX_DELAY) == pdTRUE) {
        state = gState;
        xSemaphoreGive(gStateMutex);
    }
    return state;
}

// ===================== Tarefa de navegação (alta prioridade) =================
void navigationTask(void*) {
    gI2c.begin();
    gSensor.begin(gI2c.handle());
    gImu.begin(gI2c.handle());
    gPower.begin(gI2c.handle());
    gLocal.begin();
    gDip.begin();
    gMotion.begin();
    ESP_LOGI(kTag, "mapa de pinos dos motores: %s", adapters::pins::kMotorWiringName);
    ESP_LOGI(kTag, "PWM dos motores em %s, controle em volts (teto %.1f V no motor)",
             adapters::kMotorDecayName, controller::robot::kMotorMaxVolts);
#if !CONFIG_RATO_BANCADA
    gMotion.enableFrontStop(gSensor);
    gMotion.setPowerMonitor(gPower);
#endif
#if CONFIG_RATO_LOG_RETA && !CONFIG_RATO_BANCADA
    gMotion.setAbortFlag(gRemoteStop);
#endif
#if !CONFIG_RATO_BANCADA
    // Os ToF laterais ficam sempre à mão; quem liga a centralização é o `calib centralizar` (a
    // opção RATO_CENTRALIZAR_PAREDES do Kconfig é só o padrão dele).
    gMotion.enableWallCentering(gSensor);
    gMotion.setCalibration(loadCalibration());
    // CAD x campo na frente do robô: não podem estar certos os dois (19/11). Avisa a cada boot até a
    // medida no robô decidir (`calib preset_cad=1` usa o CAD). Não há paquímetro: trena ou fita métrica.
    if (domain::bodyConflictsWithCad(gMotion.calibration())) {
        ESP_LOGW("calib",
                 "AVISO: a frente em uso (chassi %.1f, ToF %.1f mm do eixo) difere do CAD (%.2f / "
                 "%.2f) em %.1f mm (> %.0f): meca com trena e grave com `calib`",
                 gMotion.calibration().axleToFrontMm, gMotion.calibration().axleToFrontTofMm,
                 domain::robot::kCadAxleToFrontMm, domain::robot::kCadAxleToFrontTofMm,
                 domain::bodyVsCadGapMm(gMotion.calibration()), domain::robot::kBodyConflictMm);
    }
    if (gMotion.calibration().centerOnWalls >= 0.5) {
        ESP_LOGW(kTag, "centralizacao pelas paredes (RF-44) LIGADA, ganhos nao calibrados");
    }
    logCalibration();
#endif

    use_cases::SessionManager session(gLocal);

    // RNF-35: o DIP é lido UMA vez, aqui no boot, e travado. Uma chave mexida durante a corrida
    // não muda o labirinto nem o canto de partida. Vias 1 e 2 fechadas juntas são uma combinação
    // proibida (#393): o decoder lança, e sem tratar a exceção a placa reiniciaria em laço. Aqui
    // o robô sinaliza a falha e não larga.
    vTaskDelay(pdMS_TO_TICKS(10));  // os pull-ups internos das vias assentam
    std::optional<domain::MazeSetup> parsedSetup;
    try {
        parsedSetup = gDip.read();
    } catch (const std::invalid_argument&) {
    }
    if (!parsedSetup) {
        ESP_LOGE(kTag, "DIP em combinacao proibida (vias 1 e 2 fechadas): o robo nao larga");
        session.fault();
        telemetry::Snapshot state{};
        state.phase = session.getCurrentPhase();
        writeState(state);
        while (true) {
            vTaskDelay(pdMS_TO_TICKS(200));
        }
    }
    const domain::MazeSetup bootSetup = *parsedSetup;
    domain::MazeSetup setup = bootSetup;
    ESP_LOGI(kTag, "DIP lido no boot: labirinto %dx%d, partida pela %s", setup.columns, setup.rows,
             setup.start.column == 0 ? "esquerda" : "direita");

    int runIndex = 0;
    while (true) {
        ++runIndex;
        ESP_LOGI(kTag, "aguardando o botao de largada");
        while (gLocal.buttonPressed()) {  // espera soltar o botão da sessão anterior
            vTaskDelay(pdMS_TO_TICKS(10));
        }
#if CONFIG_RATO_LOG_RETA
        gRemoteStart = false;
        [[maybe_unused]] int idleTicks = 0;
        // Toque curto larga (ao soltar); toque longo alterna a orientação do labirinto e NÃO larga.
        domain::ButtonGesture gesture(gLocal.buttonPressed());
        while (true) {
            if (gRemoteStart.exchange(false)) {
                break;
            }
            const domain::ButtonEvent touch =
                gesture.update(gLocal.buttonPressed(), static_cast<uint32_t>(nowMs()));
            if (touch == domain::ButtonEvent::ShortPress) {
                break;
            }
            if (touch == domain::ButtonEvent::LongPress) {
                toggleOrientation(bootSetup, setup);
            }
#if !CONFIG_RATO_BANCADA
            {
                // O comando `labirinto` pode ter trocado o tipo: loga a mudança (o roteiro espera).
                const domain::MazeSetup before = setup;
                setup = currentSetup(bootSetup);
                if (before.type != setup.type) {
                    ESP_LOGW(kTag, "labirinto da proxima largada: %dx%d%s", setup.columns, setup.rows,
                             domain::isPortrait(setup.type) ? " (em pe)" : "");
                }
            }
            serviceTestCommands(setup, true);
            if (++idleTicks >= 100) {  // ~1 s: avisa se um sensor parou de responder (ou voltou)
                idleTicks = 0;
                watchHealth();
                // Mantém o desvio do giroscópio em dia enquanto espera (sem logar).
                (void)gMotion.calibrateGyro(50, true);
            }
#endif
            vTaskDelay(pdMS_TO_TICKS(10));
        }
        gRemoteStop = false;
#else
        [[maybe_unused]] int idleTicks = 0;
        domain::ButtonGesture gesture(gLocal.buttonPressed());
        while (true) {
            const domain::ButtonEvent touch =
                gesture.update(gLocal.buttonPressed(), static_cast<uint32_t>(nowMs()));
            if (touch == domain::ButtonEvent::ShortPress) {
                break;
            }
            if (touch == domain::ButtonEvent::LongPress) {
                toggleOrientation(bootSetup, setup);
            }
#if !CONFIG_RATO_BANCADA
            if (++idleTicks >= 200) {  // ~2 s: mantém o desvio do giroscópio em dia (sem logar)
                idleTicks = 0;
                (void)gMotion.calibrateGyro(50, true);
            }
#endif
            vTaskDelay(pdMS_TO_TICKS(10));
        }
#endif
        ESP_LOGI(kTag, "botao de largada acionado");
        session.start();

#if CONFIG_RATO_BANCADA
        const bool selfTestOk = true;  // bancada: sem IMU nem INA219
#else
        // RF-27: IMU, INA219 e os 3 ToF precisam responder; sem os ToF o robô não vê as paredes.
        const bool selfTestOk = gImu.present() && gPower.present() && gSensor.allReady();
#endif
        session.onSelfTestResult(selfTestOk);
        if (!selfTestOk) {
#if !CONFIG_RATO_BANCADA
            // Sem isto, na bateria (sem cabo), um auto-teste reprovado não aparecia em lugar
            // nenhum: o painel recebe uma corrida que falha na hora, com o motivo.
            TeleEvent failStart{};
            failStart.kind = TeleEvent::Start;
            failStart.time = nowMs();
            failStart.runIndex = runIndex;
            failStart.mazeType = static_cast<int>(setup.type);
            postEvent(failStart);
            TeleEvent failEnd{};
            failEnd.kind = TeleEvent::End;
            failEnd.time = nowMs();
            failEnd.success = false;
            std::snprintf(failEnd.detail, sizeof failEnd.detail, "auto-teste reprovou:%s%s%s%s%s",
                          gImu.present() ? "" : " IMU", gPower.present() ? "" : " INA219",
                          gSensor.ready(adapters::Vl53l1xSensorAdapter::Side::Left) ? "" : " ToF esquerdo",
                          gSensor.ready(adapters::Vl53l1xSensorAdapter::Side::Front) ? "" : " ToF frontal",
                          gSensor.ready(adapters::Vl53l1xSensorAdapter::Side::Right) ? "" : " ToF direito");
            postEvent(failEnd);
            ESP_LOGE(kTag, "%s", failEnd.detail);
#endif
            telemetry::Snapshot state{};
            state.phase = session.getCurrentPhase();
            writeState(state);
            while (true) {
#if CONFIG_RATO_LOG_RETA && !CONFIG_RATO_BANCADA
                // Em Erro, os comandos de leitura (diag, saude, tof, tofmon, giro) continuam
                // valendo: é o diag que diz qual sensor reprovou o auto-teste.
                serviceTestCommands(setup, false);
#endif
                vTaskDelay(pdMS_TO_TICKS(200));
            }
        }

        TeleEvent startEvent{};
        startEvent.kind = TeleEvent::Start;
        startEvent.time = nowMs();
        startEvent.runIndex = runIndex;
        startEvent.mazeType = static_cast<int>(setup.type);
        postEvent(startEvent);

        // O tipo desta largada: o do DIP, ou o do comando `labirinto` (4x8 e 4x12 em pé). O mapa gira
        // só na saída da telemetria (domain::ReportFrame); dentro do robô fica no quadro dele.
        setup = currentSetup(bootSetup);
        gReport = domain::ReportFrame(setup);
        if (gMazeOverride.load() >= 0 || gOrientationFlip.load()) {
            ESP_LOGW(kTag,
                     "labirinto diferente do DIP (%dx%d): %dx%d (%s)%s", bootSetup.columns,
                     bootSetup.rows, setup.columns, setup.rows,
                     gMazeOverride.load() >= 0 ? "comando BLE" : "toque longo",
                     gReport.rotated() ? ", relatado ao painel como o deitado, mapa girado" : "");
        }
        domain::MazeMap maze(setup.rows, setup.columns);
        maze.initKnownPerimeter();
        use_cases::Navigator navigator(maze, gSensor, gMotion, setup.start,
                                       domain::Direction::North, {setup.goal});
#if !CONFIG_RATO_BANCADA
        // Reta contínua (20/11): trechos retos num movimento só (`calib reta_continua`, padrão 1).
        navigator.setContinuousRuns(gMotion.calibration().continuousRun >= 0.5);
        navigator.setContinuousTurns(gMotion.calibration().continuousRun >= 0.5 &&
                                     gMotion.calibration().continuousTurn >= 0.5);
#endif

        // Limite de bateria fraca pelo `calib bateria_minima` (padrão 6,6 V). Nos testes de 20/11 o INA219 do robô lê ~1,7 V
        // abaixo do cellmeter, e o limite foi posto em 5,5 V com `calib bateria_minima=5.5` enquanto a equipe de energia investiga.
        const double lowBatteryV = gMotion.calibration().batteryLowV;
        if (lowBatteryV < domain::BatteryMonitor::kDefaultLowVoltageV) {
            ESP_LOGW(kTag, "AVISO: limite de bateria fraca em %.1f V (padrao %.1f V)", lowBatteryV,
                     domain::BatteryMonitor::kDefaultLowVoltageV);
        }
        domain::BatteryMonitor battery(lowBatteryV);
        domain::SensorHealthMonitor sensorHealth;
        char failure[190] = "";  // motivo, se a corrida terminar em falha
        int cells = 0;
        [[maybe_unused]] int steps = 0;
        domain::Position last = setup.start;
        int guard = setup.rows * setup.columns * 4;
        [[maybe_unused]] const int droppedEventsBefore = gDroppedEvents.load();
        [[maybe_unused]] const int droppedLinesBefore = gDroppedLogLines.load();

        // A posição de largada vai para o painel já agora: antes, até o primeiro passo terminar, a
        // telemetria mandava (0,0), o canto errado.
        {
            telemetry::Snapshot startState{};
            startState.phase = session.getCurrentPhase();
            startState.position = setup.start;
            startState.heading = domain::Direction::North;
            writeState(startState);
            // O que o painel recebe (19/11): com o labirinto em pé o mapa sai girado; x = coluna e
            // y = linha do quadro relatado. O roteiro (`python t.py O3`) confere esta linha.
            const domain::Position reportedStart = gReport.position(setup.start);
            ESP_LOGI(kTag, "relato ao painel: labirinto %s, largada x=%d y=%d rumo %c%s",
                     protocol::mazeToString(setup.type).c_str(), reportedStart.column,
                     reportedStart.row, directionLetter(gReport.direction(domain::Direction::North)),
                     gReport.rotated() ? " (mapa girado)" : "");
        }

#if !CONFIG_RATO_BANCADA
        gMotion.resetRunCounters();
        // Retrato da configuração a cada largada (10/11): com ele, um log de corrida basta para
        // saber com que labirinto, canto, opções e parâmetros o robô correu. O "DIP lido no boot"
        // sai antes de a ponte BLE conectar e se perdia.
        ESP_LOGI(kTag,
                 "largada %d: labirinto %dx%d, via 3 %s (borda a %s do robo), largada (l%d,c%d) "
                 "virado N, objetivo (l%d,c%d), bat=%.2f V, firmware %s",
                 runIndex, setup.columns, setup.rows,
                 domain::startBorderIsOnTheLeft(setup) ? "ABERTA" : "FECHADA",
                 domain::startBorderIsOnTheLeft(setup) ? "ESQUERDA" : "DIREITA", setup.start.row,
                 setup.start.column, setup.goal.row, setup.goal.column, gPower.busVoltageV(),
                 esp_app_get_description()->version);
        {
            const domain::Calibration& calib = gMotion.calibration();
            ESP_LOGI(kTag,
                     "parametros: %s, RF-44 %s, parede lateral<%.0f frontal<%.0f mm, arco comeca a "
                     "%.0f mm (folga %.0f, corpo %.0f/%.0f/%.0f), parada frontal<%.0f mm, teto %.1f V",
                     adapters::kMotorDecayName, calib.centerOnWalls >= 0.5 ? "ligado" : "desligado",
                     gSensor.sideThresholdMm(), gSensor.frontThresholdMm(),
                     gMotion.arcStartTargetMm(), controller::robot::kArcFrontClearanceMm,
                     calib.axleToFrontMm, calib.frontWidthMm / 2.0, calib.axleToFrontTofMm,
                     calib.frontStopMm, controller::robot::kMotorMaxVolts);
            ESP_LOGI(kTag,
                     "calib em uso: giro x%.3f, freio arco %.1f pivo %.1f graus (autoajuste %s), "
                     "ganho de rumo %.2f mm/grau",
                     calib.gyroScale, gMotion.arcBrakeDeg(), gMotion.pivotBrakeDeg(),
                     calib.autoBrake >= 0.5 ? "ligado" : "desligado", calib.headingGain);
        }

        // Conferência do canto (10/11): duas leituras (a primeira depois do boot vem com lixo). Se
        // nas duas o lado da borda está ABERTO, a via 3 não corresponde ao canto, e o robô não
        // larga: com o mapa espelhado ele andaria até o limite de passos sem chegar.
        {
            using Side = adapters::Vl53l1xSensorAdapter::Side;
            (void)gSensor.sense();
            const ports::WallsAhead first = gSensor.sense();
            const ports::WallsAhead second = gSensor.sense();
            ESP_LOGI(kTag, "largada: tof E=%d (%s) F=%d (%s) D=%d (%s)",
                     gSensor.reading(Side::Left).mm, gSensor.statusText(Side::Left),
                     gSensor.reading(Side::Front).mm, gSensor.statusText(Side::Front),
                     gSensor.reading(Side::Right).mm, gSensor.statusText(Side::Right));
            auto wrong = [&setup](const ports::WallsAhead& w) {
                return domain::checkStartCorner(setup, w.left, w.leftUnknown, w.right,
                                                w.rightUnknown) ==
                       domain::StartCheck::BorderSideOpen;
            };
            if (wrong(first) && wrong(second)) {
                const bool onLeft = domain::startBorderIsOnTheLeft(setup);
                std::snprintf(failure, sizeof failure,
                              "largada recusada: sem parede a %s do robo, onde a via 3 (%s) diz "
                              "haver borda. tof E=%d F=%d D=%d. Troque a via 3 e reinicie",
                              onLeft ? "esquerda" : "direita", onLeft ? "aberta" : "fechada",
                              gSensor.reading(Side::Left).mm, gSensor.reading(Side::Front).mm,
                              gSensor.reading(Side::Right).mm);
                ESP_LOGE(kTag, "%s", failure);
                guard = 0;  // não entra no laço da corrida
            }
        }
        // Desvio do giroscópio (12/11): medido aqui, ~0,5 s depois do botão (o dedo de quem apertou
        // já saiu), e descontado em toda a corrida. Se o robô ainda se mexia, vale a medida feita
        // enquanto ele esperava a largada. A linha "giro" diz o valor e se foi aceito.
        (void)gMotion.calibrateGyro(100);
#endif
        [[maybe_unused]] const controller::RaceDeadline deadline(controller::robot::kRaceTimeLimitS);
        [[maybe_unused]] const int64_t raceStartUs = esp_timer_get_time();
        while (!navigator.reachedGoal() && guard-- > 0) {
#if !CONFIG_RATO_BANCADA
            // Limite de tempo de segurança (19/11): a meta é resolver em até 10 min. Passado o
            // limite, para com o motivo explícito (antes só havia o limite de passos).
            if (const double elapsedS = static_cast<double>(esp_timer_get_time() - raceStartUs) / 1e6;
                deadline.expired(elapsedS)) {
                deadline.describe(failure, sizeof failure, elapsedS, steps, cells);
                ESP_LOGE(kTag, "%s", failure);
                break;
            }
            // RF-55: a cada passo confere os sensores e a bateria. Uma falha confirmada (várias
            // verificações seguidas) leva ao estado Erro; um NACK isolado no I²C é tolerado. Os
            // ToF contam pelo último sense(): um sensor que parou de ler não pode virar "sem
            // parede" sem ninguém perceber.
            const bool imuOk = gImu.present();
            const bool powerOk = gPower.present();
            if (sensorHealth.update(imuOk && powerOk && gSensor.healthy())) {
                domain::describeSensorFailure(failure, sizeof failure, imuOk, powerOk,
                                              gSensor.faultSummary());
                ESP_LOGE(kTag, "%s", failure);
                break;
            }
            const double voltage = gPower.busVoltageV();
            gMotion.setBatteryVolts(voltage);  // volts no motor -> PWM pela bateria real
            if (battery.update(voltage)) {
                std::snprintf(failure, sizeof failure, "bateria fraca: %.2f V", voltage);
                ESP_LOGE(kTag, "%s", failure);
                break;
            }
#endif
            const domain::Position sensed = navigator.getPosition();  // a célula que o passo sente
#if !CONFIG_RATO_BANCADA
            gMotion.clearLastMove();
#endif
            navigator.step();
            ++steps;
#if CONFIG_RATO_LOG_RETA && !CONFIG_RATO_BANCADA
            {
                // Uma linha por passo: onde estava, o que os sensores leram (mm e estado), o que
                // ficou no mapa daquela célula (P parede, A aberto, ? não visto, na ordem N L S O),
                // a distância até o objetivo, o que decidiu e onde acha que está agora.
                using Side = adapters::Vl53l1xSensorAdapter::Side;
                const use_cases::StepReport& r = navigator.lastStep();
                const domain::Position now = navigator.getPosition();
                char runText[64] = "";
                int runUsed = 0;
                if (r.cells > 1) {
                    runUsed = std::snprintf(runText, sizeof runText, " (%d celulas)", r.cells);
                }
                if (r.runTurn != use_cases::StepAction::None && runUsed >= 0 &&
                    runUsed < static_cast<int>(sizeof runText)) {
                    std::snprintf(runText + runUsed, sizeof runText - static_cast<size_t>(runUsed),
                                  " (curva %s sem parar)", use_cases::stepActionName(r.runTurn));
                }
                ESP_LOGI("nav",
                         "passo %d: cel (l%d,c%d) rumo %c | tof E=%d (%s) F=%d (%s) D=%d (%s) | "
                         "mapa NLSO=%c%c%c%c | dist=%d | acao=%s%s%s%s -> (l%d,c%d) rumo %c | "
                         "fora=%d bat=%.2f",
                         steps, r.cell.row, r.cell.column, directionLetter(r.heading),
                         gSensor.reading(Side::Left).mm, gSensor.statusText(Side::Left),
                         gSensor.reading(Side::Front).mm, gSensor.statusText(Side::Front),
                         gSensor.reading(Side::Right).mm, gSensor.statusText(Side::Right),
                         wallLetter(maze, r.cell, domain::Direction::North),
                         wallLetter(maze, r.cell, domain::Direction::East),
                         wallLetter(maze, r.cell, domain::Direction::South),
                         wallLetter(maze, r.cell, domain::Direction::West), r.distance,
                         use_cases::stepActionName(r.action), runText,
                         r.forgotMap ? " (mapa esquecido)" : "",
                         r.avoidedBlindReverse ? " (evitou re as cegas)" : "", now.row, now.column,
                         directionLetter(navigator.getHeading()), r.outsideOpenings,
                         gMotion.batteryVolts());
            }
#endif
            if (navigator.stuck()) {
                using Side = adapters::Vl53l1xSensorAdapter::Side;
                std::snprintf(failure, sizeof failure,
                              "sem caminho ate o objetivo em (%d,%d), mesmo lendo de novo. "
                              "tof E=%d F=%d D=%d %s",
                              sensed.row, sensed.column, gSensor.reading(Side::Left).mm,
                              gSensor.reading(Side::Front).mm, gSensor.reading(Side::Right).mm,
                              gSensor.faultSummary());
                ESP_LOGE(kTag, "%s", failure);
                break;
            }
            // Um movimento que não termina no tempo (motor travado, roda solta) ou com uma roda
            // parada leva ao Erro, em vez de o robô esperar para sempre ou seguir com o mapa errado.
            if (!gMotion.lastMoveOk()) {
                char move[64];
                gMotion.describeLastMove(move, sizeof move);
                using Side = adapters::Vl53l1xSensorAdapter::Side;
                std::snprintf(failure, sizeof failure,
                              "%s falhou (%s): %s. tof E=%d F=%d D=%d %s", gMotion.lastMoveName(),
                              gMotion.lastMoveFailure(), move, gSensor.reading(Side::Left).mm,
                              gSensor.reading(Side::Front).mm, gSensor.reading(Side::Right).mm,
                              gSensor.faultSummary());
                ESP_LOGE(kTag, "%s", failure);
                break;
            }
            const domain::Position position = navigator.getPosition();
            if (!(position == last)) {
                cells += navigator.lastStep().cells > 1 ? navigator.lastStep().cells : 1;
                last = position;
            }

            TeleEvent cellEvent{};
            cellEvent.kind = TeleEvent::Cell;
            cellEvent.time = nowMs();
            // As paredes da célula que o passo SENTIU. Antes ia a célula nova, ainda não lida, e o
            // painel só mostrava o perímetro.
            cellEvent.position = gReport.position(sensed);
            const domain::ReportFrame::Walls reported = gReport.walls(
                maze.isBlocked(sensed, domain::Direction::North),
                maze.isBlocked(sensed, domain::Direction::East),
                maze.isBlocked(sensed, domain::Direction::South),
                maze.isBlocked(sensed, domain::Direction::West));
            cellEvent.north = reported.north;
            cellEvent.east = reported.east;
            cellEvent.south = reported.south;
            cellEvent.west = reported.west;
            postEvent(cellEvent);

            telemetry::Snapshot state{};
            state.phase = session.getCurrentPhase();
            state.position = position;
            state.heading = navigator.getHeading();
            state.cells = cells;
            writeState(state);
        }

        bool reached = navigator.reachedGoal();
#if !CONFIG_RATO_BANCADA
        // Conferência da chegada (10/11): o objetivo é um canto. Se os sensores veem passagem onde
        // devia haver borda, o robô não está onde o mapa diz, e a corrida NÃO é sucesso (09/11,
        // C3k: sucesso declarado depois de o robô girar sem perceber).
        if (reached && !navigator.confirmArrival()) {
            using Side = adapters::Vl53l1xSensorAdapter::Side;
            reached = false;
            std::snprintf(failure, sizeof failure,
                          "chegada nao confere: no objetivo (l%d,c%d) rumo %c, um sensor ve "
                          "passagem onde ha borda. tof E=%d F=%d D=%d",
                          setup.goal.row, setup.goal.column,
                          directionLetter(navigator.getHeading()), gSensor.reading(Side::Left).mm,
                          gSensor.reading(Side::Front).mm, gSensor.reading(Side::Right).mm);
            ESP_LOGE(kTag, "%s", failure);
        }
#endif
        if (reached) {
            session.reachedGoal();
        } else {
            session.fault();
        }

        telemetry::Snapshot state = readState();
        state.phase = session.getCurrentPhase();
        writeState(state);

        TeleEvent endEvent{};
        endEvent.kind = TeleEvent::End;
        endEvent.time = nowMs();
        endEvent.success = reached;
        if (!reached) {
            if (failure[0] == '\0') {
                std::snprintf(failure, sizeof failure,
                              "limite de passos sem chegar ao objetivo. %s",
                              gSensor.faultSummary());
            }
            // Passagem vista para FORA do mapa: o mapa está montado para o lado errado (10/11).
            if (navigator.outsideOpenings() > 0) {
                const size_t used = std::strlen(failure);
                std::snprintf(failure + used, sizeof failure - used,
                              " | passagem para FORA do mapa lida %dx: confira a via 3 da DIP",
                              navigator.outsideOpenings());
                ESP_LOGE(kTag, "%s", failure);
            }
            std::strncpy(endEvent.detail, failure, sizeof endEvent.detail - 1);
        }
        postEvent(endEvent);

#if CONFIG_RATO_LOG_RETA
        // Resumo e mapa no fim da corrida: o que o robô acha que viu, célula a célula, para comparar
        // com a pista sem precisar medir nada com ele lá dentro.
        ESP_LOGI(kTag,
                 "fim da corrida %d: %s, %d passos, %d celulas, posicao (l%d,c%d) rumo %c, "
                 "passagens para fora=%d, eventos perdidos=%d, linhas de log perdidas=%d",
                 runIndex, reached ? "SUCESSO" : "FALHA", steps, cells,
                 navigator.getPosition().row, navigator.getPosition().column,
                 directionLetter(navigator.getHeading()), navigator.outsideOpenings(),
                 gDroppedEvents.load() - droppedEventsBefore,
                 gDroppedLogLines.load() - droppedLinesBefore);
#if !CONFIG_RATO_BANCADA
        ESP_LOGI(kTag, "movimento: %d arco(s) repetido(s), %d parada(s) pela parede da frente, "
                       "%d leitura(s) do giroscopio perdida(s)",
                 gMotion.arcRetriesUsed(), gMotion.frontStops(), gMotion.gyroMissesTotal());
        logHealth();  // erros de I2C, quedas e reinícios dos ToF, linhas perdidas (desde o boot)
#endif
        for (int row = 0; row < setup.rows; ++row) {
            char line[12 * 6 + 1];
            size_t used = 0;
            for (int column = 0; column < setup.columns && used + 6 < sizeof line; ++column) {
                const domain::Position cell{row, column};
                line[used++] = wallLetter(maze, cell, domain::Direction::North);
                line[used++] = wallLetter(maze, cell, domain::Direction::East);
                line[used++] = wallLetter(maze, cell, domain::Direction::South);
                line[used++] = wallLetter(maze, cell, domain::Direction::West);
                line[used++] = ' ';
            }
            line[used] = '\0';
            ESP_LOGI("nav", "mapa l%d (NLSO por celula, c0 em diante): %s", row, line);
            vTaskDelay(pdMS_TO_TICKS(30));  // deixa a telemetria escoar a fila de log
        }
#endif

        // RF-56: encerrada a sessão, volta ao Aguardando. O mapa, o contador de células e o
        // cronômetro nascem de novo na próxima largada. Uma falha não se desfaz: é preciso
        // reiniciar o robô.
        if (session.getCurrentPhase() == use_cases::SessionPhase::Fault) {
            while (true) {
#if CONFIG_RATO_LOG_RETA && !CONFIG_RATO_BANCADA
                // Em Erro, o robô fica onde parou: os comandos de leitura (tof, tofmon, diag,
                // saude, giro) continuam valendo, para ver onde ele está sem tirá-lo da pista.
                serviceTestCommands(setup, false);
#endif
                vTaskDelay(pdMS_TO_TICKS(200));
            }
        }
#if CONFIG_RATO_LOG_RETA
        discardTestCommands();
#endif
        session.rearm();
        telemetry::Snapshot idleState{};
        idleState.phase = session.getCurrentPhase();
        writeState(idleState);
    }
}

// ===================== Tarefa de telemetria (baixa prioridade) ===============
void telemetryTask(void*) {
#if CONFIG_RATO_LOG_RETA
    gBle.begin("RatoBorrachudo", onBleCommand);
#else
    gBle.begin("RatoBorrachudo");
#endif

    char boot[7];
    std::snprintf(boot, sizeof(boot), "%06x", static_cast<unsigned>(esp_random() & 0xFFFFFF));
    telemetry::TelemetryEmitter emitter(protocol::Encoder("rato-01", TELEMETRY_TOKEN, boot));
    telemetry::TelemetryBuffer buffer(60000, 4000);

    bool running = false;
    bool wasConnected = false;

    while (true) {
        const bool connected = gBle.isConnected();
        if (connected && !wasConnected) {
            gBle.publish(emitter.encodeHello());
            for (const std::string& message : buffer.messages()) {
                gBle.publish(message);
            }
        }
        wasConnected = connected;

#if CONFIG_RATO_LOG_RETA
        DebugLine debugLine;
        while (xQueueReceive(gDebugQueue, &debugLine, 0) == pdTRUE) {
            gBle.publish(plainLogLine(debugLine.text));
        }
#endif

        TeleEvent event;
        while (xQueueReceive(gEventQueue, &event, 0) == pdTRUE) {
            std::string message;
            switch (event.kind) {
                case TeleEvent::Start:
                    message = emitter.encodeStartRun(event.runIndex, event.time,
                                                     static_cast<domain::MazeType>(event.mazeType));
                    running = true;
                    break;
                case TeleEvent::Cell:
                    message = emitter.encodeCell(event.time, event.position, event.north,
                                                 event.east, event.south, event.west);
                    break;
                case TeleEvent::End:
                    message = emitter.encodeRunResult(
                        event.time,
                        event.success ? protocol::RunResult::Success
                                      : protocol::RunResult::Failure,
                        event.detail[0] != '\0' ? std::optional<std::string>(event.detail)
                                                 : std::nullopt);
                    running = false;
                    break;
            }
            buffer.add(event.time, message);
            gBle.publish(message);
        }

        if (running) {
            telemetry::Snapshot snapshot = readState();
            snapshot.speed.reset();
#if CONFIG_RATO_BANCADA
            // Bancada: sem INA219, valores fixos dentro da faixa aceita pelo backend.
            snapshot.voltage = 7.4;
            snapshot.amperage = 0.3;
            snapshot.watts = 2.2;
#else
            snapshot.voltage = gPower.busVoltageV();
            snapshot.amperage = gPower.currentA();
            snapshot.watts = gPower.powerW();
#endif
            const long time = nowMs();
            for (const std::string& message : emitter.encodeCycle(time, snapshot)) {
                buffer.add(time, message);
                gBle.publish(message);
            }
        }

        vTaskDelay(pdMS_TO_TICKS(100));
    }
}

}  // namespace

extern "C" void app_main() {
    gStateMutex = xSemaphoreCreateMutex();
    gEventQueue = xQueueCreate(64, sizeof(TeleEvent));
#if CONFIG_RATO_LOG_RETA
    // 64 linhas (eram 32): o diagnóstico e as manobras de teste soltam várias linhas seguidas.
    gDebugQueue = xQueueCreate(64, sizeof(DebugLine));
    gSerialLog = esp_log_set_vprintf(mirrorLogToBle);
#endif

    // 12 kB (eram 8): as linhas de log novas formatam vários números de ponto flutuante, e cada uma
    // passa por um buffer de 320 bytes na pilha (mirrorLogToBle).
    xTaskCreatePinnedToCore(navigationTask, "nav", 12288, nullptr, configMAX_PRIORITIES - 1, nullptr,
                            1);
    {
        // Cada gravação é identificável: versão (git describe do build), data e IDF no boot.
        const esp_app_desc_t* app = esp_app_get_description();
        ESP_LOGI(kTag, "firmware: versao %s, compilado em %s %s, IDF %s", app->version, app->date, app->time,
                 app->idf_ver);
    }
    xTaskCreatePinnedToCore(telemetryTask, "telemetry", 6144, nullptr, 1, nullptr, 0);
}
