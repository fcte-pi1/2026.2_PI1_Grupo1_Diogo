#include "telemetry/TelemetryBuffer.hpp"

namespace micromouse::telemetry {

TelemetryBuffer::TelemetryBuffer(long retentionMs, std::size_t maxMessages)
    : retentionMs_(retentionMs), maxMessages_(maxMessages) {}

std::size_t TelemetryBuffer::size() const noexcept { return buffer_.size(); }

bool TelemetryBuffer::empty() const noexcept { return buffer_.size(); }

std::vector<std::string> TelemetryBuffer::messages() const {
    std::vector<std::string> result;
    result.reserve(buffer_.size());

    for (const Entry& entry : buffer_) {
        result.push_back(entry.message);
    }

    return result;
}

}  // namespace micromouse::telemetry
