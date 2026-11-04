#pragma once

#include "domain/Maneuver.hpp"
#include "domain/Odometry.hpp"

namespace micromouse::domain::robot {

// Parâmetros físicos do robô. Os pulsos por volta foram medidos em 04/11 com o firmware de
// diagnóstico (girando cada roda à mão, contagem 2x do PCNT): esquerda 284 e direita 286 por volta,
// na média de 5 voltas. O "360" do docs/7.3 não se confirmou. A roda de 34 mm e a bitola de 88 mm
// são valores de projeto e ainda precisam ser medidos com paquímetro (#394). Com eles, dá
// 0,3748 mm por pulso e cerca de 481 pulsos por célula de 180 mm.
inline constexpr double kWheelDiameterMm = 34.0;  // valor de projeto, a medir (#394)
inline constexpr int kCountsPerRevolution = 285;  // medido em 04/11 (esq 284, dir 286), 2x
inline constexpr double kCellSizeMm = 180.0;
inline constexpr double kWheelTrackMm = 88.0;  // bitola: valor de projeto, a medir (#394)

inline constexpr WheelConfig kWheels{kWheelDiameterMm, kCountsPerRevolution, kCellSizeMm};
inline constexpr TurnConfig kTurn{kWheelDiameterMm, kCountsPerRevolution, kWheelTrackMm};

}  // namespace micromouse::domain::robot
