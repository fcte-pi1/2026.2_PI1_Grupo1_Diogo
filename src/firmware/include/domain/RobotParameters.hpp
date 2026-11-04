#pragma once

#include "domain/Maneuver.hpp"
#include "domain/Odometry.hpp"
#include "domain/Pid.hpp"

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

// Controle de reta: o erro é a diferença de pulsos entre as rodas (esquerda - direita), lida a cada
// 1 ms. Em 04/11, com {0.02, 0, 0.002}, o derivativo dava 2,0 por 1 pulso de diferença (0,002 / 1 ms)
// e o proporcional saturava com 15 pulsos: toda falha na pista terminou com uma roda em 0 e a outra
// em 0,85, o robô girando sobre uma roda até encostar na parede. Agora só proporcional e suave
// (40 pulsos, ~15 mm de diferença, dão a correção máxima), com a correção limitada: nenhuma roda
// cai abaixo de base - 0,20.
inline constexpr PidGains kStraightGains{0.005, 0.0, 0.0};
inline constexpr double kStraightMaxCorrection = 0.20;

}  // namespace micromouse::domain::robot
