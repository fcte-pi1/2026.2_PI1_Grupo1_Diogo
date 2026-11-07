#include "controller/MotionController.hpp"

#include <algorithm>
#include <cmath>

namespace micromouse::controller {

MotionController::MotionController(const domain::PidGains& gains, double baseSpeed, double maxSpeed,
                                   double maxCorrection)
    : pid_(gains),            //
      baseSpeed_(baseSpeed),  //
      maxSpeed_(maxSpeed),    //
      maxCorrection_(maxCorrection) {}

WheelSpeeds MotionController::correct(double error, double deltaTimeSeconds) {
    const double requested = pid_.update(error, deltaTimeSeconds);
    const double steeringCorrection = std::clamp(requested, -maxCorrection_, maxCorrection_);
    const double leftSpeed = std::clamp(baseSpeed_ - steeringCorrection, 0.0, maxSpeed_);
    const double rightSpeed = std::clamp(baseSpeed_ + steeringCorrection, 0.0, maxSpeed_);

    ++stats_.steps;
    stats_.lastError = error;
    stats_.maxAbsError = std::max(stats_.maxAbsError, std::fabs(error));
    stats_.maxAbsCorrection = std::max(
        stats_.maxAbsCorrection,
        std::max(std::fabs(leftSpeed - baseSpeed_), std::fabs(rightSpeed - baseSpeed_)));
    const bool limited = std::fabs(requested) >= maxCorrection_ ||
                         leftSpeed != baseSpeed_ - steeringCorrection ||
                         rightSpeed != baseSpeed_ + steeringCorrection;
    if (limited) {
        ++stats_.saturatedSteps;
    }
    return {leftSpeed, rightSpeed};
}

void MotionController::reset() noexcept {
    pid_.reset();
    stats_ = {};
}

}  // namespace micromouse::controller
