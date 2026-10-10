#include "controller/MotionController.hpp"

#include <algorithm>

namespace micromouse::controller {

MotionController::MotionController(const domain::PidGains& gains, double baseSpeed, double maxSpeed)
    : pid_(gains),            //
      baseSpeed_(baseSpeed),  //
      maxSpeed_(maxSpeed) {}  //

WheelSpeeds MotionController::correct(double error, double deltaTimeSeconds) {
    const double steeringCorrection = pid_.update(error, deltaTimeSeconds);
    const double leftSpeed = std::clamp(baseSpeed_ - steeringCorrection, 0.0, maxSpeed_);
    const double rightSpeed = std::clamp(baseSpeed_ + steeringCorrection, 0.0, maxSpeed_);
    return {leftSpeed, rightSpeed};
}

void MotionController::reset() noexcept { pid_.reset(); }

}  // namespace micromouse::controller
