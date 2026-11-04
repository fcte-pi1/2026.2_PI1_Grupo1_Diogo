#include "controller/MotionController.hpp"

#include <algorithm>

namespace micromouse::controller {

MotionController::MotionController(const domain::PidGains& gains, double baseSpeed, double maxSpeed,
                                   double maxCorrection)
    : pid_(gains),            //
      baseSpeed_(baseSpeed),  //
      maxSpeed_(maxSpeed),    //
      maxCorrection_(maxCorrection) {}

WheelSpeeds MotionController::correct(double error, double deltaTimeSeconds) {
    const double steeringCorrection =
        std::clamp(pid_.update(error, deltaTimeSeconds), -maxCorrection_, maxCorrection_);
    const double leftSpeed = std::clamp(baseSpeed_ - steeringCorrection, 0.0, maxSpeed_);
    const double rightSpeed = std::clamp(baseSpeed_ + steeringCorrection, 0.0, maxSpeed_);
    return {leftSpeed, rightSpeed};
}

void MotionController::reset() noexcept { pid_.reset(); }

}  // namespace micromouse::controller
