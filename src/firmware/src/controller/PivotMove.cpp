#include "controller/PivotMove.hpp"

#include <algorithm>
#include <cmath>

namespace micromouse::controller {

namespace {
constexpr double kPi = 3.14159265358979323846;
}

PivotMove::PivotMove(double targetDeg, Direction direction, const PivotMoveConfig& config) noexcept
    : targetDeg_(std::fabs(targetDeg)),
      direction_(direction),
      config_(config),
      profile_(std::fabs(targetDeg), config.limits),
      left_(config.wheel),
      right_(config.wheel),
      arcPerDeg_(config.wheelTrackMm * kPi / 360.0) {}

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

    // Arco de cada roda em módulo; na curva à direita a esquerda vai para a frente.
    const double leftSign = direction_ == Direction::Right ? 1.0 : -1.0;
    const double rightSign = -leftSign;
    const double leftArc = leftSign * leftMm;
    const double rightArc = rightSign * rightMm;
    const double shift = 0.5 * config_.syncGain * (leftArc - rightArc);
    const double arcReference = referenceDeg * arcPerDeg_;
    const double arcSpeed = referenceDegPerS * arcPerDeg_;

    const double leftVolts =
        leftSign * left_.update(arcReference - shift, arcSpeed, leftArc, leftSign * leftMmPerS, dt);
    const double rightVolts = rightSign * right_.update(arcReference + shift, arcSpeed, rightArc,
                                                        rightSign * rightMmPerS, dt);
    maxVolts_ = std::max({maxVolts_, std::fabs(leftVolts), std::fabs(rightVolts)});
    return {leftVolts, rightVolts, false};
}

void PivotMove::settle(double gyroDegPerS, double dtSeconds) noexcept {
    angle_ += gyroDegPerS * std::max(dtSeconds, 0.0);
}

}  // namespace micromouse::controller
