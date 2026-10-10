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

TEST(Maneuver, PulsosEscalamComOAngulo) {
    const TurnConfig config = makeConfig();
    EXPECT_DOUBLE_EQ(pulsesForTurn(config, 180.0), 2.0 * pulsesForTurn(config, 90.0));
}

TEST(Maneuver, SinalNaoAlteraMagnitude) {
    const TurnConfig config = makeConfig();
    EXPECT_DOUBLE_EQ(pulsesForTurn(config, -90.0), pulsesForTurn(config, 90.0));
}

TEST(Maneuver, RejeitaConfiguracaoInvalida) {
    EXPECT_THROW((void)pulsesForTurn({0.0, 360, 90.0}, 90.0), std::invalid_argument);
    EXPECT_THROW((void)pulsesForTurn({32.0, 0, 90.0}, 90.0), std::invalid_argument);
    EXPECT_THROW((void)pulsesForTurn({32.0, 360, -1.0}, 90.0), std::invalid_argument);
}

TEST(Maneuver, GyroComecaZeradoENaoAlcancado) {
    GyroTurnController gyro(90.0, 2.0);
    EXPECT_DOUBLE_EQ(gyro.angle(), 0.0);
    EXPECT_FALSE(gyro.reached());
}

TEST(Maneuver, GyroIntegraAngulo) {
    GyroTurnController gyro(90.0, 2.0);
    gyro.integrate(45.0, 0.1);  // +4.5
    gyro.integrate(45.0, 0.1);  // +4.5 -> 9.0
    EXPECT_DOUBLE_EQ(gyro.angle(), 9.0);
    EXPECT_FALSE(gyro.reached());
}

}  // namespace

}  // namespace micromouse::domain
