#pragma once

#include <string>
#include <vector>

namespace micromouse::telemetry {

// Reenvia as mensagens críticas (inicio_corrida e fim_corrida) mais algumas vezes, com a
// MESMA sequência, espaçadas no tempo (#381). O robô só emite (RF-53) e não sabe se uma
// notificação BLE se perdeu: um fim_corrida perdido deixaria a corrida sem resultado. O
// backend descarta a cópia de uma sequência já recebida (CT-BE-08), então repetir é seguro.
// O espaçamento evita que todas as cópias caiam na mesma rajada de perda.
class TelemetryRepeater {
private:
    struct Pending {
        long dueAt;
        std::string message;
    };
    std::vector<long> delaysMs_;
    std::vector<Pending> pending_;  // em ordem de dueAt

public:
    // Uma cópia para cada atraso, contado a partir do envio original.
    explicit TelemetryRepeater(std::vector<long> delaysMs = {300, 1000});
    void schedule(long now, const std::string& message);
    // As cópias que venceram até `now`, em ordem; cada uma sai uma vez só.
    [[nodiscard]] std::vector<std::string> due(long now);
    [[nodiscard]] bool empty() const noexcept;
};

}  // namespace micromouse::telemetry
