#pragma once

#include <algorithm>

#include "domain/Calibration.hpp"
#include "domain/RobotParameters.hpp"

namespace micromouse::domain::robot {

// Pegada do robô com as medidas em uso (Calibration), a partir do CAD de 19/11. Comprimento: da
// traseira à frente mais a margem de cabos; largura: a maior entre a frente e as rodas.
[[nodiscard]] constexpr double footprintLengthMm(const Calibration& c) noexcept {
    return kAxleToRearMm + std::max(c.axleToFrontMm, c.axleToFrontTofMm) + c.cableAheadMm;
}

[[nodiscard]] constexpr double footprintWidthMm(const Calibration& c) noexcept {
    return std::max(c.widthWithWheelsMm, c.frontWidthMm);
}

// Folga de cada lado no corredor livre de 168 mm (30 mm por lado com as rodas, 108 mm).
[[nodiscard]] constexpr double lateralClearanceMm(const Calibration& c) noexcept {
    return (c.corridorWidthMm - footprintWidthMm(c)) / 2.0;
}

// Configuração da estimativa de pose lateral com as medidas em uso: leitura nominal = meio corredor
// (84) menos o ToF até o centro (50,5) = 33,5 mm, e o ToF 59,15 mm à frente do eixo.
[[nodiscard]] constexpr LateralPoseConfig lateralPoseConfig(const Calibration& c) noexcept {
    return {c.corridorWidthMm / 2.0 - c.sideTofToCenterMm, kWallCentering.useBelowMm,
            c.sideTofAheadOfAxleMm, c.lateralMaxHeadingDeg};
}

// Termo da parede com o corredor e o ganho em uso (`largura_corredor`, `ganho_parede`, `max_parede`).
[[nodiscard]] constexpr WallCenteringConfig wallCenteringConfig(const Calibration& c) noexcept {
    return {c.corridorWidthMm / 2.0 - c.sideTofToCenterMm, kWallCentering.useBelowMm, c.wallGainPulsesPerMm,
            c.wallMaxPulses};
}

// Os padrões e o preset do CAD cabem no limite de 165 x 165 e no corredor.
static_assert(footprintLengthMm(Calibration{}) <= kRobotLimitMm);
static_assert(footprintWidthMm(Calibration{}) <= kRobotLimitMm);
static_assert(lateralClearanceMm(Calibration{}) > 0.0);

}  // namespace micromouse::domain::robot
