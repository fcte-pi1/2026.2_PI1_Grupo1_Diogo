#pragma once

namespace micromouse::domain {

// Detecta bateria fraca (RF-55, RF-9). Só confirma depois de várias leituras seguidas abaixo do
// limiar, para uma queda de tensão passageira (partida dos motores) não derrubar a corrida.
// Leituras inválidas (zero, negativas ou NaN) não contam: elas indicam falha do sensor, não
// bateria fraca, e o auto-teste já trata a falta do INA219.
class BatteryMonitor {
public:
    // Valores provisórios: 3,3 V por célula de uma LiPo 2S. O hardware deve confirmar o limiar.
    static constexpr double kDefaultLowVoltageV = 6.6;
    static constexpr int kDefaultConsecutiveSamples = 5;

private:
    double lowVoltageV_;
    int requiredSamples_;
    int lowSamples_{0};

public:
    explicit BatteryMonitor(double lowVoltageV = kDefaultLowVoltageV,
                            int consecutiveSamples = kDefaultConsecutiveSamples);
    // Registra uma leitura e devolve true quando a bateria fraca está confirmada.
    bool update(double voltageV) noexcept;
    [[nodiscard]] bool isLow() const noexcept;
    void reset() noexcept;
};

}  // namespace micromouse::domain
