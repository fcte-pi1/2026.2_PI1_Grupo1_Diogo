#include <gtest/gtest.h>

#include <cmath>

#include "controller/RobotMotion.hpp"
#include "controller/TrapezoidProfile.hpp"
#include "controller/WheelLoop.hpp"
#include "domain/MotorVoltage.hpp"

namespace micromouse::controller {
namespace {

TEST(TrapezoidProfile, CruisesAndStopsExactlyAtTheEnd) {
    const TrapezoidProfile profile(180.0, {250.0, 1200.0});
    EXPECT_DOUBLE_EQ(profile.peakSpeed(), 250.0);
    // 2 rampas de 0,208 s (26 mm cada) e 128 mm de cruzeiro a 250 mm/s.
    EXPECT_NEAR(profile.duration(), 2.0 * 250.0 / 1200.0 + (180.0 - 250.0 * 250.0 / 1200.0) / 250.0,
                1e-12);
    EXPECT_NEAR(profile.at(0.1).speed, 120.0, 1e-9);
    EXPECT_NEAR(profile.at(0.4).speed, 250.0, 1e-9);
    const TrapezoidProfile::Sample end = profile.at(profile.duration());
    EXPECT_TRUE(end.finished);
    EXPECT_DOUBLE_EQ(end.position, 180.0);
    EXPECT_DOUBLE_EQ(end.speed, 0.0);
}

TEST(TrapezoidProfile, ShortMoveBecomesATriangle) {
    const TrapezoidProfile profile(20.0, {250.0, 1200.0});
    EXPECT_LT(profile.peakSpeed(), 250.0);
    EXPECT_NEAR(profile.at(profile.duration() / 2.0).position, 10.0, 1e-9);
}

TEST(TrapezoidProfile, PositionIsContinuousAndNeverGoesBack) {
    const TrapezoidProfile profile(180.0, {250.0, 1200.0});
    double previous = 0.0;
    for (double t = 0.0; t <= profile.duration() + 0.01; t += 0.001) {
        const double position = profile.at(t).position;
        EXPECT_GE(position, previous - 1e-9);
        EXPECT_LE(position - previous, 250.0 * 0.001 + 1e-9);
        previous = position;
    }
}

TEST(TrapezoidProfile, InvalidInputIsAnEmptyFinishedProfile) {
    EXPECT_TRUE(TrapezoidProfile(-5.0, {250.0, 1200.0}).at(0.0).finished);
    EXPECT_TRUE(TrapezoidProfile(100.0, {0.0, 1200.0}).at(0.0).finished);
}

// A roda parada recebe o empurrão do atrito estático assim que a referência começa a andar.
TEST(WheelLoop, KicksStaticFrictionWhenTheReferenceMoves) {
    WheelLoop loop(robot::kWheelLoop);
    const double volts = loop.update(0.0, 10.0, 0.0, 0.0, 0.002);
    EXPECT_GE(volts, robot::kWheelLoop.staticVolts);
}

TEST(WheelLoop, NeverExceedsTheMotorRating) {
    WheelLoop loop(robot::kWheelLoop);
    for (int i = 0; i < 1000; ++i) {
        const double volts = loop.update(500.0, 1000.0, 0.0, 0.0, 0.002);
        EXPECT_LE(std::fabs(volts), robot::kMotorMaxVolts + 1e-12);
    }
    EXPECT_TRUE(loop.saturated());
}

TEST(WheelLoop, HoldsStillWhenOnTarget) {
    WheelLoop loop(robot::kWheelLoop);
    EXPECT_DOUBLE_EQ(loop.update(50.0, 0.0, 50.0, 0.0, 0.002), 0.0);
}

TEST(SpeedEstimator, AveragesOverTheWindow) {
    SpeedEstimator speed;
    speed.reset(0.0, 0.0);
    double last = 0.0;
    for (int i = 1; i <= 20; ++i) {
        last = speed.update(0.5 * i, 0.002 * i);  // 250 mm/s
    }
    EXPECT_NEAR(last, 250.0, 1e-9);
}

}  // namespace
}  // namespace micromouse::controller

namespace micromouse::domain {
namespace {

TEST(MotorVoltage, SlowDecayIsProportional) {
    EXPECT_DOUBLE_EQ(commandForVolts(4.0, 8.0, DecayMode::Slow), 0.5);
    EXPECT_DOUBLE_EQ(commandForVolts(-6.0, 8.0, DecayMode::Slow), -0.75);
}

// Fast decay: tensão ~ (2 x comando - 1) x bateria. 6 V numa bateria de 8 V pede 0,875.
TEST(MotorVoltage, FastDecayCompensatesTheLostHalf) {
    EXPECT_DOUBLE_EQ(commandForVolts(6.0, 8.0, DecayMode::Fast), 0.875);
    EXPECT_DOUBLE_EQ(commandForVolts(-6.0, 8.0, DecayMode::Fast), -0.875);
    // A potência fixa antiga de 0,70 dava só ~3,2 V.
    EXPECT_NEAR(commandForVolts(3.2, 8.0, DecayMode::Fast), 0.70, 1e-12);
}

TEST(MotorVoltage, SaturatesAndStops) {
    EXPECT_DOUBLE_EQ(commandForVolts(12.0, 8.0, DecayMode::Slow), 1.0);
    EXPECT_DOUBLE_EQ(commandForVolts(0.0, 8.0, DecayMode::Fast), 0.0);
    EXPECT_DOUBLE_EQ(commandForVolts(3.0, 0.0, DecayMode::Slow), 0.0);
}

// A mesma tensão pede comando maior com a bateria mais fraca.
TEST(MotorVoltage, FollowsTheBattery) {
    EXPECT_GT(commandForVolts(5.0, 7.0, DecayMode::Slow), commandForVolts(5.0, 8.4, DecayMode::Slow));
}

TEST(MotorVoltage, IgnoresImplausibleBatteryReadings) {
    EXPECT_DOUBLE_EQ(usableBatteryVolts(7.9, 8.0), 7.9);
    EXPECT_DOUBLE_EQ(usableBatteryVolts(0.78, 8.0), 8.0);  // INA sem bateria (07/11)
    EXPECT_DOUBLE_EQ(usableBatteryVolts(NAN, 8.0), 8.0);
}

}  // namespace
}  // namespace micromouse::domain
