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


// O ToF precisa ser reiniciado pelo XSHUT? Sim se não responde ou a última medida foi falha, a não
// ser no modo automático depois de `kMaxFailedRestarts` reinícios seguidos sem sucesso. Só vale com o
// robô PARADO (cada reinício leva ~0,3 s).
inline constexpr unsigned kMaxFailedRestarts = 3;
[[nodiscard]] bool shouldRestartSensor(bool answers, bool lastReadFailed, unsigned failedStreak,
                                       bool automatic) noexcept;

// Motivo do Erro por falha de sensor confirmada (RF-55). `tofSummary` vem do adaptador dos ToF.
void describeSensorFailure(char* out, unsigned long size, bool imuOk, bool powerOk,
                           const char* tofSummary) noexcept;

}  // namespace micromouse::domain
