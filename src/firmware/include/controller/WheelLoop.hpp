#pragma once

#include <array>
#include <cstddef>

namespace micromouse::controller {

// Ganhos do controle de UMA roda, em volts no motor (domain/MotorVoltage converte para o PWM).
struct WheelLoopGains {
    double voltsPerMmPerS;    // feedforward de velocidade: tensão para manter 1 mm/s
    double staticVolts;       // feedforward do atrito estático: o empurrão para a roda sair do lugar
    double voltsPerMm;        // proporcional no erro de posição
    double voltsPerMmSecond;  // integral do erro de posição (atrito e carga que o feedforward erra)
    double voltsPerMmPerSErr; // derivativo: erro de velocidade (referência - medida)
    double maxVolts;          // teto da tensão no motor (N20 de 6 V)
    double maxIntegralVolts;  // teto da parcela integral (anti-windup)
};

// Uma roda seguindo uma referência de posição e velocidade (mm, mm/s):
//   tensão = feedforward(velocidade, atrito) + P x erro + I x integral + D x erro de velocidade.
// O feedforward faz a roda acompanhar a trajetória sem esperar o erro crescer; o P e o I corrigem o
// que ele erra (roda mais dura, chão, bateria). Cada roda recebe a tensão de que precisa: em 07/11,
// a direita não saía do lugar a ~50% e a esquerda saía, e um comando fixo igual não serve às duas.
class WheelLoop {
public:
    explicit WheelLoop(const WheelLoopGains& gains) noexcept : gains_(gains) {}

    [[nodiscard]] double update(double referenceMm, double referenceMmPerS, double measuredMm,
                                double measuredMmPerS, double dtSeconds) noexcept;
    void reset() noexcept { integral_ = 0.0; }
    [[nodiscard]] bool saturated() const noexcept { return saturated_; }

private:
    WheelLoopGains gains_;
    double integral_{0.0};  // mm·s
    bool saturated_{false};
};

// Velocidade de uma roda pela posição dos encoders numa janela curta. Um pulso é 0,375 mm: em 2 ms
// a 250 mm/s mal passa 1 pulso, então a derivada de uma volta para a outra seria só ruído.
class SpeedEstimator {
public:
    void reset(double positionMm, double timeSeconds) noexcept;
    // Guarda a amostra e devolve a velocidade (mm/s) entre ela e a mais antiga da janela.
    double update(double positionMm, double timeSeconds) noexcept;

private:
    static constexpr std::size_t kWindow = 8;  // ~16 ms com o laço de 2 ms
    std::array<double, kWindow> position_{};
    std::array<double, kWindow> time_{};
    std::size_t next_{0};
    std::size_t count_{0};
};

}  // namespace micromouse::controller
