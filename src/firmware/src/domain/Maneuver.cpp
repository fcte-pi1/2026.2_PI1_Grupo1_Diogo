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

ArcStart arcStart(bool frontValid, double frontMm, const ArcStartConfig& config) noexcept {
    if (frontValid && frontMm >= 0.0 && frontMm < config.frontWallMaxMm) {
        return {config.frontTargetMm - frontMm, true};
    }
    return {config.fixedSetbackMm, false};
}

double arcStartCorrection(bool frontValid, double frontMm, const ArcStartConfig& config) noexcept {
    if (!frontValid || frontMm < 0.0 || frontMm >= config.frontWallMaxMm) {
        return 0.0;
    }
    const double error = config.frontTargetMm - frontMm;
    if (std::fabs(error) <= config.toleranceMm) {
        return 0.0;
    }
    return std::fmax(-config.maxCorrectionMm, std::fmin(error, config.maxCorrectionMm));
}

bool TurnStallDetector::update(double timeS, double angleDeg) noexcept {
    if (timeS < config_.graceS) {
        return false;
    }
    if (!started_) {
        started_ = true;
        windowStartS_ = timeS;
        windowStartDeg_ = angleDeg;
        return false;
    }
    if (timeS - windowStartS_ < config_.windowS) {
        return false;
    }
    const bool stalled = std::fabs(angleDeg - windowStartDeg_) < config_.minDeg;
    windowStartS_ = timeS;
    windowStartDeg_ = angleDeg;
    return stalled;
}

GyroTurnController::GyroTurnController(double targetDeg, double toleranceDeg)
    : targetDeg_(targetDeg), toleranceDeg_(toleranceDeg) {}

double GyroTurnController::angle() const noexcept { return angle_; }

bool GyroTurnController::reached() const noexcept {
    return std::fabs(angle_) >= targetDeg_ - toleranceDeg_;
}

void GyroTurnController::integrate(double angularVelDegPerS, double deltaTimeSeconds) {
    if (!(deltaTimeSeconds > 0.0)) {
        return;
    }
    angle_ += angularVelDegPerS * deltaTimeSeconds;
}

void GyroTurnController::reset() noexcept { angle_ = 0.0; }

}  // namespace micromouse::domain
