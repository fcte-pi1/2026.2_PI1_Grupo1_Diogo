#include <gtest/gtest.h>

#include "domain/Maneuver.hpp"
#include "domain/Odometry.hpp"
#include "domain/RobotParameters.hpp"

namespace micromouse::domain {

namespace {

// 285 pulsos por volta (medidos em 04/11) e roda de 32 mm (medida em 11/11): 32π / 285 = 0,3527 mm
// por pulso.
TEST(RobotParameters, MillimetersPerPulseMatchesMeasuredCounts) {
    Odometry odometry(robot::kWheels);
    odometry.onEncoderPulses(1);
    EXPECT_NEAR(odometry.distanceMm(), 0.3527, 1e-4);
}

TEST(RobotParameters, OneCellTakesAbout511Pulses) {
    Odometry belowCell(robot::kWheels);
    belowCell.onEncoderPulses(510);
    EXPECT_EQ(belowCell.cellsTraveled(), 0);

    Odometry atCell(robot::kWheels);
    atCell.onEncoderPulses(511);
    EXPECT_EQ(atCell.cellsTraveled(), 1);
}

TEST(RobotParameters, QuarterTurnUsesWheelTrackAndCounts) {
    EXPECT_NEAR(pulsesForTurn(robot::kTurn, 90.0), 195.94, 0.01);
}

}  // namespace

}  // namespace micromouse::domain
