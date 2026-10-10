#include <gtest/gtest.h>

#include "domain/DipDecoder.hpp"
#include "domain/Maze.hpp"
#include "protocol/ProtocolV1.hpp"
#include "telemetry/TelemetryEmitter.hpp"
#include "use_cases/SessionManager.hpp"

namespace micromouse::telemetry {

namespace {

using domain::Direction;
using domain::MazeType;
using domain::Position;
using use_cases::SessionPhase;

TelemetryEmitter makeEmitter() {
    return TelemetryEmitter(protocol::Encoder("rato-01", "<token>", "9f3a1c"));
}

Snapshot makeSnap(SessionPhase phase) {
    Snapshot snap;
    snap.phase = phase;
    snap.position = {3, 0};
    snap.heading = Direction::North;
    snap.cells = 0;
    snap.speed = 0.0;
    snap.voltage = 8.12;
    snap.amperage = 0.41;
    snap.watts = 3.33;
    return snap;
}

TEST(TelemetryEmitter, HelloDelegaAoEncoder) {
    TelemetryEmitter emitter = makeEmitter();
    EXPECT_EQ(
        emitter.encodeHello(),
        R"({"tipo":"hello","v":1,"dispositivo":"rato-01","token":"<token>","boot":"9f3a1c"})");
}

TEST(TelemetryEmitter, StartRunEmiteInicioCorrida) {
    TelemetryEmitter emitter = makeEmitter();
    EXPECT_EQ(
        emitter.encodeStartRun(1, 12000, MazeType::Small4x4),
        R"({"v":1,"tipo":"inicio_corrida","corrida":"r9f3a1c-1","seq":1,"t":12000,"labirinto":"4x4"})");
}

TEST(TelemetryEmitter, PrimeiroCicloEmiteEstadoPosicaoEnergia) {
    TelemetryEmitter emitter = makeEmitter();
    emitter.encodeStartRun(1, 12000, MazeType::Small4x4);
    const std::vector<std::string> messages =
        emitter.encodeCycle(12001, makeSnap(SessionPhase::Exploring));
    ASSERT_EQ(messages.size(), 3u);
    EXPECT_EQ(
        messages[0],
        R"({"v":1,"tipo":"estado","corrida":"r9f3a1c-1","seq":2,"t":12001,"estado":"MAPEANDO"})");
    EXPECT_EQ(
        messages[1],
        R"({"v":1,"tipo":"posicao","corrida":"r9f3a1c-1","seq":3,"t":12001,"x":0,"y":3,"orientacao":"N","celulas":0,"velocidade_media_mps":0})");
    EXPECT_EQ(
        messages[2],
        R"({"v":1,"tipo":"energia","corrida":"r9f3a1c-1","seq":4,"t":12001,"tensao_v":8.12,"corrente_a":0.41,"potencia_w":3.33})");
}

TEST(TelemetryEmitter, _) {}

}  // namespace

}  // namespace micromouse::telemetry
