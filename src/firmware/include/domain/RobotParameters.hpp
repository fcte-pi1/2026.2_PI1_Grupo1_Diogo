#pragma once

#include "domain/Maneuver.hpp"
#include "domain/Odometry.hpp"
#include "domain/Pid.hpp"
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

// Controle de reta (RF-43). O erro é a diferença ACUMULADA de pulsos (esquerda - direita) desde o
// começo da célula (os encoders são zerados a cada advanceCell), amostrada a cada 1 ms. 1 pulso de
// diferença = 0,375 mm de caminho a mais numa roda, ~0,24 grau de rumo com a bitola de 88 mm.
// Em 04/11, com {0.02, 0, 0.002}, o derivativo dava 2,0 a cada pulso que o erro mudava (0,002 / 1 ms)
// e o proporcional saturava com 15 pulsos: toda falha na pista terminou com uma roda em 0 e a outra
// em 0,85, o robô girando sobre uma roda até encostar na parede. Agora só proporcional e suave
// (20 pulsos, ~7,5 mm ou ~5 graus de rumo, dão a correção máxima), com a correção limitada: nenhuma
// roda cai abaixo de base - 0,20. Só com P sobra um erro constante na célula (correção / kp pulsos,
// ~7 com rodas 25% diferentes na simulação do host); como os encoders zeram a cada célula, esse resto
// vira desvio de rumo que se soma célula a célula até a centralização pelas paredes (RF-44) corrigir.
// kp 0,010 medido na pista em 07/11 (encoders já no lado certo): com 0,005 o robô encostava numa
// parede em 1 a 2 células; com 0,010 as rodas ficaram a 1-3 pulsos uma da outra, sem saturar, e a
// reta de 4 células saiu centrada. Falta a varredura completa com o log "reta" (D do roteiro).
inline constexpr PidGains kStraightGains{0.010, 0.0, 0.0};
inline constexpr double kStraightMaxCorrection = 0.20;

// Potências da reta (fração da tensão da bateria). Em 04/11, com 0,45 as rodas às vezes não venciam
// o atrito estático; 0,70 com a 2S cheia (8,4 V) dá ~5,9 V, dentro dos 6 V dos N20. O teto de 0,85
// limita a roda que a correção acelera.
inline constexpr double kStraightBaseSpeed = 0.70;
inline constexpr double kStraightMaxSpeed = 0.85;

// Roda parada na reta (04/11 e 07/11: "enc E=0 D=123 pot E=0.85"): depois de 120 pulsos (~45 mm)
// na roda mais rápida, a outra abaixo de 20% dela está parada. Rodas 25% diferentes ficam em 80%.
inline constexpr WheelStallConfig kWheelStall{120, 0.20};

// Centralização pelas paredes laterais (RF-44), só com a opção RATO_CENTRALIZAR_PAREDES do Kconfig
// (desligada por padrão). Ver docs/rf44-centralizacao.md:
// - centro de 33,6 mm: média dos ToF laterais com o robô centrado, medida em 07/11 (B1 do roteiro,
//   E=31 e D=36,5 mm, conferidos com régua); a estimativa de projeto era ~34-35 mm;
// - só a parede da própria célula (abaixo do limiar de 90 mm);
// - ganhos NÃO calibrados, definidos pelo efeito na potência (ganho x kp): 10 mm fora do centro =
//   2,5 pulsos = correção 0,025; termo máximo de 7,5 pulsos = 0,075, longe do limite de 0,20. Com o
//   kp 0,010 os pulsos são a metade dos de antes (0,5 e 15 com kp 0,005); se o kp mudar, eles mudam.
inline constexpr WallCenteringConfig kWallCentering{33.6, 90.0, 0.25, 7.5};

}  // namespace micromouse::domain::robot
