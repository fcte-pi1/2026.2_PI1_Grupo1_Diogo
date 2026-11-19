#include "controller/RaceTimeModel.hpp"

#include <algorithm>
#include <cmath>

namespace micromouse::controller {

double timeToReach(double position, double distance, const ProfileLimits& limits) noexcept {
    const TrapezoidProfile profile(distance, limits);
    const double total = profile.duration();
    if (!(position > 0.0) || !(limits.acceleration > 0.0)) {
        return 0.0;
    }
    if (position >= distance) {
        return total;
    }
    const double peak = profile.peakSpeed();
    const double ramp = peak * peak / (2.0 * limits.acceleration);  // distância da rampa
    if (position <= ramp) {
        return std::sqrt(2.0 * position / limits.acceleration);
    }
    if (position <= distance - ramp) {
        return peak / limits.acceleration + (position - ramp) / peak;
    }
    return total - std::sqrt(2.0 * (distance - position) / limits.acceleration);
}

namespace {
double moveSeconds(double distanceMm, const StraightMoveConfig& straight, double overheadS) {
    return TrapezoidProfile(distanceMm, straight.limits).duration() + overheadS;
}
}  // namespace

StepTimes stepTimes(const StraightMoveConfig& straight, const PivotMoveConfig& arc) noexcept {
    const double straightStep = moveSeconds(kCellMm, straight, kLongMoveOverheadS);
    // O arco termina quando o giroscópio chega a 90 - freio graus, antes do fim do perfil.
    const double arcS = timeToReach(90.0 - arc.toleranceDeg, 90.0, arc.limits);
    const double turnStep = moveSeconds(kArcRecuoMm, straight, kShortMoveOverheadS) +
                            kFrontSettleS + moveSeconds(kArcAjusteMm, straight, kShortMoveOverheadS) +
                            kFrontSettleS + arcS + kTurnLogAndSettleS +
                            moveSeconds(kArcExitMm, straight, kLongMoveOverheadS - 0.05);
    return {straightStep, turnStep};
}

double worstCaseSeconds(int steps, double turnFraction, const StepTimes& times) noexcept {
    const double fraction = std::clamp(turnFraction, 0.0, 1.0);
    return steps * (fraction * times.turnStepS + (1.0 - fraction) * times.straightStepS);
}

}  // namespace micromouse::controller
