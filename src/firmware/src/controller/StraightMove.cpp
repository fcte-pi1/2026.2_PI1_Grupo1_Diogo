#include "controller/StraightMove.hpp"

#include <algorithm>
#include <cmath>

namespace micromouse::controller {

StraightMove::StraightMove(double distanceMm, const StraightMoveConfig& config) noexcept
    : config_(config),
      profile_(distanceMm, config.limits),
      left_(config.wheel),
      right_(config.wheel) {}

StraightMove::Output StraightMove::step(double dtSeconds, double leftMm, double rightMm,
                                        double leftMmPerS, double rightMmPerS,
                                        double offsetMm) noexcept {
    time_ += std::max(dtSeconds, 0.0);
    ++steps_;
    const TrapezoidProfile::Sample reference = profile_.at(time_);

    const double difference = (leftMm - rightMm) + offsetMm;
    lastDifference_ = leftMm - rightMm;
    maxDifference_ = std::max(maxDifference_, std::fabs(lastDifference_));
    const double shift = 0.5 * config_.syncGain * difference;
    const double leftTarget = reference.position - shift;
    const double rightTarget = reference.position + shift;

    const double leftVolts =
        left_.update(leftTarget, reference.speed, leftMm, leftMmPerS, dtSeconds);
    const double rightVolts =
        right_.update(rightTarget, reference.speed, rightMm, rightMmPerS, dtSeconds);
    if (left_.saturated() || right_.saturated()) {
        ++saturated_;
    }
    maxLeftVolts_ = std::max(maxLeftVolts_, std::fabs(leftVolts));
    maxRightVolts_ = std::max(maxRightVolts_, std::fabs(rightVolts));

    if (reference.finished) {
        const bool settled = std::fabs(leftTarget - leftMm) < config_.settleToleranceMm &&
                             std::fabs(rightTarget - rightMm) < config_.settleToleranceMm &&
                             std::fabs(leftMmPerS) < config_.settleMmPerS &&
                             std::fabs(rightMmPerS) < config_.settleMmPerS;
        if (settled || time_ >= profile_.duration() + config_.maxSettleSeconds) {
            return {0.0, 0.0, true};
        }
    }
    return {leftVolts, rightVolts, false};
}

}  // namespace micromouse::controller
