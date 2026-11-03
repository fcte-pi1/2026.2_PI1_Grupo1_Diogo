#include <gtest/gtest.h>

#include "domain/SoftStart.hpp"

namespace micromouse::domain {

namespace {

TEST(SoftStart, StartsAtZero) { EXPECT_DOUBLE_EQ(softStartFactor(0), 0.0); }

TEST(SoftStart, RisesLinearlyDuringTheRamp) {
    EXPECT_DOUBLE_EQ(softStartFactor(20, 80), 0.25);
    EXPECT_DOUBLE_EQ(softStartFactor(40, 80), 0.5);
    EXPECT_DOUBLE_EQ(softStartFactor(60, 80), 0.75);
}

TEST(SoftStart, ReachesFullPowerAtTheEndAndStays) {
    EXPECT_DOUBLE_EQ(softStartFactor(kSoftStartMs), 1.0);
    EXPECT_DOUBLE_EQ(softStartFactor(5000), 1.0);
}

TEST(SoftStart, NeverDecreasesNorExceedsOne) {
    double previous = 0.0;
    for (uint32_t ms = 0; ms <= 200; ++ms) {
        const double factor = softStartFactor(ms);
        EXPECT_GE(factor, previous);
        EXPECT_LE(factor, 1.0);
        previous = factor;
    }
}

TEST(SoftStart, ZeroRampMeansNoRamp) { EXPECT_DOUBLE_EQ(softStartFactor(0, 0), 1.0); }

}  // namespace

}  // namespace micromouse::domain
