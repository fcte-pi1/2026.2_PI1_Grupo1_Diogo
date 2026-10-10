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

TEST(TelemetryEmitter, _) {}

}  // namespace

}  // namespace micromouse::telemetry
