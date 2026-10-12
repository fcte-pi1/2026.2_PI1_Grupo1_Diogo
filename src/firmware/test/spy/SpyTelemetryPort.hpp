#pragma once

#include <string>
#include <vector>

#include "ports/TelemetryPort.hpp"

namespace micromouse::test {

// Duplo de teste da porta de telemetria: captura o que seria publicado.
class SpyTelemetry final : public ports::ITelemetryPort {
public:
    std::vector<std::string> published;
    bool connected{true};

    void publish(const std::string& payload) override { published.push_back(payload); }
    [[nodiscard]] bool isConnected() const override { return connected; }
};

}  // namespace micromouse::test
