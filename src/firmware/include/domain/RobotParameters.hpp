#pragma once

#include "domain/Maneuver.hpp"
#include "domain/Odometry.hpp"
#include "domain/WallCentering.hpp"
#include "domain/WheelStall.hpp"

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

// Os movimentos (perfil, controle de cada roda em volts, reta e curva) ficam em
// controller/RobotMotion.hpp: são parâmetros do controller, e o domain não depende dele.

// Roda parada na reta (04/11 e 07/11: "enc E=0 D=123 pot E=0.85"): depois de 120 pulsos (~45 mm)
// na roda mais rápida, a outra abaixo de 20% dela está parada. Rodas 25% diferentes ficam em 80%.
inline constexpr WheelStallConfig kWheelStall{120, 0.20};

// Centralização pelas paredes laterais (RF-44), só com a opção RATO_CENTRALIZAR_PAREDES do Kconfig
// (desligada por padrão). Ver docs/rf44-centralizacao.md:
// - centro de 33,6 mm: média dos ToF laterais com o robô centrado, medida em 07/11 (B1 do roteiro,
//   E=31 e D=36,5 mm, conferidos com régua); a estimativa de projeto era ~34-35 mm;
// - só a parede da própria célula (abaixo do limiar de 90 mm);
// - ganhos NÃO calibrados: o termo sai em pulsos equivalentes e o adaptador o converte em mm de
//   diferença entre as rodas (controller::StraightMove). 10 mm fora do centro = 2,5 pulsos (~0,9 mm);
//   termo máximo de 7,5 pulsos (~2,8 mm), pequeno perto da sincronia das rodas.
inline constexpr WallCenteringConfig kWallCentering{33.6, 90.0, 0.25, 7.5};

}  // namespace micromouse::domain::robot
