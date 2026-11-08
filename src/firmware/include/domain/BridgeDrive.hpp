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

// Potência em [-1, 1] (sinal = sentido): PWM na entrada do sentido e a outra em 0. No tempo
// desligado do PWM o motor fica solto ("fast decay").
[[nodiscard]] BridgeDuty bridgeDuty(double command) noexcept;

}  // namespace micromouse::domain
