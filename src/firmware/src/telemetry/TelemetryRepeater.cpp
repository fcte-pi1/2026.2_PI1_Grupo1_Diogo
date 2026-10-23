#include "telemetry/TelemetryRepeater.hpp"

#include <algorithm>
#include <utility>

namespace micromouse::telemetry {

TelemetryRepeater::TelemetryRepeater(std::vector<long> delaysMs) : delaysMs_(std::move(delaysMs)) {}

void TelemetryRepeater::schedule(long now, const std::string& message) {
    for (const long delay : delaysMs_) {
        const Pending copy{now + delay, message};
        // Insere mantendo a ordem por dueAt; empates ficam na ordem de chegada.
        const auto position =
            std::upper_bound(pending_.begin(), pending_.end(), copy.dueAt,
                             [](long dueAt, const Pending& other) { return dueAt < other.dueAt; });
        pending_.insert(position, copy);
    }
}

std::vector<std::string> TelemetryRepeater::due(long now) {
    std::vector<std::string> ready;
    auto firstPending = pending_.begin();
    while (firstPending != pending_.end() && firstPending->dueAt <= now) {
        ready.push_back(std::move(firstPending->message));
        ++firstPending;
    }
    pending_.erase(pending_.begin(), firstPending);
    return ready;
}

bool TelemetryRepeater::empty() const noexcept { return pending_.empty(); }

}  // namespace micromouse::telemetry
