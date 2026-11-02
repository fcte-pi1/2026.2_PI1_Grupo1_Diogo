#include <gtest/gtest.h>

#include "domain/Maneuver.hpp"
#include "domain/Odometry.hpp"
#include "domain/RobotParameters.hpp"

namespace micromouse::domain {

namespace {

TEST(RobotParameters, MillimetersPerPulseMatchesHardwareReport) {
    Odometry odometry(robot::kWheels);
    odometry.onEncoderPulses(1);
    EXPECT_NEAR(odometry.distanceMm(), 0.2967, 1e-4);
}

TEST(RobotParameters, OneCellTakesAbout607Pulses) {
    Odometry belowCell(robot::kWheels);
    belowCell.onEncoderPulses(606);
    EXPECT_EQ(belowCell.cellsTraveled(), 0);

    Odometry atCell(robot::kWheels);
    atCell.onEncoderPulses(607);
    EXPECT_EQ(atCell.cellsTraveled(), 1);
}

TEST(RobotParameters, QuarterTurnUsesWheelTrackAndCounts) {
    EXPECT_NEAR(pulsesForTurn(robot::kTurn, 90.0), 232.94, 0.01);
}

}  // namespace

}  // namespace micromouse::domain
