#include "domain/Maneuver.hpp"

#include <cmath>
#include <stdexcept>
#include <string>

namespace micromouse::domain {

namespace {

double requirePositive(double value, const char* what) {
    if (!(value > 0.0)) {
        throw std::invalid_argument(std::string("TurnConfig: ") + what + " must be positive");
    }
    return value;
}
}  // namespace

double pulsesForTurn(const TurnConfig& config, double degrees) {
    requirePositive(config.wheelDiameterMm, "wheelDiameterMm");
    requirePositive(static_cast<double>(config.countsPerRevolution), "countsPerRevolution");
    requirePositive(config.wheelTrackMm, "wheelTrackMm");

    // pulsos = (bitola/2) x |graus| x counts / (180 x diâmetro)
    return (config.wheelTrackMm / 2.0) * std::fabs(degrees) * config.countsPerRevolution /
           (180.0 * config.wheelDiameterMm);
};

GyroTurnController::GyroTurnController(double targetDeg, double toleranceDeg)
    : targetDeg_(targetDeg), toleranceDeg_(toleranceDeg) {}

double GyroTurnController::angle() const noexcept { return angle_; }

bool GyroTurnController::reached() const noexcept {
    return std::fabs(angle_) >= targetDeg_ - toleranceDeg_;
}

void GyroTurnController::integrate(double angularVelDegPerS, double deltaTimeSeconds) {
    angle_ += angularVelDegPerS * deltaTimeSeconds;
}

}  // namespace micromouse::domain
