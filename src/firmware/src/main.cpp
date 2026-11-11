// Composition Root do firmware - entrada do ESP-IDF (main).
// Liga o núcleo aos adapters e às tarefas FreeRTOS. Compilado
// apenas no alvo ESP32; o build de host usa src/main.cpp (stub).

#include <atomic>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <optional>
#include <stdexcept>
#include <string>

#include "adapters/BenchMotionAdapter.hpp"
#include "adapters/BleTelemetryAdapter.hpp"
#include "adapters/BoardPins.hpp"
#include "adapters/DipReaderAdapter.hpp"
#include "adapters/Drv8833MotionAdapter.hpp"
#include "controller/RobotMotion.hpp"
#include "adapters/I2cBus.hpp"
#include "adapters/Ina219.hpp"
#include "adapters/LocalInterfaceAdapter.hpp"
#include "adapters/Mpu6050.hpp"
#include "adapters/Vl53l1xSensorAdapter.hpp"
#include "domain/BatteryMonitor.hpp"
#include "domain/DipDecoder.hpp"
#include "domain/Maneuver.hpp"
#include "domain/Maze.hpp"
#include "domain/Odometry.hpp"
#include "domain/Pid.hpp"
#include "domain/RobotParameters.hpp"
#include "domain/SensorHealthMonitor.hpp"
#include "esp_log.h"
#include "esp_random.h"
#include "esp_system.h"
#include "esp_timer.h"
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
#if CONFIG_RATO_CENTRALIZAR_PAREDES
[[maybe_unused]] constexpr char kWallCenteringState[] = "ligado";
#else
[[maybe_unused]] constexpr char kWallCenteringState[] = "desligado";
#endif

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
char wallLetter(const domain::MazeMap& maze, const domain::Position& cell,
                domain::Direction direction) {
    switch (maze.getWall(cell, direction)) {
        case domain::Wall::Present: return 'P';
        case domain::Wall::Open: return 'A';
        case domain::Wall::Unknown: return '?';
    }
    return '?';
}

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
// "tof": 5 leituras dos três ToF com o robô parado, para calibrar fora do labirinto.
std::atomic<bool> gTestTof{false};
// "giro": deriva do giroscópio em repouso.
std::atomic<bool> gTestGyro{false};

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
        gTestManeuver = static_cast<int>(maneuver);
    } else if (command == "tof") {
        gTestTof = true;
    } else if (command == "giro") {
        gTestGyro = true;
    } else if (command == "reiniciar") {
        esp_restart();  // como o botão RST: depois de um Erro, a placa só larga de novo reiniciando
    } else if (command.rfind("frente ", 0) == 0) {
        float power = 0.0F;
        int ms = 0;
        if (std::sscanf(command.c_str() + 7, "%f %d", &power, &ms) == 2 && ms > 0 && ms <= 3000 &&
            power >= -1.0F && power <= 1.0F) {
            gTestPermille = static_cast<int>(power * 1000.0F);
            gTestMs = ms;
        }
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
#endif

void writeState(const telemetry::Snapshot& state) {
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
#endif
#if CONFIG_RATO_LOG_RETA && !CONFIG_RATO_BANCADA
    gMotion.setAbortFlag(gRemoteStop);
#endif
#if CONFIG_RATO_CENTRALIZAR_PAREDES && !CONFIG_RATO_BANCADA
    gMotion.enableWallCentering(gSensor);
    ESP_LOGW(kTag, "centralizacao pelas paredes (RF-44) LIGADA, ganhos nao calibrados");
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
    const domain::MazeSetup setup = *parsedSetup;
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
        while (!gLocal.buttonPressed() && !gRemoteStart.exchange(false)) {
#if !CONFIG_RATO_BANCADA
            if (const int ms = gTestMs.exchange(0); ms > 0) {
                gMotion.setBatteryVolts(gPower.busVoltageV());
                gMotion.openLoopTest(gTestPermille.load() / 1000.0, static_cast<uint32_t>(ms));
            }
            if (const int maneuver = gTestManeuver.exchange(0); maneuver != 0) {
                gMotion.setBatteryVolts(gPower.busVoltageV());
                gMotion.testManeuver(
                    static_cast<adapters::Drv8833MotionAdapter::Maneuver>(maneuver));
            }
            if (gTestTof.exchange(false)) {
                using Side = adapters::Vl53l1xSensorAdapter::Side;
                for (int i = 0; i < 5; ++i) {
                    const auto tof = gSensor.settledReadings();
                    ESP_LOGI("teste", "tof %d/5: E=%d (%s) F=%d (%s) D=%d (%s)", i + 1, tof[0].mm,
                             gSensor.statusText(Side::Left), tof[1].mm,
                             gSensor.statusText(Side::Front), tof[2].mm,
                             gSensor.statusText(Side::Right));
                }
            }
            if (gTestGyro.exchange(false)) {
                ESP_LOGI("teste", "giroscopio em repouso: %.3f graus/s (media de 250 leituras)",
                         gMotion.gyroRestRate(250));
            }
#endif
            vTaskDelay(pdMS_TO_TICKS(10));
        }
        gRemoteStop = false;
#else
        while (!gLocal.buttonPressed()) {
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
                vTaskDelay(pdMS_TO_TICKS(200));
            }
        }

        TeleEvent startEvent{};
        startEvent.kind = TeleEvent::Start;
        startEvent.time = nowMs();
        startEvent.runIndex = runIndex;
        startEvent.mazeType = static_cast<int>(setup.type);
        postEvent(startEvent);

        domain::MazeMap maze(setup.rows, setup.columns);
        maze.initKnownPerimeter();
        use_cases::Navigator navigator(maze, gSensor, gMotion, setup.start,
                                       domain::Direction::North, {setup.goal});

        domain::BatteryMonitor battery;
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
        }

