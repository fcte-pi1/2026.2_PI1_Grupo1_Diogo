#pragma once

#include "ports/SignalPort.hpp"

namespace micromouse::adapters {

// Aciona LEDs/buzzer e lê o botão de início.
class LocalInterfaceAdapter final : public ports::ISignalPort {
public:
    void begin();
    [[nodiscard]] bool buttonPressed() const;

    void signalReady() override;
    void signalRunning() override;
    void signalError() override;
};

}  // namespace micromouse::adapters
