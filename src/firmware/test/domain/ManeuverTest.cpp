#include <gtest/gtest.h>

#include "domain/Maneuver.hpp"

namespace micromouse::domain {

namespace {

TurnConfig makeConfig() {
    return {
        32.0,  //
        360,   //
        90.0   //
    };
}

TEST(Maneuver, PulsosPara90Graus) { EXPECT_DOUBLE_EQ(pulsesForTurn(makeConfig(), 90.0), 253.125); }

}  // namespace

}  // namespace micromouse::domain
