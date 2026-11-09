#include "controller/PivotMove.hpp"

#include <algorithm>
#include <cmath>

namespace micromouse::controller {

PivotMove::PivotMove(double targetDeg, Direction direction, const PivotMoveConfig& config) noexcept
    : targetDeg_(std::fabs(targetDeg)),
      direction_(direction),
      config_(config),
      profile_(std::fabs(targetDeg), config.limits),
      left_(config.wheel),
      right_(config.wheel),
      outerRadius_(config.turnRadiusMm + config.wheelTrackMm / 2.0),
      innerRadius_(config.turnRadiusMm - config.wheelTrackMm / 2.0) {}

PivotMove::Output PivotMove::step(double dtSeconds, double gyroDegPerS, double leftMm,
                                  double rightMm, double leftMmPerS,
                                  double rightMmPerS) noexcept {
    if (done_) {
        return {0.0, 0.0, true};
    }
    const double dt = std::max(dtSeconds, 0.0);
    angle_ += gyroDegPerS * dt;
    if (std::fabs(angle_) >= targetDeg_ - config_.toleranceDeg) {
        done_ = true;
        return {0.0, 0.0, true};
    }
    time_ += dt;

    const TrapezoidProfile::Sample sample = profile_.at(time_);
    double referenceDeg = sample.position;
    double referenceDegPerS = sample.speed;
    if (sample.finished) {
        // O perfil acabou e o giroscópio ainda não viu o alvo: as rodas patinaram. Continua girando
        // devagar até ele confirmar.
        crept_ = true;
        const double extra = config_.creepDegPerS * (time_ - profile_.duration());
        referenceDeg = targetDeg_ + std::min(extra, config_.maxCreepDeg);
        referenceDegPerS = extra < config_.maxCreepDeg ? config_.creepDegPerS : 0.0;
    }

    // Raio de cada roda (com sinal: negativo anda para trás). Na curva à direita, a de fora é a
    // esquerda.
    const bool right = direction_ == Direction::Right;
    const double leftRadius = right ? outerRadius_ : innerRadius_;
    const double rightRadius = right ? innerRadius_ : outerRadius_;
    const double radians = referenceDeg * kRadPerDeg;
    const double radiansPerS = referenceDegPerS * kRadPerDeg;
    double leftTarget = radians * leftRadius;
    double rightTarget = radians * rightRadius;
    // Sincronia: as duas rodas no mesmo ponto da curva. Cada roda vira "ângulo andado" pelo seu
    // raio; a adiantada espera e a atrasada é puxada. Uma roda com raio ~0 (gira no lugar) não
    // indica o ângulo e fica de fora.
    constexpr double kMinRadiusMm = 5.0;
    if (std::fabs(leftRadius) > kMinRadiusMm && std::fabs(rightRadius) > kMinRadiusMm) {
        const double shiftRad = 0.5 * config_.syncGain *
                                (leftMm / leftRadius - rightMm / rightRadius);
        leftTarget -= shiftRad * leftRadius;
        rightTarget += shiftRad * rightRadius;
    }
    double leftVolts = left_.update(leftTarget, radiansPerS * leftRadius, leftMm, leftMmPerS, dt);
    double rightVolts =
        right_.update(rightTarget, radiansPerS * rightRadius, rightMm, rightMmPerS, dt);
    // Em arco, as duas rodas andam para a frente (09/11: pedido para não girar com uma roda para
    // trás). A de dentro precisa FREAR para não ser arrastada pelo robô: com a tensão presa em >= 0
    // ela andou 223 mm em vez de 72 e o arco abriu (V1-1, 86° em 3 s). Então ela pode receber até
    // kArcBrakeVolts negativos: isso só desacelera, a referência dela continua para a frente.
    constexpr double kArcBrakeVolts = 2.0;
    if (leftRadius > 0.0) leftVolts = std::max(leftVolts, -kArcBrakeVolts);
    if (rightRadius > 0.0) rightVolts = std::max(rightVolts, -kArcBrakeVolts);
    maxVolts_ = std::max({maxVolts_, std::fabs(leftVolts), std::fabs(rightVolts)});
    return {leftVolts, rightVolts, false};
}

void PivotMove::settle(double gyroDegPerS, double dtSeconds) noexcept {
    angle_ += gyroDegPerS * std::max(dtSeconds, 0.0);
}

}  // namespace micromouse::controller
