#pragma once

#include "controller/PivotMove.hpp"
#include "controller/StraightMove.hpp"
#include "domain/RobotParameters.hpp"

namespace micromouse::controller::robot {

// Parâmetros dos movimentos do robô (controle em volts no motor, 09/11).
//
// Por que volts: até 09/11 cada roda recebia uma fração fixa do PWM (0,70 na reta, 0,75 -> 0,65 na
// curva). Em fast decay a tensão média no motor é ~(2 x fração - 1) x bateria: ~3,2 V na reta e
// ~2,4 V no fim da curva, num N20 de 6 V. Medido em 07/11 com a roda suspensa: a 71% de PWM a roda
// girava a 38-41% da velocidade de 100%, como prevê o fast decay (41%), e a ~51% não saía do lugar.
// Agora o controle pede tensão, e domain::commandForVolts a converte pela bateria lida no INA219.

// Teto da tensão no motor. A nominal do N20 é 6 V, mas em 09/11, no chão, a roda esquerda não saiu do
// lugar com 6 V (nem em slow nem em fast decay) e só andou com a bateria inteira (~7,8 V, PWM 100% no
// firmware de teste do hardware); suspensas, as duas rodas giram iguais (1% de diferença). O lado
// esquerdo tem mais atrito com o peso do robô. O controle só chega perto do teto quando a roda não
// acompanha a trajetória (partida, roda mais dura), e as manobras duram menos de 1,5 s.
inline constexpr double kMotorMaxVolts = 7.5;
// Bateria usada se a leitura do INA219 não for plausível.
inline constexpr double kNominalBatteryVolts = 8.0;

// mm por pulso do encoder (34 mm x pi / 285 = 0,3748).
inline constexpr double kMmPerPulse =
    domain::robot::kWheelDiameterMm * 3.14159265358979323846 / domain::robot::kCountsPerRevolution;

// Controle de cada roda (WheelLoop). Valores iniciais, ajustados na simulação do host com motores
// de 6 V e zona morta diferente em cada roda (test/simulation/MotorPlant.hpp); conferir na pista:
// - feedforward: em 07/11, a 100% (~8 V) a roda suspensa fez ~3000 pulsos/s = ~1120 mm/s, ou
//   ~0,0071 V por mm/s sem carga; 0,0075 para o chão. Empurrão do atrito estático de 2,5 V para sair
//   do lugar (1,0 V não tirava a roda esquerda do lugar no chão em 09/11);
// - P de 0,25 V por mm, I de 3,0 V por mm·s (no máximo 3 V) e D de 0,004 V por mm/s no erro de
//   velocidade. Com I menor (1,0), a roda "dura" da simulação (2,5 V para sair do lugar) parava a
//   3 mm do alvo; com 0,30/4,0 e 0,30/5,0 também passa, mas o robô real tem atraso e ruído: começar
//   pelo mais moderado.
inline constexpr WheelLoopGains kWheelLoop{0.0075, 2.5, 0.25, 3.0, 0.004, kMotorMaxVolts, 3.0};

// Reta de uma célula: 200 mm/s de cruzeiro e 600 mm/s² (o perfil leva ~1,23 s por célula). Em 09/11,
// com 250 mm/s e 1200 mm/s², até a roda boa ficava atrás da trajetória com 6 V no chão. A sincronia
// divide meia diferença entre as rodas para cada lado; a reta termina com as duas rodas a menos de
// 1,5 mm do alvo e abaixo de 15 mm/s, ou 0,3 s depois do fim do perfil. Nesse caso, uma roda a mais
// de 10 mm do alvo é falha ("nao chegou ao fim da celula").
inline constexpr StraightMoveConfig kStraightMove{
    {200.0, 600.0}, kWheelLoop, 0.5, 1.5, 15.0, 0.3, 10.0};

// Curva no lugar: 300 °/s de cruzeiro e 1500 °/s² (~0,5 s numa curva de 90°; nas rodas, ~230 mm/s).
// Termina 2° antes do alvo (o robô ainda gira um pouco com o freio). Se o perfil acabar sem o
// giroscópio chegar, continua a 60 °/s por até 45° a mais.
inline constexpr PivotMoveConfig kPivotMove{
    {300.0, 1500.0}, kWheelLoop, domain::robot::kWheelTrackMm, 0.5, 2.0, 60.0, 45.0};

// Curva de 90° em ARCO (09/11). Girando no lugar, o robô (rodas na traseira, frente longa) batia
// no canto A4 da pista em 7 de 7 corridas: travava a 68-75° ou saía colado na parede. Agora:
//   1. recua kArcSetbackMm até a borda de entrada da célula (o lado por onde chegou, sempre aberto);
//   2. faz um quarto de círculo de raio kArcSetbackMm em volta do canto entre a entrada e a saída
//      (as duas rodas para a frente: a de dentro em 90 - 44 = 46 mm, a de fora em 134 mm);
//   3. recua de novo kArcSetbackMm, até o centro da mesma célula, já virado.
// Para o Navigator nada muda: depois da curva o robô está na mesma célula, na nova direção. A frente
// longa vai sempre para o lado aberto, e o canto mais próximo fica a ~40 mm da lateral de dentro.
// 120 °/s e 600 °/s²: a roda de fora chega a ~280 mm/s.
inline constexpr double kArcSetbackMm = domain::robot::kCellSizeMm / 2.0;

// Parada pela parede da frente (09/11). As rodas ficam na traseira e a frente passa de meia célula:
// com o eixo no centro de uma célula com parede à frente, a frente já estaria dentro da parede (o
// robô bateu em A2 e chegava a A4 empurrando a borda). Na reta, se o ToF frontal mede menos que
// isto (a leitura com o robô centrado no B1 de 07/11 foi 37-52 mm), o robô para ali mesmo, sem
// completar a célula; o que faltou é descontado do recuo da curva seguinte. Só depois de andar
// metade da reta, para não parar por uma leitura da célula de trás.
inline constexpr double kFrontStopMm = 45.0;
inline constexpr PivotMoveConfig kArcTurn{{120.0, 600.0}, kWheelLoop, domain::robot::kWheelTrackMm,
                                          0.5, 2.0, 40.0, 30.0, kArcSetbackMm};

}  // namespace micromouse::controller::robot
