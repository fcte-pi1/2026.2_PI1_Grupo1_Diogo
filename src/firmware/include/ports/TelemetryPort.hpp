#pragma once

#include <string>

namespace micromouse::ports {

class ITelemetryPort {
public:
    virtual ~ITelemetryPort() = default;
    virtual void publish(const std::string& jsonPayload) = 0;
    [[nodiscard]] virtual bool isConnected() const = 0;
};

}  // namespace micromouse::ports
