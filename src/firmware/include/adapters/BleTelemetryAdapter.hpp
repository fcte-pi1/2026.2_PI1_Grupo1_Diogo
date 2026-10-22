#pragma once

#include <string>

#include "ports/TelemetryPort.hpp"

class NimBLECharacteristic;

namespace micromouse::adapters {

class BleTelemetryAdapter final : public ports::ITelemetryPort {
private:
    NimBLECharacteristic* txCharacteristic_{nullptr};

public:
    void begin(const std::string& deviceName = "RatoBorrachudo");
    void publish(const std::string& jsonPayload) override;
    [[nodiscard]] bool isConnected() const override;
};

}  // namespace micromouse::adapters
