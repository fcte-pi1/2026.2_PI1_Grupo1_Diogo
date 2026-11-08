#pragma once

#include "adapters/BoardPins.hpp"
#include "domain/BridgeDrive.hpp"

namespace micromouse::adapters {

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
