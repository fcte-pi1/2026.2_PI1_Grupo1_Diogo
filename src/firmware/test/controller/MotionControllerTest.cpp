#include <gtest/gtest.h>

#include "controller/MotionController.hpp"
#include "domain/RobotParameters.hpp"

namespace micromouse::controller {

namespace {

TEST(MotionController, ZeroErrorKeepsBaseSpeed) {
    MotionController controller({1.0, 0.0, 0.0}, 100.0, 200.0);
    const WheelSpeeds speed = controller.correct(0.0, 0.1);
    EXPECT_DOUBLE_EQ(speed.left, 100.0);
    EXPECT_DOUBLE_EQ(speed.right, 100.0);
}

TEST(MotionController, ErrorProducesSymmetricDifferential) {
    MotionController controller({1.0, 0.0, 0.0}, 100.0, 200.0);
    const WheelSpeeds speed = controller.correct(10.0, 0.1);
    EXPECT_DOUBLE_EQ(speed.left, 90.0);
    EXPECT_DOUBLE_EQ(speed.right, 110.0);
}

TEST(MotionController, SaturatesAtMotorLimit) {
    MotionController controller({50.0, 0.0, 0.0}, 100.0, 120.0);
    const WheelSpeeds speed = controller.correct(10.0, 0.1);
    EXPECT_DOUBLE_EQ(speed.left, 0.0);
    EXPECT_DOUBLE_EQ(speed.right, 120.0);
}

// Os ganhos do robô (RobotParameters): 1 pulso de diferença mexe pouco na potência (em 04/11, o
// derivativo antigo dava correção 2,0 e uma roda ia a 0) e nenhum erro deixa uma roda abaixo de 0,50.
TEST(MotionController, RobotStraightGainsAreGentle) {
    MotionController controller(domain::robot::kStraightGains, 0.70, 0.85,
                                domain::robot::kStraightMaxCorrection);
    const WheelSpeeds first = controller.correct(0.0, 0.001);
    const WheelSpeeds onePulse = controller.correct(1.0, 0.001);
    EXPECT_DOUBLE_EQ(first.left, 0.70);
    EXPECT_NEAR(onePulse.left, 0.70, 0.01);
    EXPECT_NEAR(onePulse.right, 0.70, 0.01);
    for (const double error : {-500.0, -50.0, 50.0, 500.0}) {
        const WheelSpeeds speed = controller.correct(error, 0.001);
        EXPECT_GE(speed.left, 0.50 - 1e-9) << error;
        EXPECT_GE(speed.right, 0.50 - 1e-9) << error;
    }
}

// Com limite de correção, um erro enorme não zera uma roda (o robô não gira sobre a outra).
TEST(MotionController, LimitsCorrectionSoNoWheelStops) {
    MotionController controller({50.0, 0.0, 0.0}, 0.70, 0.85, 0.20);
    const WheelSpeeds behind = controller.correct(1000.0, 0.001);
    EXPECT_DOUBLE_EQ(behind.left, 0.50);
    EXPECT_DOUBLE_EQ(behind.right, 0.85);  // 0,90 limitado ao teto do motor
    const WheelSpeeds ahead = controller.correct(-1000.0, 0.001);
    EXPECT_DOUBLE_EQ(ahead.left, 0.85);
    EXPECT_DOUBLE_EQ(ahead.right, 0.50);
}

}  // namespace

}  // namespace micromouse::controller
