#include "domain/SensorHealthMonitor.hpp"

#include <stdexcept>

namespace micromouse::domain {

SensorHealthMonitor::SensorHealthMonitor(int consecutiveFailures)
    : requiredFailures_(consecutiveFailures) {
    if (consecutiveFailures < 1) {
        throw std::invalid_argument("consecutiveFailures deve ser pelo menos 1");
    }
}

bool SensorHealthMonitor::update(bool healthy) noexcept {
    if (hasFailed()) return true;  // a falha confirmada não se desfaz sozinha
    failures_ = healthy ? 0 : failures_ + 1;
    return hasFailed();
}

bool SensorHealthMonitor::hasFailed() const noexcept { return failures_ >= requiredFailures_; }

void SensorHealthMonitor::reset() noexcept { failures_ = 0; }

}  // namespace micromouse::domain
