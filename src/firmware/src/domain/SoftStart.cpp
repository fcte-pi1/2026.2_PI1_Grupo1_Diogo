#include "domain/SoftStart.hpp"

namespace micromouse::domain {

double softStartFactor(uint32_t elapsedMs, uint32_t rampMs) noexcept {
    if (rampMs == 0 || elapsedMs >= rampMs) {
        return 1.0;
    }
    return static_cast<double>(elapsedMs) / static_cast<double>(rampMs);
}

}  // namespace micromouse::domain
