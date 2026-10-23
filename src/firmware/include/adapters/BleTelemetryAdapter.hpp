#pragma once

#include <cstdint>
#include <string>

#include "ports/TelemetryPort.hpp"

class NimBLECharacteristic;

namespace micromouse::adapters {

// Contadores do envio por BLE, para localizar a perda de mensagens (#381).
struct BleStats {
    uint32_t sentMessages;     // mensagens entregues inteiras à pilha BLE
    uint32_t droppedMessages;  // mensagens abandonadas porque um pedaço falhou
    uint32_t failedNotifies;   // pedaços recusados pela pilha depois de todas as tentativas
    uint32_t statusErrors;     // notificações que a pilha informou ter falhado (onStatus)
    uint16_t mtu;              // MTU negociado com o receptor
};

class BleTelemetryAdapter final : public ports::ITelemetryPort {
private:
    NimBLECharacteristic* txCharacteristic_{nullptr};

public:
    void begin(const std::string& deviceName = "RatoBorrachudo");
    void publish(const std::string& jsonPayload) override;
    [[nodiscard]] bool isConnected() const override;
    [[nodiscard]] BleStats stats() const;
};

}  // namespace micromouse::adapters
