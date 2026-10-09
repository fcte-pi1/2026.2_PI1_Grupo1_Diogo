#include "controller/MotionController.hpp"

namespace micromouse::controller {

MotionController::MotionController(const domain::PidGains& gains, double baseSpeed, double maxSpeed)
    : pid_(gains),            //
      baseSpeed_(baseSpeed),  //
      maxSpeed_(maxSpeed) {}  //

WheelSpeeds MotionController::correct(double error, double deltaTimeSeconds) {
    const double steeringCorrection = pid_.update(error, deltaTimeSeconds);
    return {baseSpeed_ - steeringCorrection, baseSpeed_ + steeringCorrection};
}

}  // namespace micromouse::controller
