#include <gtest/gtest.h>

#include <cmath>

#include "domain/Odometry.hpp"

namespace micromouse::domain {

namespace {

WheelConfig makeConfig() {
    return {
        32.0,  //
        360,   //
        180.0  //
    };
}

TEST(Odometry, StartsAtZero) {
    Odometry odometry(makeConfig());
    EXPECT_EQ(odometry.pulses(), 0);
    EXPECT_DOUBLE_EQ(odometry.distanceMm(), 0.0);
}

TEST(Odometry, OneTurnTravelsOneCircumference) {
    Odometry odometry(makeConfig());
    odometry.onEncoderPulses(360);
    EXPECT_NEAR(odometry.distanceMm(), M_PI * 32.0, 1e-9);
    EXPECT_EQ(odometry.pulses(), 360);
}

TEST(Odometry, PulsesAccumulateAndScale) {
    Odometry odometry(makeConfig());
    odometry.onEncoderPulses(90);
    odometry.onEncoderPulses(90);
    EXPECT_NEAR(odometry.distanceMm(), (M_PI * 32.0) / 2.0, 1e-9);
}

TEST(Odometry, CountsCellsWithFloorDivision) {
    Odometry odometry(makeConfig());
    odometry.onEncoderPulses(4 * 360);
    EXPECT_EQ(odometry.cellsTraveled(), 2);
}

TEST(Odometry, AverageSpeedGuardsAgainstDivisionByZero) {
    Odometry odometry(makeConfig());
    odometry.onEncoderPulses(360);
    EXPECT_NEAR(odometry.averageSpeedMmPerS(0.5), (M_PI * 32.0) / 0.5, 1e-9);
    EXPECT_DOUBLE_EQ(odometry.averageSpeedMmPerS(0.0), 0.0);
}

TEST(Odometry, ReversesWithNegativePulses) {
    Odometry odometry(makeConfig());
    odometry.onEncoderPulses(360);
    odometry.onEncoderPulses(-180);
    EXPECT_NEAR(odometry.distanceMm(), (M_PI * 32.0) / 2.0, 1e-9);
    EXPECT_EQ(odometry.pulses(), 180);
}

TEST(Odometry, ResetZeroesState) {
    Odometry odometry(makeConfig());
    odometry.onEncoderPulses(1000);
    odometry.reset();
    EXPECT_EQ(odometry.pulses(), 0);
    EXPECT_DOUBLE_EQ(odometry.distanceMm(), 0.0);
}

TEST(Odometry, RejectsInvalidConfiguration) {
    EXPECT_THROW(Odometry({0.0, 360, 180.0}), std::invalid_argument);
    EXPECT_THROW(Odometry({32.0, 0, 180.0}), std::invalid_argument);
    EXPECT_THROW(Odometry({32.0, 360, -1.0}), std::invalid_argument);
}

}  // namespace

}  // namespace micromouse::domain
