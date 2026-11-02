#pragma once

#include "domain/Maneuver.hpp"
#include "domain/Odometry.hpp"

namespace micromouse::domain::robot {

// Parâmetros físicos do robô. Só os 360 pulsos por volta do eixo de saída foram medidos (docs/7.3,
// item 3.3). A roda de 34 mm e a bitola de 88 mm são valores de projeto e ainda precisam ser
// medidos com paquímetro (#394). Com eles, dá 0,2967 mm por pulso e cerca de 607 pulsos por
// célula de 180 mm.
inline constexpr double kWheelDiameterMm = 34.0;  // valor de projeto, a medir (#394)
inline constexpr int kCountsPerRevolution = 360;  // medido no 7.3; o PCNT conta em 2x (ver enc)
inline constexpr double kCellSizeMm = 180.0;
inline constexpr double kWheelTrackMm = 88.0;  // bitola: valor de projeto, a medir (#394)

inline constexpr WheelConfig kWheels{kWheelDiameterMm, kCountsPerRevolution, kCellSizeMm};
inline constexpr TurnConfig kTurn{kWheelDiameterMm, kCountsPerRevolution, kWheelTrackMm};

}  // namespace micromouse::domain::robot
