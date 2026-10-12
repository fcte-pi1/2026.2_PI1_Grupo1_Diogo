#include "domain/Odometry.hpp"

#include <cmath>
#include <stdexcept>
#include <string>

namespace micromouse::domain {

namespace {

double requirePositive(double value, const char* what) {
    if (!(value > 0.0)) {
        throw std::invalid_argument(std::string("Odometry: ") + what + " deve ser positivo");
    }
    return value;
}

}  // namespace

Odometry::Odometry(const WheelConfig& cfg) : wheelConfig_(cfg) {
    requirePositive(cfg.wheelDiameterMm, "wheelDiameterMm");
    requirePositive(static_cast<double>(cfg.countsPerRevolution), "countsPerRevolution");
    requirePositive(cfg.cellSizeMm, "cellSizeMm");
}

void Odometry::onEncoderPulses(long ticks) noexcept { pulses_ += ticks; }

long Odometry::pulses() const noexcept { return pulses_; }

double Odometry::distanceMm() const {
    const double circumference = M_PI * wheelConfig_.wheelDiameterMm;
    const double revolutions = static_cast<double>(pulses_) / wheelConfig_.countsPerRevolution;
    return revolutions * circumference;
}

int Odometry::cellsTraveled() const {
    return static_cast<int>(std::fabs(distanceMm()) / wheelConfig_.cellSizeMm);
}

double Odometry::averageSpeedMmPerS(double elapsedSeconds) const {
    if (!(elapsedSeconds > 0.0)) return 0.0;
    return std::fabs(distanceMm()) / elapsedSeconds;
}

void Odometry::reset() noexcept { pulses_ = 0; }

}  // namespace micromouse::domain
