#include <gtest/gtest.h>

#include "controller/MotionController.hpp"

namespace micromouse::controller {

namespace {

TEST(MotionController, ErroZeroMantemVelocidadeBase) {
    MotionController controller({1.0, 0.0, 0.0}, 100.0, 200.0);
    const WheelSpeeds speed = controller.correct(0.0, 0.1);
    EXPECT_DOUBLE_EQ(speed.left, 100.0);
    EXPECT_DOUBLE_EQ(speed.right, 100.0);
}

TEST(MotionController, _) {}

}  // namespace

}  // namespace micromouse::controller
