#include <gtest/gtest.h>

#include "controller/VoltageSlew.hpp"

namespace micromouse::controller {
namespace {

// A tensão no motor sobe no máximo `rampa` V/s: o degrau do atrito estático (2,5 V de uma vez) é o que
// derrubava a alimentação na partida (BROWNOUT). Descer não é limitado: o freio não pode atrasar.
TEST(VoltageSlew, ASteppedStartRisesAtTheConfiguredRate) {
    VoltageSlew slew(50.0);  // 50 V/s: 0,5 V a cada 10 ms
    double volts = 0.0;
    for (int i = 1; i <= 5; ++i) {
        volts = slew.step(2.5, 0.01);
        EXPECT_NEAR(volts, 0.5 * i, 1e-9);
    }
    EXPECT_NEAR(slew.step(2.5, 0.01), 2.5, 1e-9);  // chegou e fica
}

TEST(VoltageSlew, FallingIsNotLimited) {
    VoltageSlew slew(50.0);
    slew.reset(6.0);
    EXPECT_DOUBLE_EQ(slew.step(1.0, 0.01), 1.0);
    EXPECT_DOUBLE_EQ(slew.step(0.0, 0.01), 0.0);
}

TEST(VoltageSlew, ReversalPassesThroughZeroAndThenRisesInTheNewDirection) {
    VoltageSlew slew(50.0);
    slew.reset(4.0);
    EXPECT_NEAR(slew.step(-4.0, 0.01), -0.5, 1e-9);  // não inverte de +4 para -4 de uma vez
    EXPECT_NEAR(slew.step(-4.0, 0.01), -1.0, 1e-9);
}

TEST(VoltageSlew, ZeroRampIsAPassThrough) {
    VoltageSlew slew(0.0);
    EXPECT_DOUBLE_EQ(slew.step(7.5, 0.01), 7.5);
    EXPECT_DOUBLE_EQ(slew.step(-7.5, 0.01), -7.5);
}

TEST(VoltageSlew, BackwardMovesAreLimitedTheSameWay) {
    VoltageSlew slew(100.0);
    EXPECT_NEAR(slew.step(-3.0, 0.01), -1.0, 1e-9);
    EXPECT_NEAR(slew.step(-3.0, 0.01), -2.0, 1e-9);
    EXPECT_NEAR(slew.step(-3.0, 0.01), -3.0, 1e-9);
}

// A rampa pode ser trocada em andamento (`calib rampa_tensao`).
TEST(VoltageSlew, RampCanChangeWhileRunning) {
    VoltageSlew slew(50.0);
    slew.setRamp(10.0);  // 10 V/s: 0,1 V a cada 10 ms
    EXPECT_NEAR(slew.step(5.0, 0.01), 0.1, 1e-9);
    slew.setRamp(0.0);
    EXPECT_DOUBLE_EQ(slew.step(5.0, 0.01), 5.0);
}

}  // namespace
}  // namespace micromouse::controller
