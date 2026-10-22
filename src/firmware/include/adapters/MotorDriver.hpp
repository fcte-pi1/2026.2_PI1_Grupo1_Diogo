#pragma once

namespace micromouse::adapters {

// Driver de baixo nível do DRV8833: velocidade de cada roda em [-1.0, 1.0]
// (sinal = sentido), gerando PWM nos 4 pinos via LEDC.
class MotorDriver {
private:
    void drive(int in1Channel, int in2Channel, double value);

public:
    void begin();
    void setNormalized(double left, double right);
    void brake();
};

}  // namespace micromouse::adapters