#if !CONFIG_RATO_BANCADA
        gMotion.resetRunCounters();
        // Retrato da configuração a cada largada (10/11): com ele, um log de corrida basta para
        // saber com que labirinto, canto, opções e parâmetros o robô correu. O "DIP lido no boot"
        // sai antes de a ponte BLE conectar e se perdia.
        ESP_LOGI(kTag,
                 "largada %d: labirinto %dx%d, via 3 %s (borda a %s do robo), largada (l%d,c%d) "
                 "virado N, objetivo (l%d,c%d), bat=%.2f V",
                 runIndex, setup.columns, setup.rows,
                 domain::startBorderIsOnTheLeft(setup) ? "ABERTA" : "FECHADA",
                 domain::startBorderIsOnTheLeft(setup) ? "ESQUERDA" : "DIREITA", setup.start.row,
                 setup.start.column, setup.goal.row, setup.goal.column, gPower.busVoltageV());
        ESP_LOGI(kTag,
                 "parametros: %s, RF-44 %s, parede lateral<%.0f frontal<%.0f mm, arco comeca a "
                 "%.0f mm (folga %.0f, corpo %.0f/%.0f/%.0f), parada frontal<%.0f mm, teto %.1f V",
                 adapters::kMotorDecayName, kWallCenteringState, gSensor.sideThresholdMm(), gSensor.frontThresholdMm(),
                 controller::robot::kArcStartFrontMm, controller::robot::kArcFrontClearanceMm,
                 domain::robot::kBody.axleToFrontMm, domain::robot::kBody.halfWidthMm,
                 domain::robot::kBody.axleToFrontTofMm, controller::robot::kFrontStopMm,
                 controller::robot::kMotorMaxVolts);
        ESP_LOGI(kTag, "giroscopio em repouso: %.3f graus/s", gMotion.gyroRestRate(100));

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
#endif
        while (!navigator.reachedGoal() && guard-- > 0) {
#if !CONFIG_RATO_BANCADA
            // RF-55: a cada passo confere os sensores e a bateria. Uma falha confirmada (várias
            // verificações seguidas) leva ao estado Erro; um NACK isolado no I²C é tolerado. Os
            // ToF contam pelo último sense(): um sensor que parou de ler não pode virar "sem
            // parede" sem ninguém perceber.
            const bool imuOk = gImu.present();
            const bool powerOk = gPower.present();
            if (sensorHealth.update(imuOk && powerOk && gSensor.healthy())) {
                std::snprintf(failure, sizeof failure, "falha de sensor por 3 passos:%s%s %s",
                              imuOk ? "" : " IMU", powerOk ? "" : " INA219",
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
                ESP_LOGI("nav",
                         "passo %d: cel (l%d,c%d) rumo %c | tof E=%d (%s) F=%d (%s) D=%d (%s) | "
                         "mapa NLSO=%c%c%c%c | dist=%d | acao=%s%s%s -> (l%d,c%d) rumo %c | "
                         "fora=%d bat=%.2f",
                         steps, r.cell.row, r.cell.column, directionLetter(r.heading),
                         gSensor.reading(Side::Left).mm, gSensor.statusText(Side::Left),
                         gSensor.reading(Side::Front).mm, gSensor.statusText(Side::Front),
                         gSensor.reading(Side::Right).mm, gSensor.statusText(Side::Right),
                         wallLetter(maze, r.cell, domain::Direction::North),
                         wallLetter(maze, r.cell, domain::Direction::East),
                         wallLetter(maze, r.cell, domain::Direction::South),
                         wallLetter(maze, r.cell, domain::Direction::West), r.distance,
                         use_cases::stepActionName(r.action),
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
                ++cells;
                last = position;
            }

            TeleEvent cellEvent{};
            cellEvent.kind = TeleEvent::Cell;
            cellEvent.time = nowMs();
            // As paredes da célula que o passo SENTIU. Antes ia a célula nova, ainda não lida, e o
            // painel só mostrava o perímetro.
            cellEvent.position = sensed;
            cellEvent.north = maze.isBlocked(sensed, domain::Direction::North);
            cellEvent.east = maze.isBlocked(sensed, domain::Direction::East);
            cellEvent.south = maze.isBlocked(sensed, domain::Direction::South);
            cellEvent.west = maze.isBlocked(sensed, domain::Direction::West);
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
                vTaskDelay(pdMS_TO_TICKS(200));
            }
        }
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
    gDebugQueue = xQueueCreate(32, sizeof(DebugLine));
    gSerialLog = esp_log_set_vprintf(mirrorLogToBle);
#endif

    // 12 kB (eram 8): as linhas de log novas formatam vários números de ponto flutuante, e cada uma
    // passa por um buffer de 320 bytes na pilha (mirrorLogToBle).
    xTaskCreatePinnedToCore(navigationTask, "nav", 12288, nullptr, configMAX_PRIORITIES - 1, nullptr,
                            1);
    xTaskCreatePinnedToCore(telemetryTask, "telemetry", 6144, nullptr, 1, nullptr, 0);
}
