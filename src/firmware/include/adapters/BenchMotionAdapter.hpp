#pragma once

#include "ports/MotionPort.hpp"

namespace micromouse::adapters {

// Movimento SIMULADO para o modo bancada (CONFIG_RATO_BANCADA): cada comando só
// espera um tempo fixo, sem motores nem encoders. Permite rodar uma corrida
// inteira numa placa solta para testar a telemetria até o painel.
class BenchMotionAdapter final : public ports::IMotionPort {
public:
    void begin() {}
    void advanceCell() override;
    void turnLeft() override;
    void turnRight() override;
    void turnAround() override;
};

}  // namespace micromouse::adapters
