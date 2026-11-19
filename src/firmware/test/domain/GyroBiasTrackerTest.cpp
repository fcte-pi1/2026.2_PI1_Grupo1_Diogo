#include <gtest/gtest.h>

#include "domain/GyroBiasTracker.hpp"

namespace micromouse::domain {
namespace {

GyroBiasWindow steady(double value, int samples) {
    GyroBiasWindow window;
    for (int i = 0; i < samples; ++i) {
        window.add(value + ((i % 2) ? 0.2 : -0.2));  // ruído de 0,4 graus/s de variação
    }
    return window;
}

// O desvio do giroscópio muda com a temperatura e com o tempo; parado, o robô pode medi-lo de novo e
// mover o valor em uso por uma fração do que mediu (sem pular).
TEST(GyroBiasTracker, AStillWindowMovesTheBiasPartOfTheWay) {
    const GyroBiasUpdate update = updateGyroBias(0.0, steady(1.0, 20));
    ASSERT_TRUE(update.accepted);
    EXPECT_NEAR(update.biasDps, kGyroBiasBlend * 1.0, 1e-9);
}

TEST(GyroBiasTracker, RepeatedStopsConvergeToTheTrueBias) {
    double bias = 0.0;
    for (int stop = 0; stop < 30; ++stop) {
        const GyroBiasUpdate update = updateGyroBias(bias, steady(1.5, 20));
        ASSERT_TRUE(update.accepted);
        bias = update.biasDps;
    }
    EXPECT_NEAR(bias, 1.5, 0.01);
}

TEST(GyroBiasTracker, TooFewSamplesAreRejected) {
    EXPECT_FALSE(updateGyroBias(0.0, steady(1.0, kGyroBiasMinSamples - 1)).accepted);
    EXPECT_TRUE(updateGyroBias(0.0, steady(1.0, kGyroBiasMinSamples)).accepted);
}

// O robô ainda balançando depois do freio (ou mexido à mão): a variação passa do limite e a janela é descartada.
TEST(GyroBiasTracker, ARockingRobotIsRejected) {
    GyroBiasWindow window;
    for (int i = 0; i < 20; ++i) {
        window.add((i % 2) ? 6.0 : -6.0);
    }
    EXPECT_GT(window.spreadDps(), kGyroBiasMaxSpreadDps);
    EXPECT_FALSE(updateGyroBias(0.0, window).accepted);
}

// Um valor muito longe do desvio em uso é movimento, não desvio: rejeitado.
TEST(GyroBiasTracker, AValueFarFromTheCurrentBiasIsRejected) {
    EXPECT_FALSE(updateGyroBias(0.0, steady(kGyroBiasMaxJumpDps + 2.0, 20)).accepted);
}

TEST(GyroBiasTracker, WindowKeepsCountMeanAndSpread) {
    GyroBiasWindow window;
    window.add(1.0);
    window.add(3.0);
    window.add(2.0);
    EXPECT_EQ(window.count(), 3);
    EXPECT_NEAR(window.meanDps(), 2.0, 1e-9);
    EXPECT_NEAR(window.spreadDps(), 2.0, 1e-9);
    window.reset();
    EXPECT_EQ(window.count(), 0);
}

}  // namespace
}  // namespace micromouse::domain
