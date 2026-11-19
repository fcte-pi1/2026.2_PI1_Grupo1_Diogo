#pragma once

#include "domain/Maneuver.hpp"
#include "domain/Odometry.hpp"
#include "domain/WallCentering.hpp"
#include "domain/WheelStall.hpp"

namespace micromouse::domain::robot {

// Parâmetros físicos do robô. Os pulsos por volta foram medidos em 04/11 com o firmware de
// diagnóstico (girando cada roda à mão, contagem 2x do PCNT): esquerda 284 e direita 286 por volta,
// na média de 5 voltas. O "360" do docs/7.3 não se confirmou. A roda foi medida em 11/11: 32 mm (o
// projeto dizia 34, e o robô andava ~6% a mais do que contava). A bitola de 88 mm ainda é valor de
// projeto (#394). Com eles, dá 0,3527 mm por pulso e cerca de 511 pulsos por célula de 180 mm.
inline constexpr double kWheelDiameterMm = 32.0;  // medido em 11/11 (era 34, de projeto)
inline constexpr double kWheelWidthMm = 20.2;     // CAD (M7): largura do pneu
inline constexpr int kCountsPerRevolution = 285;  // medido em 04/11 (esq 284, dir 286), 2x
inline constexpr double kCellSizeMm = 180.0;
inline constexpr double kWheelTrackMm = 88.0;  // bitola: valor de projeto, a medir (#394)

// Corpo do robô, a partir do MEIO DO EIXO das rodas. *** A MEDIR COM PAQUÍMETRO (10/11) ***: os
// três valores são estimativas (chassi de projeto de 124,5 x 100 mm, docs/4.1, e a foto de cima).
// Deles sai onde a curva em arco começa (controller::robot::kArcStartFrontMm): 1 mm de erro aqui é
// ~1 mm a menos de folga entre a quina do robô e a parede.
//
// 19/11: largura da frente = 101 (faces dos ToF laterais, CAD), metade 50,5. A frente fica no padrão
// de CAMPO (87 do eixo até o chassi, 85 até a face do ToF; A2: parede-eixo 127 menos F=42) até a medida
// de paquímetro: o CAD diz 107,25 / 107,75 e o .3mf impresso 102,25 (preset_cad do `calib`).
inline constexpr BodyGeometry kBody{
    87.0,  // axleToFrontMm: do centro do eixo até o ponto mais à frente do chassi
    50.5,  // halfWidthMm: metade da largura do chassi na parte da frente
    85.0,  // axleToFrontTofMm: do centro do eixo até a face do ToF frontal
};

// Do CAD (assembly.step, 19/11), origem na traseira do chassi, eixo das rodas em x = 17,25 mm.
inline constexpr double kAxleToRearMm = 17.25;        // eixo até a traseira
inline constexpr double kCadAxleToFrontMm = 107.25;   // eixo até a frente do chassi
inline constexpr double kCadAxleToFrontTofMm = 107.75;  // eixo até a face do ToF frontal
inline constexpr double kCorridorWidthMm = 168.0;     // corredor livre (célula 180 menos parede 12)
inline constexpr double kRobotLimitMm = 165.0;        // limite do robô em cada dimensão
// Folga entre o campo e o CAD acima da qual o boot avisa (os dois não podem estar certos).
inline constexpr double kBodyConflictMm = 10.0;
// A faixa em que a curva com uma roda cabe tem de ter ao menos o dobro disto (folga em cada ponta,
// para o erro de odometria do recuo: ~4-5 mm no arco em 16/11). PROPOSTA A CONFIRMAR.
inline constexpr double kOneWheelStartMarginMm = 5.0;

inline constexpr WheelConfig kWheels{kWheelDiameterMm, kCountsPerRevolution, kCellSizeMm};
inline constexpr TurnConfig kTurn{kWheelDiameterMm, kCountsPerRevolution, kWheelTrackMm};

// Os movimentos (perfil, controle de cada roda em volts, reta e curva) ficam em
// controller/RobotMotion.hpp: são parâmetros do controller, e o domain não depende dele.

// Roda parada na reta (04/11 e 07/11: "enc E=0 D=123 pot E=0.85"): depois de 120 pulsos (~45 mm)
// na roda mais rápida, a outra abaixo de 20% dela está parada. Rodas 25% diferentes ficam em 80%.
inline constexpr WheelStallConfig kWheelStall{120, 0.20};

// Centralização pelas paredes laterais (RF-44), com a opção RATO_CENTRALIZAR_PAREDES do Kconfig.
// Ver docs/rf44-centralizacao.md:
// - centro de 33,6 mm: média dos ToF laterais com o robô centrado, medida em 07/11 (B1 do roteiro,
//   E=31 e D=36,5 mm, conferidos com régua); a estimativa de projeto era ~34-35 mm;
// - 09/11: só paredes a menos de 70 mm (a da própria célula; antes 90) e ganho maior. O termo sai
//   em pulsos e o adaptador o converte em mm de diferença entre as rodas (controller::StraightMove):
//   10 mm fora do centro = 8 pulsos (~3 mm, ~2 graus de rumo); no máximo 16 pulsos (~6 mm). Com o
//   ganho antigo (0,25 pulso/mm, ~0,9 mm por 10 mm) o robô saía de A4 encostado na parede.
inline constexpr WallCenteringConfig kWallCentering{33.6, 70.0, 0.8, 16.0};
// Estimativa de pose lateral (19/11): acima deste rumo ela desliga e a reta fica só com os encoders e
// o giroscópio. PROPOSTA A CONFIRMAR: as retas boas de 16/11 giraram até 2,1 graus (log_robo.txt) e a
// reta falha com "rumo perdido" a 10; 5 fica no meio.
inline constexpr double kLateralPoseMaxHeadingDeg = 5.0;

}  // namespace micromouse::domain::robot
