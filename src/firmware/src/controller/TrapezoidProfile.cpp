#include "controller/TrapezoidProfile.hpp"

#include <cmath>

namespace micromouse::controller {

TrapezoidProfile::TrapezoidProfile(double distance, const ProfileLimits& limits) noexcept {
    if (!(distance > 0.0) || !(limits.maxSpeed > 0.0) || !(limits.acceleration > 0.0)) {
        return;
    }
    distance_ = distance;
    acceleration_ = limits.acceleration;
    const double rampDistance = limits.maxSpeed * limits.maxSpeed / (2.0 * limits.acceleration);
    if (2.0 * rampDistance >= distance) {
        // Triângulo: não dá tempo de chegar ao cruzeiro.
        peak_ = std::sqrt(distance * limits.acceleration);
        rampTime_ = peak_ / limits.acceleration;
        cruiseTime_ = 0.0;
    } else {
        peak_ = limits.maxSpeed;
        rampTime_ = limits.maxSpeed / limits.acceleration;
        cruiseTime_ = (distance - 2.0 * rampDistance) / limits.maxSpeed;
    }
    total_ = 2.0 * rampTime_ + cruiseTime_;
}

TrapezoidProfile::Sample TrapezoidProfile::at(double timeSeconds) const noexcept {
    if (total_ <= 0.0 || timeSeconds >= total_) {
        return {distance_, 0.0, true};
    }
    if (timeSeconds <= 0.0) {
        return {0.0, 0.0, false};
    }
    if (timeSeconds < rampTime_) {
        return {0.5 * acceleration_ * timeSeconds * timeSeconds, acceleration_ * timeSeconds,
                false};
    }
    const double rampDistance = 0.5 * acceleration_ * rampTime_ * rampTime_;
    if (timeSeconds < rampTime_ + cruiseTime_) {
        return {rampDistance + peak_ * (timeSeconds - rampTime_), peak_, false};
    }
    const double remaining = total_ - timeSeconds;
    return {distance_ - 0.5 * acceleration_ * remaining * remaining, acceleration_ * remaining,
            false};
}

}  // namespace micromouse::controller
