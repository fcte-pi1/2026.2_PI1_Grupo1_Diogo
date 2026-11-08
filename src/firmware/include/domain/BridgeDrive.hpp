#pragma once

namespace micromouse::domain {

// Uma ponte H do DRV8833: fração do ciclo do PWM em cada entrada (0 = sempre baixo, 1 = sempre
// alto). Tabela do DRV8833: IN1 = 1 e IN2 = 0 gira para a frente, o contrário para trás, as duas
// em 0 deixam o motor solto (roda livre) e as duas em 1 curto-circuitam o motor (freio).
struct BridgeDuty {
    double in1{0.0};
    double in2{0.0};
};

// Freio: as duas entradas em nível alto. O motor parado em curto segura a roda.
inline constexpr BridgeDuty kBridgeBrake{1.0, 1.0};

// O que o motor faz no tempo desligado do PWM:
// - Fast: fica solto (PWM na entrada do sentido, a outra em 0). Com a corrente do motor contínua,
//   a tensão média é ~(2 x potência - 1) x bateria: perto de 0,5 quase nada chega ao motor, o que
//   bate com as rodas que não arrancam com 0,45-0,51 (04/11 e 07/11);
// - Slow: fica freado (entrada do sentido em 1, a outra com o PWM do freio). A velocidade fica
//   proporcional à potência, e a mesma potência dá mais força que no fast.
enum class DecayMode { Fast, Slow };

// Potência em [-1, 1] (sinal = sentido) para as duas entradas da ponte.
[[nodiscard]] BridgeDuty bridgeDuty(double command, DecayMode mode = DecayMode::Fast) noexcept;

}  // namespace micromouse::domain
