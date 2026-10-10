#pragma once

#include <cstddef>
#include <deque>
#include <string>
#include <vector>

namespace micromouse::telemetry {

class TelemetryBuffer {
private:
    struct Entry {
        long timestamp;
        std::string message;
    };
    std::deque<Entry> buffer_;
    long retentionMs_;
    std::size_t maxMessages_;

public:
    TelemetryBuffer(long retentionMs, std::size_t maxMessages);
    [[nodiscard]] std::size_t size() const noexcept;
    [[nodiscard]] bool empty() const noexcept;
    [[nodiscard]] std::vector<std::string> messages() const;
    void add(long timestamp, const std::string& message);
    void clear() noexcept;
};

}  // namespace micromouse::telemetry
