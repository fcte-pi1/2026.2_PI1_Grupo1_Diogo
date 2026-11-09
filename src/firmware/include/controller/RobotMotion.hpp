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

// Teto da tensão no motor: a nominal do N20.
inline constexpr double kMotorMaxVolts = 6.0;
// Bateria usada se a leitura do INA219 não for plausível.
inline constexpr double kNominalBatteryVolts = 8.0;

// mm por pulso do encoder (34 mm x pi / 285 = 0,3748).
inline constexpr double kMmPerPulse =
    domain::robot::kWheelDiameterMm * 3.14159265358979323846 / domain::robot::kCountsPerRevolution;

// Controle de cada roda (WheelLoop). Valores iniciais, ajustados na simulação do host com motores
// de 6 V e zona morta diferente em cada roda (test/simulation/MotorPlant.hpp); conferir na pista:
// - feedforward: em 07/11, a 100% (~8 V) a roda suspensa fez ~3000 pulsos/s = ~1120 mm/s, ou
//   ~0,0071 V por mm/s sem carga; 0,0075 para o chão. Atrito estático de 1,0 V para sair do lugar;
// - P de 0,25 V por mm, I de 3,0 V por mm·s (no máximo 3 V) e D de 0,004 V por mm/s no erro de
//   velocidade. Com I menor (1,0), a roda "dura" da simulação (2,5 V para sair do lugar) parava a
//   3 mm do alvo; com 0,30/4,0 e 0,30/5,0 também passa, mas o robô real tem atraso e ruído: começar
//   pelo mais moderado.
inline constexpr WheelLoopGains kWheelLoop{0.0075, 1.0, 0.25, 3.0, 0.004, kMotorMaxVolts, 3.0};

// Reta de uma célula: 250 mm/s de cruzeiro e 1200 mm/s² (o perfil leva ~0,93 s por célula).
// A sincronia divide meia diferença entre as rodas para cada lado; a reta termina com as duas rodas
// a menos de 1,5 mm do alvo e abaixo de 15 mm/s, ou 0,3 s depois do fim do perfil.
inline constexpr StraightMoveConfig kStraightMove{{250.0, 1200.0}, kWheelLoop, 0.5, 1.5, 15.0, 0.3};

// Curva no lugar: 300 °/s de cruzeiro e 1500 °/s² (~0,5 s numa curva de 90°; nas rodas, ~230 mm/s).
// Termina 2° antes do alvo (o robô ainda gira um pouco com o freio). Se o perfil acabar sem o
// giroscópio chegar, continua a 60 °/s por até 45° a mais.
inline constexpr PivotMoveConfig kPivotMove{
    {300.0, 1500.0}, kWheelLoop, domain::robot::kWheelTrackMm, 0.5, 2.0, 60.0, 45.0};

}  // namespace micromouse::controller::robot
