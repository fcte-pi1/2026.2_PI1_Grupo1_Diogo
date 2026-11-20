#pragma once

#include <algorithm>

namespace micromouse::controller {

// Suaviza o termo da parede (RF-44) antes de ele entrar na reta (20/11). Filtro de primeira ordem com constante de
// tempo `tauSeconds` e limite de taxa `maxRateMmPerS`: um degrau de leitura (ruído do ToF, ou o ToF direito perto do
// limite de alcance alternando entre válido e "perto") deixa de ser um degrau de posição nas rodas.
// A correção lateral já é lenta (~1,3 s com ganho_parede = 2,5); um atraso de 0,3 s não a desestabiliza.
class OffsetFilter {
public:
    OffsetFilter(double tauSeconds, double maxRateMmPerS) noexcept : tau_(tauSeconds), maxRate_(maxRateMmPerS) {}

    [[nodiscard]] double step(double targetMm, double dtSeconds) noexcept {
        if (!(dtSeconds > 0.0)) {
            return value_;
        }
        const double alpha = dtSeconds / (tau_ + dtSeconds);
        const double wanted = alpha * (targetMm - value_);
        const double limit = maxRate_ * dtSeconds;
        value_ += std::clamp(wanted, -limit, limit);
        return value_;
    }

    void reset() noexcept { value_ = 0.0; }
    [[nodiscard]] double value() const noexcept { return value_; }

private:
    double tau_;
    double maxRate_;
    double value_{0.0};
};

}  // namespace micromouse::controller
