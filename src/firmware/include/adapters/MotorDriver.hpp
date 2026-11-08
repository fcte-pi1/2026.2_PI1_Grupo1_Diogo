#pragma once

#include "adapters/BoardPins.hpp"
#include "domain/BridgeDrive.hpp"
#include "sdkconfig.h"

namespace micromouse::adapters {

// Modo do PWM (domain/BridgeDrive): fast decay por padrão, slow com a opção RATO_SLOW_DECAY.
#if CONFIG_RATO_SLOW_DECAY
inline constexpr domain::DecayMode kMotorDecay = domain::DecayMode::Slow;
inline constexpr const char* kMotorDecayName = "slow decay (RATO_SLOW_DECAY)";
#else
inline constexpr domain::DecayMode kMotorDecay = domain::DecayMode::Fast;
inline constexpr const char* kMotorDecayName = "fast decay (padrao)";
#endif

// Driver de baixo nível do DRV8833: velocidade de cada roda em [-1.0, 1.0]
// (sinal = sentido), gerando PWM nos 4 pinos via LEDC (domain/BridgeDrive).
class MotorDriver {
private:
    bool invertLeft_{pins::kInvertLeftMotor};
    void apply(int in1Channel, int in2Channel, const domain::BridgeDuty& duty);

public:
    void begin();
    // Positivo = roda para a frente, nos dois lados (o esquerdo é invertido internamente).
    void setNormalized(double left, double right);
    void brake();  // freio ativo: as duas entradas de cada ponte em nível alto
    // Só para o firmware de diagnóstico: inverte o lado esquerdo até reiniciar.
    void setLeftInverted(bool inverted) { invertLeft_ = inverted; }
    [[nodiscard]] bool leftInverted() const { return invertLeft_; }
};

}  // namespace micromouse::adapters
