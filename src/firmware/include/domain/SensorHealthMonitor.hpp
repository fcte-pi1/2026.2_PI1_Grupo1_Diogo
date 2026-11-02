#pragma once

namespace micromouse::domain {

// Confirma a falha de um sensor (RF-55) só depois de várias verificações seguidas sem resposta.
// Um NACK isolado no I²C, com o ruído dos motores e o chicote longo, não é a falha irrecuperável
// que leva ao estado Erro: uma resposta boa no meio zera a contagem.
class SensorHealthMonitor {
public:
    static constexpr int kDefaultConsecutiveFailures = 3;

private:
    int requiredFailures_;
    int failures_{0};

public:
    explicit SensorHealthMonitor(int consecutiveFailures = kDefaultConsecutiveFailures);
    // Registra uma verificação e devolve true quando a falha está confirmada.
    bool update(bool healthy) noexcept;
    [[nodiscard]] bool hasFailed() const noexcept;
    void reset() noexcept;
};

}  // namespace micromouse::domain
