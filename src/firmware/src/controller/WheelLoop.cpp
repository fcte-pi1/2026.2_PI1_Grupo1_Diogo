#include "controller/WheelLoop.hpp"

#include <algorithm>
#include <cmath>

namespace micromouse::controller {

namespace {
// Abaixo disto a referência está parada: o atrito estático passa a seguir o sinal do erro.
constexpr double kMovingMmPerS = 1.0;
// Erro de posição em que o empurrão do atrito entra inteiro (abaixo, entra proporcional, para a
// roda não ficar vibrando em volta do alvo).
constexpr double kStaticFullErrorMm = 2.0;

double sign(double value) { return value > 0.0 ? 1.0 : (value < 0.0 ? -1.0 : 0.0); }
}  // namespace

double WheelLoop::update(double referenceMm, double referenceMmPerS, double measuredMm,
                         double measuredMmPerS, double dtSeconds) noexcept {
    const double error = referenceMm - measuredMm;
    double feedforward = gains_.voltsPerMmPerS * referenceMmPerS;
    if (std::fabs(referenceMmPerS) > kMovingMmPerS) {
        feedforward += gains_.staticVolts * sign(referenceMmPerS);
    } else {
        feedforward += gains_.staticVolts * sign(error) *
                       std::min(std::fabs(error) / kStaticFullErrorMm, 1.0);
    }

    const double previousIntegral = integral_;
    if (dtSeconds > 0.0) {
        integral_ += error * dtSeconds;
    }
    if (gains_.voltsPerMmSecond > 0.0) {
        const double limit = gains_.maxIntegralVolts / gains_.voltsPerMmSecond;
        integral_ = std::clamp(integral_, -limit, limit);
    }

    const double raw = feedforward + gains_.voltsPerMm * error +
                       gains_.voltsPerMmSecond * integral_ +
                       gains_.voltsPerMmPerSErr * (referenceMmPerS - measuredMmPerS);
    const double limited = std::clamp(raw, -gains_.maxVolts, gains_.maxVolts);
    saturated_ = limited != raw;
    // Anti-windup: saturado, a integral não cresce no sentido que só piora a saturação.
    if (saturated_ && sign(error) == sign(raw)) {
        integral_ = previousIntegral;
    }
    return limited;
}

void SpeedEstimator::reset(double positionMm, double timeSeconds) noexcept {
    position_.fill(positionMm);
    time_.fill(timeSeconds);
    count_ = 1;  // a amostra de partida fica na posição 0
    next_ = 1;
}

double SpeedEstimator::update(double positionMm, double timeSeconds) noexcept {
    position_[next_] = positionMm;
    time_[next_] = timeSeconds;
    next_ = (next_ + 1) % kWindow;
    count_ = std::min(count_ + 1, kWindow);
    // A mais antiga da janela: com a janela cheia é a próxima a ser sobrescrita.
    const std::size_t oldest = count_ < kWindow ? 0 : next_;
    const double dt = timeSeconds - time_[oldest];
    if (!(dt > 0.0)) {
        return 0.0;
    }
    return (positionMm - position_[oldest]) / dt;
}

}  // namespace micromouse::controller
