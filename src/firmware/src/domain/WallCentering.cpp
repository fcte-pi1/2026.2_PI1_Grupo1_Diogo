#include "domain/WallCentering.hpp"

#include <algorithm>

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

}  // namespace micromouse::domain
