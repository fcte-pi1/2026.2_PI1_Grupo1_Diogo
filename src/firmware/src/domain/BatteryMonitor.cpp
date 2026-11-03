#include "domain/BatteryMonitor.hpp"

#include <stdexcept>

namespace micromouse::domain {

BatteryMonitor::BatteryMonitor(double lowVoltageV, int consecutiveSamples)
    : lowVoltageV_(lowVoltageV), requiredSamples_(consecutiveSamples) {
    if (!(lowVoltageV > 0.0)) {
        throw std::invalid_argument("lowVoltageV deve ser positivo");
    }
    if (consecutiveSamples < 1) {
        throw std::invalid_argument("consecutiveSamples deve ser pelo menos 1");
    }
}

bool BatteryMonitor::update(double voltageV) noexcept {
    if (!(voltageV > 0.0)) {  // inclui NaN
        return isLow();
    }
    if (voltageV < lowVoltageV_) {
        if (lowSamples_ < requiredSamples_) ++lowSamples_;
    } else {
        lowSamples_ = 0;
    }
    return isLow();
}

bool BatteryMonitor::isLow() const noexcept { return lowSamples_ >= requiredSamples_; }

void BatteryMonitor::reset() noexcept { lowSamples_ = 0; }

}  // namespace micromouse::domain
