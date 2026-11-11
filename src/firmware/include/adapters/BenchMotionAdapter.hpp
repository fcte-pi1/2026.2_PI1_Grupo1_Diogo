#pragma once

#include <cstddef>

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
    void reverseCell() override;
    // O movimento simulado sempre termina.
    [[nodiscard]] bool lastMoveOk() const noexcept { return true; }
    [[nodiscard]] const char* lastMoveName() const noexcept { return "movimento simulado"; }
    [[nodiscard]] const char* lastMoveFailure() const noexcept { return ""; }
    void describeLastMove(char* out, size_t size) const {
        if (size > 0) out[0] = '\0';
    }
};

}  // namespace micromouse::adapters
