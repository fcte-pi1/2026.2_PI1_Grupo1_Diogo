#include "domain/WallCentering.hpp"

#include <algorithm>
#include <cmath>

namespace micromouse::domain {

namespace {
bool usable(const SideReading& side, const WallCenteringConfig& config) {
    return side.valid && side.mm >= 0.0 && side.mm < config.useBelowMm;
}
}  // namespace

double wallCenteringError(const SideReading& left, const SideReading& right,
                          const WallCenteringConfig& config) noexcept {
    const bool hasLeft = usable(left, config);
    const bool hasRight = usable(right, config);
    double offsetMm = 0.0;  // positivo: deslocado para a direita
    if (hasLeft && hasRight) {
        offsetMm = (left.mm - right.mm) / 2.0;
    } else if (hasLeft) {
        offsetMm = left.mm - config.centerMm;
    } else if (hasRight) {
        offsetMm = config.centerMm - right.mm;
    } else {
        return 0.0;
    }
    return std::clamp(config.gainPulsesPerMm * offsetMm, -config.maxPulses, config.maxPulses);
}


LateralPose estimateLateralPose(const SideReading& left, const SideReading& right,
                                double headingDeg, const LateralPoseConfig& config) noexcept {
    constexpr double kDegToRad = 3.14159265358979323846 / 180.0;
    if (std::fabs(headingDeg) > config.maxHeadingDeg) {
        return {};
    }
    auto usable = [&config](const SideReading& side) {
        return side.valid && side.mm > 0.0 && side.mm < config.useBelowMm;
    };
    const bool hasLeft = usable(left);
    const bool hasRight = usable(right);
    // Deslocamento lateral do sensor por causa do rumo; o eixo está esse tanto mais para a direita.
    const double turnMm = config.sensorAheadMm * std::tan(headingDeg * kDegToRad);
    if (hasLeft && hasRight) {
        return {true, (left.mm - right.mm) / 2.0 + turnMm, true};
    }
    if (hasLeft) {
        const double center = config.leftCenterMm > 0.0 ? config.leftCenterMm : config.centerMm;
        return {true, left.mm - center + turnMm, false};
    }
    if (hasRight) {
        const double center = config.rightCenterMm > 0.0 ? config.rightCenterMm : config.centerMm;
        return {true, center - right.mm + turnMm, false};
    }
    return {};
}

LateralPoseCenters learnCenters(const SideReading& left, const SideReading& right, double offsetMm) noexcept {
    return {left.mm - offsetMm, right.mm + offsetMm};
}

double lateralCorrectionPulses(const LateralPose& pose, const WallCenteringConfig& config) noexcept {
    if (!pose.valid) {
        return 0.0;
    }
    return std::clamp(config.gainPulsesPerMm * pose.rightOffsetMm, -config.maxPulses,
                      config.maxPulses);
}

}  // namespace micromouse::domain
