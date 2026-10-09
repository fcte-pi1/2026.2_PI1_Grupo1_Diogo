#include "domain/Pid.hpp"

namespace micromouse::domain {

Pid::Pid(const PidGains& gains) : gains_(gains) {}

double Pid::update(double error, double deltaTimeSeconds) {
    accumulatedError_ += error * deltaTimeSeconds;
    const double derivative = hasPreviousError_ ? (error - previousError_) / deltaTimeSeconds : 0.0;
    previousError_ = error;
    hasPreviousError_ = true;

    return gains_.proportionalGain * error + gains_.integralGain * accumulatedError_ +
           gains_.derivativeGain * derivative;
}

}  // namespace micromouse::domain
