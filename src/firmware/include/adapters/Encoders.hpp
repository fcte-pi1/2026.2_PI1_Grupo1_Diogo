#pragma once

#include "adapters/BoardPins.hpp"
#include "driver/pulse_cnt.h"

namespace micromouse::adapters {

class Encoders {
private:
    pcnt_unit_handle_t leftUnit_{nullptr};
    pcnt_unit_handle_t rightUnit_{nullptr};
    bool invertLeft_{pins::kInvertLeftEncoder};

public:
    void begin();
    // Pulsos com sinal positivo para a frente, nos dois lados (o esquerdo já vem invertido).
    [[nodiscard]] long left() const;
    [[nodiscard]] long right() const;
    void reset();
    // Só para o firmware de diagnóstico: inverte o lado esquerdo até reiniciar.
    void setLeftInverted(bool inverted) { invertLeft_ = inverted; }
    [[nodiscard]] bool leftInverted() const { return invertLeft_; }
};

}  // namespace micromouse::adapters
