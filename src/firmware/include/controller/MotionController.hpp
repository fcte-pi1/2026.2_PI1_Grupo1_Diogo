#pragma once

#include <limits>

#include "domain/Pid.hpp"

namespace micromouse::controller {

using domain::Pid;
using domain::PidGains;

struct WheelSpeeds {
    double left{};
    double right{};
};

// O que o controle fez desde o último reset() (uma célula): para calibrar os ganhos na pista.
struct StraightStats {
    int steps{0};
    int saturatedSteps{0};        // correção no limite ou uma roda em 0 ou no teto
    double maxAbsError{0.0};      // maior |erro| (pulsos)
    double maxAbsCorrection{0.0};  // maior |correção| aplicada a uma roda
    double lastError{0.0};
};

class MotionController {
private:
    Pid pid_;
    double baseSpeed_;
    double maxSpeed_;
    double maxCorrection_;
    StraightStats stats_{};

public:
    // maxCorrection limita o quanto a correção tira de uma roda e dá à outra. Sem limite, um erro
    // grande zera uma roda e o robô gira sobre a outra em vez de seguir reto (teste de 04/11).
    MotionController(const domain::PidGains& gains, double baseSpeed, double maxSpeed,
                     double maxCorrection = std::numeric_limits<double>::infinity());
    [[nodiscard]] WheelSpeeds correct(double error, double deltaTimeSeconds);
    void reset() noexcept;  // zera o PID e as estatísticas
    [[nodiscard]] const StraightStats& stats() const noexcept { return stats_; }
};

}  // namespace micromouse::controller
