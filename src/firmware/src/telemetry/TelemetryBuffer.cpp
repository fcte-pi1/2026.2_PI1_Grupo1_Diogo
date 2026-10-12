#include "telemetry/TelemetryBuffer.hpp"

namespace micromouse::telemetry {

TelemetryBuffer::TelemetryBuffer(long retentionMs, std::size_t maxMessages)
    : retentionMs_(retentionMs), maxMessages_(maxMessages) {}

std::size_t TelemetryBuffer::size() const noexcept { return buffer_.size(); }

bool TelemetryBuffer::empty() const noexcept { return buffer_.empty(); }

std::vector<std::string> TelemetryBuffer::messages() const {
    std::vector<std::string> result;
    result.reserve(buffer_.size());

    for (const Entry& entry : buffer_) {
        result.push_back(entry.message);
    }

    return result;
}

void TelemetryBuffer::add(long timestamp, const std::string& message) {
    buffer_.push_back({timestamp, message});

    const long cutoff = timestamp - retentionMs_;

    // Remove entries that are outside the retention window
    while (!buffer_.empty() && buffer_.front().timestamp < cutoff) {
        buffer_.pop_front();
    }

    // Remove entries that exceed the maximum message count
    while (buffer_.size() > maxMessages_) {
        buffer_.pop_front();
    }
}

void TelemetryBuffer::clear() noexcept { buffer_.clear(); }

}  // namespace micromouse::telemetry
