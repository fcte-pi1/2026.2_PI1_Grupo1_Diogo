#include "domain/Pid.hpp"

namespace micromouse::domain {

Pid::Pid(const PidGains& gains) : gains_(gains) {}

double Pid::update(double error, double deltaTimeSeconds) {
    if (deltaTimeSeconds <= 0.0) {
        return 0.0;
    }

    accumulatedError_ += error * deltaTimeSeconds;
    const double derivative = hasPreviousError_ ? (error - previousError_) / deltaTimeSeconds : 0.0;
    previousError_ = error;
    hasPreviousError_ = true;

    return gains_.proportionalGain * error + gains_.integralGain * accumulatedError_ +
           gains_.derivativeGain * derivative;
}

void Pid::reset() noexcept {
    accumulatedError_ = 0.0;
    previousError_ = 0.0;
    hasPreviousError_ = false;
}

}  // namespace micromouse::domain
