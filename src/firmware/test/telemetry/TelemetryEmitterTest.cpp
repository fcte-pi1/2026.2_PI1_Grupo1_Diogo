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

TEST(TelemetryEmitter, _) {
    TelemetryEmitter emitter = makeEmitter();
    EXPECT_EQ(
        emitter.encodeHello(),
        R"({"tipo":"hello","v":1,"dispositivo":"rato-01","token":"<token>","boot":"9f3a1c"})");
}

}  // namespace

}  // namespace micromouse::telemetry
