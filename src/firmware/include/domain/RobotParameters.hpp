#pragma once

#include "domain/Maneuver.hpp"
#include "domain/Odometry.hpp"

namespace micromouse::domain::robot {

// Medidas físicas do robô, tiradas dos testes de hardware (docs/7.3, itens 3.3 e da bitola):
// roda de 34 mm e 360 pulsos por volta do eixo de saída, o que dá 0,2967 mm por pulso e
// cerca de 607 pulsos por célula de 180 mm.
inline constexpr double kWheelDiameterMm = 34.0;
inline constexpr int kCountsPerRevolution = 360;
inline constexpr double kCellSizeMm = 180.0;
inline constexpr double kWheelTrackMm = 88.0;  // bitola medida (#394)

inline constexpr WheelConfig kWheels{kWheelDiameterMm, kCountsPerRevolution, kCellSizeMm};
inline constexpr TurnConfig kTurn{kWheelDiameterMm, kCountsPerRevolution, kWheelTrackMm};

}  // namespace micromouse::domain::robot
