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

void postEvent(const TeleEvent& event) {
    if (gEventQueue != nullptr) {
        xQueueSend(gEventQueue, &event, 0);
    }
}

#if CONFIG_RATO_LOG_RETA
// Diagnóstico sem cabo: na bateria, o serial não chega a ninguém (não se pode ligar o USB junto),
// então as linhas de log "reta", "curva" e "main" (motivo das falhas) também vão pelo BLE, como
// texto começando com "#". A ponte não as manda ao backend (não são mensagens do protocolo): grava
// num arquivo (bridge/ble_ws_bridge.py --log-robo).
struct DebugLine {
    char text[200];
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
            std::strstr(line.text, " teste: ") != nullptr) {
            xQueueSend(gDebugQueue, &line, 0);
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

void onBleCommand(const std::string& command) {
    if (command == "largar") {
        gRemoteStop = false;
        gRemoteStart = true;
    } else if (command == "parar") {
        gRemoteStop = true;
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
        domain::Position last = setup.start;
        int guard = setup.rows * setup.columns * 4;
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

        const bool reached = navigator.reachedGoal();
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
            std::strncpy(endEvent.detail, failure, sizeof endEvent.detail - 1);
        }
        postEvent(endEvent);

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

    xTaskCreatePinnedToCore(navigationTask, "nav", 8192, nullptr, configMAX_PRIORITIES - 1, nullptr,
                            1);
    xTaskCreatePinnedToCore(telemetryTask, "telemetry", 6144, nullptr, 1, nullptr, 0);
}
