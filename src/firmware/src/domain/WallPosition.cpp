#include "domain/WallPosition.hpp"

#include <algorithm>
#include <cmath>

#include "domain/RobotParameters.hpp"

namespace micromouse::domain {

WallFix wallPositionFix(const Calibration& calibration, int frontMm) noexcept {
    constexpr int kMaxCellsAhead = 2;
    WallFix best;
    double bestAbs = kWallFixAmbiguityMm + 1.0;
    for (int cells = 1; cells <= kMaxCellsAhead; ++cells) {
        const double expected = robot::kCorridorWidthMm / 2.0 + robot::kCellSizeMm * cells -
                                calibration.axleToFrontTofMm;
        const double error = static_cast<double>(frontMm) - expected;
        if (std::fabs(error) < bestAbs) {
            bestAbs = std::fabs(error);
            best.valid = bestAbs <= kWallFixAmbiguityMm;
            best.cellsAhead = cells;
            best.errorMm = error;
        }
    }
    if (!best.valid) {
        return WallFix{};
    }
    best.correctionMm = std::fabs(best.errorMm) < kWallFixNoiseMm
                            ? 0.0
                            : std::clamp(kWallFixGain * best.errorMm, -kWallFixMaxMm, kWallFixMaxMm);
    return best;
}

}  // namespace micromouse::domain
