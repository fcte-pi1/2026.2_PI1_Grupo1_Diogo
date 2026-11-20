#include "controller/PathMove.hpp"

#include <algorithm>
#include <cmath>

namespace micromouse::controller {
namespace {
constexpr double kPi = 3.14159265358979323846;
}

double PathPlan::arcLengthMm() const noexcept { return radiusMm * angleDeg * kPi / 180.0; }

PathPlan::Wheels PathPlan::wheelsAt(double axleMm) const noexcept {
    const double half = trackMm / 2.0;
    const double outerFactor = (radiusMm + half) / radiusMm;
    const double innerFactor = (radiusMm - half) / radiusMm;
    const double arc = arcLengthMm();
    const double s = std::clamp(axleMm, 0.0, lengthMm());
    double outer = s, inner = s, outerF = 1.0, innerF = 1.0, turnedRad = 0.0;
    if (s > approachMm) {
        const double inArc = std::min(s - approachMm, arc);
        turnedRad = inArc / radiusMm;
        outer = approachMm + inArc * outerFactor;
        inner = approachMm + inArc * innerFactor;
        if (s - approachMm < arc) {
            outerF = outerFactor;
            innerF = innerFactor;
        } else {
            const double after = s - approachMm - arc;
            outer += after;
            inner += after;
        }
    }
    const double heading = turnedRad * 180.0 / kPi;
    if (right) {
        return {outer, inner, outerF, innerF, -heading};
    }
    return {inner, outer, innerF, outerF, heading};
}

PathMove::PathMove(const PathPlan& plan, const StraightMoveConfig& config, double startSpeedMmPerS) noexcept
    : plan_(plan),
      config_(config),
      profile_(0.0, startSpeedMmPerS, plan.lengthMm(), config.limits),
      left_(config.wheel),
      right_(config.wheel) {}

PathMove::Output PathMove::step(double dtSeconds, double leftMm, double rightMm, double leftMmPerS,
                                double rightMmPerS, double steerMm) noexcept {
    time_ += std::max(dtSeconds, 0.0);
    const RunProfile::Sample reference = profile_.at(time_);
    const PathPlan::Wheels wheels = plan_.wheelsAt(reference.position);
    // Sincronia: a diferença entre as rodas em relação à planejada.
    const double difference = (leftMm - rightMm) - (wheels.leftMm - wheels.rightMm);
    const double shift = 0.5 * config_.syncGain * difference;
    const double leftTarget = wheels.leftMm - shift - 0.5 * steerMm;
    const double rightTarget = wheels.rightMm + shift + 0.5 * steerMm;
    const double leftVolts =
        left_.update(leftTarget, reference.speed * wheels.leftFactor, leftMm, leftMmPerS, dtSeconds);
    const double rightVolts =
        right_.update(rightTarget, reference.speed * wheels.rightFactor, rightMm, rightMmPerS, dtSeconds);
    if (reference.finished) {
        const bool settled = std::fabs(leftTarget - leftMm) < config_.settleToleranceMm &&
                             std::fabs(rightTarget - rightMm) < config_.settleToleranceMm &&
                             std::fabs(leftMmPerS) < config_.settleMmPerS &&
                             std::fabs(rightMmPerS) < config_.settleMmPerS;
        if (settled) {
            return {0.0, 0.0, true};
        }
        if (time_ >= profile_.duration() + config_.maxSettleSeconds) {
            reached_ = std::fabs(leftTarget - leftMm) <= config_.maxMissMm &&
                       std::fabs(rightTarget - rightMm) <= config_.maxMissMm;
            return {0.0, 0.0, true};
        }
    }
    return {leftVolts, rightVolts, false};
}

}  // namespace micromouse::controller
