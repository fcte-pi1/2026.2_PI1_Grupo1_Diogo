// Composition Root do firmware - entrada do ESP-IDF (main).
// Liga o núcleo aos adapters e às tarefas FreeRTOS. Compilado
// apenas no alvo ESP32; o build de host usa src/main.cpp (stub).

#include <cstdio>
#include <optional>
#include <string>

#include "adapters/BenchMotionAdapter.hpp"
#include "adapters/BleTelemetryAdapter.hpp"
#include "adapters/DipReaderAdapter.hpp"
#include "adapters/Drv8833MotionAdapter.hpp"
#include "adapters/I2cBus.hpp"
#include "adapters/Ina219.hpp"
#include "adapters/LocalInterfaceAdapter.hpp"
#include "adapters/Mpu6050.hpp"
#include "adapters/Vl53l1xSensorAdapter.hpp"
#include "domain/DipDecoder.hpp"
#include "domain/Maneuver.hpp"
#include "domain/Maze.hpp"
#include "domain/Odometry.hpp"
#include "domain/Pid.hpp"
#include "esp_random.h"
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

// Parâmetros físicos.
// Todos estes valores devem ser AFERIDOS EM BANCADA antes da corrida final.
constexpr domain::WheelConfig kWheels{32.0, 280, 180.0};
constexpr domain::TurnConfig kTurn{32.0, 280, 90.0};
constexpr domain::PidGains kStraightGains{0.02, 0.0, 0.002};

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
adapters::Drv8833MotionAdapter gMotion{kWheels, kTurn, kStraightGains, gImu};
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
};
QueueHandle_t gEventQueue = nullptr;

long nowMs() { return static_cast<long>(esp_timer_get_time() / 1000); }

void postEvent(const TeleEvent& event) {
    if (gEventQueue != nullptr) {
        xQueueSend(gEventQueue, &event, 0);
    }
}

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

    use_cases::SessionManager session(gLocal);

    while (!gLocal.buttonPressed()) {
        vTaskDelay(pdMS_TO_TICKS(10));
    }
    session.start();

#if CONFIG_RATO_BANCADA
    const bool selfTestOk = true;  // bancada: sem IMU nem INA219
#else
    const bool selfTestOk = gImu.present() && gPower.present();
#endif
    session.onSelfTestResult(selfTestOk);
    if (!selfTestOk) {
        telemetry::Snapshot state{};
        state.phase = session.getCurrentPhase();
        writeState(state);
        while (true) {
            vTaskDelay(pdMS_TO_TICKS(200));
        }
    }

    const domain::MazeSetup setup = gDip.read();
    TeleEvent startEvent{};
    startEvent.kind = TeleEvent::Start;
    startEvent.time = nowMs();
    startEvent.runIndex = 1;
    startEvent.mazeType = static_cast<int>(setup.type);
    postEvent(startEvent);

    domain::MazeMap maze(setup.rows, setup.columns);
    maze.initKnownPerimeter();
    use_cases::Navigator navigator(maze, gSensor, gMotion, setup.start, domain::Direction::North,
                                   {setup.goal});

    int cells = 0;
    domain::Position last = setup.start;
    int guard = setup.rows * setup.columns * 4;
    while (!navigator.reachedGoal() && guard-- > 0) {
        navigator.step();
        const domain::Position position = navigator.getPosition();
        if (!(position == last)) {
            ++cells;
            last = position;
        }

        TeleEvent cellEvent{};
        cellEvent.kind = TeleEvent::Cell;
        cellEvent.time = nowMs();
        cellEvent.position = position;
        cellEvent.north = maze.isBlocked(position, domain::Direction::North);
        cellEvent.east = maze.isBlocked(position, domain::Direction::East);
        cellEvent.south = maze.isBlocked(position, domain::Direction::South);
        cellEvent.west = maze.isBlocked(position, domain::Direction::West);
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
    postEvent(endEvent);

    // TODO (Fase 4): retorno ao início + corrida rápida (FastRun).
    while (true) {
        vTaskDelay(pdMS_TO_TICKS(200));
    }
}

// ===================== Tarefa de telemetria (baixa prioridade) ===============
void telemetryTask(void*) {
    gBle.begin("RatoBorrachudo");

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
                    message = emitter.encodeRunResult(event.time,
                                                      event.success ? protocol::RunResult::Success
                                                                    : protocol::RunResult::Failure);
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

    xTaskCreatePinnedToCore(navigationTask, "nav", 8192, nullptr, configMAX_PRIORITIES - 1, nullptr,
                            1);
    xTaskCreatePinnedToCore(telemetryTask, "telemetry", 6144, nullptr, 1, nullptr, 0);
}
