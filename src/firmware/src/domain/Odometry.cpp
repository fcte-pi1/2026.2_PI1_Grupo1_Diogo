#include "domain/Odometry.hpp"

namespace micromouse::domain {
Odometry::Odometry(const WheelConfig& wheelConfig) : wheelConfig_(wheelConfig) {}

long Odometry::pulses() const noexcept { return pulses_; }

double Odometry::distanceMm() const { return 0.0; }

}  // namespace micromouse::domain
