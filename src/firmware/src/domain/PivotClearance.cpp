#include "domain/PivotClearance.hpp"

#include <algorithm>
#include <array>
#include <cmath>

#include "domain/RobotParameters.hpp"

namespace micromouse::domain {
namespace {

constexpr double kHalfCorridorMm = robot::kCorridorWidthMm / 2.0;
constexpr double kStepMm = 0.5;  // passo da busca da faixa de posições
constexpr double kAngleStepDeg = 0.5;
constexpr double kPi = 3.14159265358979323846;

struct Rectangle {
    double x0, x1, y0, y1;
};

// A coordenada de um ponto do retângulo girado é linear no ponto, então o máximo contra uma parede
// reta sempre ocorre num dos 4 vértices.
template <typename Visit>
void forEachCorner(const Rectangle& r, Visit&& visit) {
    visit(r.x0, r.y0);
    visit(r.x0, r.y1);
    visit(r.x1, r.y0);
    visit(r.x1, r.y1);
}

}  // namespace

double pivotWallIntrusionMm(const Calibration& calibration, double axleAheadOfCenterMm,
                            bool turnLeft, const CellWalls& walls) noexcept {
    // Corpo (retângulo do chassi) e as duas rodas, com o eixo na origem.
    const double half = calibration.frontWidthMm / 2.0;
    const double front = std::max(calibration.axleToFrontMm, calibration.axleToFrontTofMm);
    const double wheelOuter = calibration.widthWithWheelsMm / 2.0;
    const double wheelInner = wheelOuter - robot::kWheelWidthMm;
    const double wheelHalfLength = robot::kWheelDiameterMm / 2.0;
    const std::array<Rectangle, 3> parts{{
        {-robot::kAxleToRearMm, front, -half, half},
        {-wheelHalfLength, wheelHalfLength, wheelInner, wheelOuter},
        {-wheelHalfLength, wheelHalfLength, -wheelOuter, -wheelInner},
    }};

    double worst = 0.0;
    for (double deg = 0.0; deg <= 90.0 + 1e-9; deg += kAngleStepDeg) {
        const double angle = (turnLeft ? deg : -deg) * kPi / 180.0;
        const double c = std::cos(angle);
        const double s = std::sin(angle);
        for (const Rectangle& part : parts) {
            forEachCorner(part, [&](double px, double py) {
                const double x = axleAheadOfCenterMm + px * c - py * s;
                const double y = px * s + py * c;
                if (walls.front) worst = std::max(worst, x - kHalfCorridorMm);
                if (walls.back) worst = std::max(worst, -x - kHalfCorridorMm);
                if (walls.left) worst = std::max(worst, y - kHalfCorridorMm);
                if (walls.right) worst = std::max(worst, -y - kHalfCorridorMm);
            });
        }
    }
    return worst;
}

bool pivotInPlaceClears(const Calibration& calibration, double axleAheadOfCenterMm, bool turnLeft,
                        const CellWalls& walls, double marginMm) noexcept {
    return pivotWallIntrusionMm(calibration, axleAheadOfCenterMm, turnLeft, walls) <= -marginMm;
}

PivotBand pivotInPlaceBand(const Calibration& calibration, bool turnLeft, const CellWalls& walls,
                           double marginMm) noexcept {
    PivotBand band;
    for (double axle = -kHalfCorridorMm; axle <= kHalfCorridorMm + 1e-9; axle += kStepMm) {
        if (!pivotInPlaceClears(calibration, axle, turnLeft, walls, marginMm)) {
            continue;
        }
        if (!band.found) {
            band.found = true;
            band.minMm = axle;
        }
        band.maxMm = axle;
    }
    return band;
}

std::optional<double> pivotInPlaceTargetMm(const Calibration& calibration, bool turnLeft,
                                           const CellWalls& walls, double marginMm) noexcept {
    const PivotBand band = pivotInPlaceBand(calibration, turnLeft, walls, marginMm);
    if (!band.found) {
        return std::nullopt;
    }
    return (band.minMm + band.maxMm) / 2.0;
}

PivotPlan planPivotInPlace(const Calibration& calibration, bool turnLeft, const CellWalls& walls,
                           double axleAheadOfCenterMm) noexcept {
    const PivotBand band = pivotInPlaceBand(calibration, turnLeft, walls, 0.0);
    PivotPlan plan;
    if (!band.found) {
        return plan;  // DoesNotFit
    }
    if (axleAheadOfCenterMm >= band.minMm && axleAheadOfCenterMm <= band.maxMm) {
        plan.action = PivotAction::PivotNow;
        plan.targetMm = axleAheadOfCenterMm;
        return plan;
    }
    constexpr double kNarrowBandMm = 20.0;
    constexpr double kEdgeInsetMm = 5.0;
    plan.action = PivotAction::MoveThenPivot;
    plan.targetMm = (band.maxMm - band.minMm <= kNarrowBandMm)
                        ? (band.minMm + band.maxMm) / 2.0
                        : std::clamp(axleAheadOfCenterMm, band.minMm + kEdgeInsetMm,
                                     band.maxMm - kEdgeInsetMm);
    plan.moveMm = plan.targetMm - axleAheadOfCenterMm;
    return plan;
}

}  // namespace micromouse::domain
