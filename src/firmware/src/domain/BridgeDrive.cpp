#include "domain/BridgeDrive.hpp"

#include <algorithm>
#include <cmath>

namespace micromouse::domain {

BridgeDuty bridgeDuty(double command, DecayMode mode) noexcept {
    const double magnitude = std::min(std::fabs(command), 1.0);
    // No slow decay, a entrada do outro sentido freia no tempo desligado: duty = 1 - potência.
    const double other = mode == DecayMode::Slow ? 1.0 - magnitude : 0.0;
    const double drive = mode == DecayMode::Slow ? 1.0 : magnitude;
    if (command >= 0.0) {
        return {drive, other};
    }
    return {other, drive};
}

}  // namespace micromouse::domain
