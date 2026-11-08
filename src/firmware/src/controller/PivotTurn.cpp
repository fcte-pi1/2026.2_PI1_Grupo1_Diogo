#include "controller/PivotTurn.hpp"

#include <algorithm>
#include <cmath>

namespace micromouse::controller {

PivotTurn::PivotTurn(double targetDeg, Direction direction, const PivotProfile& profile)
    : gyro_(targetDeg, profile.toleranceDeg),
      targetDeg_(targetDeg),
      direction_(direction),
      profile_(profile) {}

WheelSpeeds PivotTurn::step(double gyroDegPerSec, double dtSeconds) {
    if (done_) {
        return {0.0, 0.0};
    }
    gyro_.integrate(gyroDegPerSec, dtSeconds);
    if (gyro_.reached()) {
        done_ = true;
        return {0.0, 0.0};
    }
    const double remaining = targetDeg_ - std::fabs(gyro_.angle());
    const double fraction =
        profile_.slowdownDeg > 0.0 ? std::clamp(remaining / profile_.slowdownDeg, 0.0, 1.0) : 1.0;
    const double speed =
        profile_.finalSpeed + (profile_.cruiseSpeed - profile_.finalSpeed) * fraction;
    if (direction_ == Direction::Left) {
        return {-speed, speed};
    }
    return {speed, -speed};
}

void PivotTurn::settle(double gyroDegPerSec, double dtSeconds) {
    gyro_.integrate(gyroDegPerSec, dtSeconds);
}

}  // namespace micromouse::controller
