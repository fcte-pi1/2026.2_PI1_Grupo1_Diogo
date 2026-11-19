#pragma once

#include <algorithm>
#include <cmath>

namespace micromouse::controller {

// Rampa de tensão de UM motor (soft-start, 19/11). Limita quanto a tensão pedida pode SUBIR por segundo:
// o degrau do atrito estático (2,5 V de uma vez, nas duas rodas) é um pico de corrente que, com a bateria
// e o conector instáveis, derrubava a alimentação na partida (BROWNOUT em ~3 de 8 partidas).
// - Só limita o crescimento do módulo da tensão; reduzir (frear) passa direto, para não atrasar o freio.
// - Inverter o sentido passa por zero na hora e sobe no sentido novo pela mesma rampa.
// - rampa 0 = desligada (passa direto).
class VoltageSlew {
public:
    explicit VoltageSlew(double rampVoltsPerS = 0.0) noexcept : ramp_(rampVoltsPerS) {}

    void setRamp(double rampVoltsPerS) noexcept { ramp_ = rampVoltsPerS; }
    void reset(double volts = 0.0) noexcept { last_ = volts; }
    [[nodiscard]] double last() const noexcept { return last_; }

    [[nodiscard]] double step(double targetVolts, double dtSeconds) noexcept {
        if (!(ramp_ > 0.0)) {
            last_ = targetVolts;
            return last_;
        }
        const double maxStep = ramp_ * std::max(dtSeconds, 0.0);
        const bool reversing = last_ != 0.0 && targetVolts != 0.0 && (last_ > 0.0) != (targetVolts > 0.0);
        const double base = reversing ? 0.0 : last_;
        if (std::fabs(targetVolts) > std::fabs(base)) {
            last_ = base + std::copysign(std::min(std::fabs(targetVolts) - std::fabs(base), maxStep),
                                         targetVolts);
        } else {
            last_ = targetVolts;
        }
        return last_;
    }

private:
    double ramp_;
    double last_{0.0};
};

}  // namespace micromouse::controller
