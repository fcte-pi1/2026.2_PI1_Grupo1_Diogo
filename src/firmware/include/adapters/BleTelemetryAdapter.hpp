#pragma once

#include <string>

#include "ports/TelemetryPort.hpp"

class NimBLECharacteristic;

namespace micromouse::adapters {

class BleTelemetryAdapter final : public ports::ITelemetryPort {
public:
    // Recebe cada comando de texto escrito no canal RX (sem quebra de linha nem espaços nas pontas).
    // Roda na tarefa do BLE: tem que ser curto (só marcar uma flag).
    using CommandHandler = void (*)(const std::string& command);

private:
    NimBLECharacteristic* txCharacteristic_{nullptr};

public:
    // Com `onCommand`, cria também o canal RX do NUS (escrita), para comandos de teste (largar e
    // parar sem cabo, só nos builds com RATO_LOG_RETA). Sem ele, o serviço só envia, como antes.
    void begin(const std::string& deviceName = "RatoBorrachudo", CommandHandler onCommand = nullptr);
    void publish(const std::string& jsonPayload) override;
    [[nodiscard]] bool isConnected() const override;
    // Pedaços de mensagem que a pilha BLE recusou até o fim das tentativas (perdidos) desde o boot.
    // Em 11/11 sumiram linhas de log em 2 manobras e nenhum contador mostrava onde.
    [[nodiscard]] static unsigned droppedChunks() noexcept;
};

}  // namespace micromouse::adapters
