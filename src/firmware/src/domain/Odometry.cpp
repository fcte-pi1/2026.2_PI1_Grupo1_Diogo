#include "domain/Odometry.hpp"

#include <cmath>

namespace micromouse::domain {

Odometry::Odometry(const WheelConfig& wheelConfig) : wheelConfig_(wheelConfig) {}

long Odometry::pulses() const noexcept { return pulses_; }

void Odometry::onEncoderPulses(long ticks) noexcept { pulses_ += ticks; }

double Odometry::distanceMm() const {
    const double circumference = M_PI * wheelConfig_.wheelDiameterMm;
    const double revolutions = static_cast<double>(pulses_) / wheelConfig_.countsPerRevolution;
    return revolutions * circumference;
}

int Odometry::cellsTraveled() const {
    return static_cast<int>(std::fabs(distanceMm()) / wheelConfig_.cellSizeMm);
}

}  // namespace micromouse::domain
