#include "domain/BridgeDrive.hpp"

#include <algorithm>
#include <cmath>

namespace micromouse::domain {

BridgeDuty bridgeDuty(double command) noexcept {
    const double magnitude = std::min(std::fabs(command), 1.0);
    if (command >= 0.0) {
        return {magnitude, 0.0};
    }
    return {0.0, magnitude};
}

}  // namespace micromouse::domain
