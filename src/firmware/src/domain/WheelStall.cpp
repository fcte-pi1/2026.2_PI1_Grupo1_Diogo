#include "domain/WheelStall.hpp"

#include <cstdlib>

namespace micromouse::domain {

StalledWheel detectStalledWheel(long leftPulses, long rightPulses,
                                const WheelStallConfig& config) noexcept {
    const long left = std::labs(leftPulses);
    const long right = std::labs(rightPulses);
    const long faster = left > right ? left : right;
    const long slower = left > right ? right : left;
    if (faster < config.minPulses ||
        static_cast<double>(slower) >= config.minRatio * static_cast<double>(faster)) {
        return StalledWheel::None;
    }
    return left < right ? StalledWheel::Left : StalledWheel::Right;
}

const char* stalledWheelName(StalledWheel wheel) noexcept {
    switch (wheel) {
        case StalledWheel::Left:
            return "roda esquerda parada";
        case StalledWheel::Right:
            return "roda direita parada";
        case StalledWheel::None:
            break;
    }
    return "";
}

}  // namespace micromouse::domain
