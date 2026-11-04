#include <gtest/gtest.h>

#include "domain/Maneuver.hpp"
#include "domain/Odometry.hpp"
#include "domain/RobotParameters.hpp"

namespace micromouse::domain {

namespace {

// 285 pulsos por volta (medidos em 04/11) e roda de 34 mm: 34π / 285 = 0,3748 mm por pulso.
TEST(RobotParameters, MillimetersPerPulseMatchesMeasuredCounts) {
    Odometry odometry(robot::kWheels);
    odometry.onEncoderPulses(1);
    EXPECT_NEAR(odometry.distanceMm(), 0.3748, 1e-4);
}

TEST(RobotParameters, OneCellTakesAbout481Pulses) {
    Odometry belowCell(robot::kWheels);
    belowCell.onEncoderPulses(480);
    EXPECT_EQ(belowCell.cellsTraveled(), 0);

    Odometry atCell(robot::kWheels);
    atCell.onEncoderPulses(481);
    EXPECT_EQ(atCell.cellsTraveled(), 1);
}

TEST(RobotParameters, QuarterTurnUsesWheelTrackAndCounts) {
    EXPECT_NEAR(pulsesForTurn(robot::kTurn, 90.0), 184.41, 0.01);
}

}  // namespace

}  // namespace micromouse::domain
