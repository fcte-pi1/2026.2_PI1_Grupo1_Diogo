#include <gtest/gtest.h>

#include "domain/DipDecoder.hpp"
#include "domain/Maze.hpp"
#include "protocol/ProtocolV1.hpp"
#include "use_cases/SessionManager.hpp"

namespace micromouse::protocol {

namespace {

using domain::Direction;
using domain::MazeType;
using use_cases::SessionPhase;

Encoder makeEncoder() { return Encoder("rato-01", "<token>", "9f3a1c"); }

TEST(ProtocolV1, HelloBateComOExemplo) {
    Encoder encoder = makeEncoder();
    EXPECT_EQ(
        encoder.encodeHello(),
        R"({"tipo":"hello","v":1,"dispositivo":"rato-01","token":"<token>","boot":"9f3a1c"})");
}

}  // namespace

}  // namespace micromouse::protocol
