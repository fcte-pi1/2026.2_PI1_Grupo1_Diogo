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

TEST(Odometry, ComecaZerado) {
    Odometry odometry(makeConfig());
    EXPECT_EQ(odometry.pulses(), 0);
    EXPECT_DOUBLE_EQ(odometry.distanceMm(), 0.0);
}

TEST(Odometry, _) {}

}  // namespace

}  // namespace micromouse::domain
