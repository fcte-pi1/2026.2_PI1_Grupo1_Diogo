#include <gtest/gtest.h>

#include "domain/DynamicFrontStop.hpp"

namespace micromouse::domain {
namespace {

// A parada pela frente dispara a 35 mm, mas o robô ainda anda `v^2 / (2 a)` até parar: a velocidade de cada
// corrida decidia onde ele ficava. A parada dinâmica soma essa distância ao limiar.
TEST(DynamicFrontStop, StandingStillKeepsTheConfiguredThreshold) {
    EXPECT_DOUBLE_EQ(dynamicFrontStopMm(35.0, 0.0), 35.0);
}

TEST(DynamicFrontStop, FasterMeansEarlier) {
    const double slow = dynamicFrontStopMm(35.0, 60.0);
    const double cruise = dynamicFrontStopMm(35.0, 120.0);
    EXPECT_GT(slow, 35.0);
    EXPECT_GT(cruise, slow);
    // 120 mm/s com 1600 mm/s2: 4,5 mm a mais.
    EXPECT_NEAR(cruise, 35.0 + 120.0 * 120.0 / (2.0 * kFrontBrakeDecelMmPerS2), 1e-9);
}

TEST(DynamicFrontStop, ReverseSpeedCountsAsItsMagnitude) {
    EXPECT_DOUBLE_EQ(dynamicFrontStopMm(35.0, -120.0), dynamicFrontStopMm(35.0, 120.0));
}

// Uma velocidade absurda (leitura ruim do encoder) não pode empurrar o limiar para longe.
TEST(DynamicFrontStop, TheExtraDistanceIsCapped) {
    EXPECT_DOUBLE_EQ(dynamicFrontStopMm(35.0, 5000.0), 35.0 + kDynamicFrontStopMaxExtraMm);
}

// O limiar que o robô realmente usa a 150 mm/s (velocidade de hoje cedo) e a 120 (a nova).
TEST(DynamicFrontStop, ExtraDistanceAtTheRaceSpeeds) {
    EXPECT_NEAR(dynamicFrontStopMm(35.0, 150.0) - 35.0, 7.03, 0.05);
    EXPECT_NEAR(dynamicFrontStopMm(35.0, 120.0) - 35.0, 4.5, 0.05);
}

}  // namespace
}  // namespace micromouse::domain
