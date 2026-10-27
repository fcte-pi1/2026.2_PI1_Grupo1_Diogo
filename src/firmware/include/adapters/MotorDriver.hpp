#pragma once

#include "adapters/BoardPins.hpp"

namespace micromouse::adapters {

// Driver de baixo nível do DRV8833: velocidade de cada roda em [-1.0, 1.0]
// (sinal = sentido), gerando PWM nos 4 pinos via LEDC.
class MotorDriver {
private:
    bool invertLeft_{pins::kInvertLeftMotor};
    void drive(int in1Channel, int in2Channel, double value);

public:
    void begin();
    // Positivo = roda para a frente, nos dois lados (o esquerdo é invertido internamente).
    void setNormalized(double left, double right);
    void brake();
    // Só para o firmware de diagnóstico: inverte o lado esquerdo até reiniciar.
    void setLeftInverted(bool inverted) { invertLeft_ = inverted; }
    [[nodiscard]] bool leftInverted() const { return invertLeft_; }
};

}  // namespace micromouse::adapters
