#pragma once

#include "controller/TrapezoidProfile.hpp"
#include "controller/WheelLoop.hpp"

namespace micromouse::controller {

struct StraightMoveConfig {
    ProfileLimits limits;     // mm/s e mm/s²
    WheelLoopGains wheel;     // as duas rodas usam os mesmos ganhos; o I corrige a diferença
    double syncGain;          // 0..1: quanto da diferença entre as rodas vira correção de cada uma
    double settleToleranceMm; // no fim, as duas rodas a menos disto do alvo...
    double settleMmPerS;      // ...e mais devagar que isto: parou
    double maxSettleSeconds;  // depois do perfil, espera no máximo isto para assentar
    double maxMissMm;         // terminou pelo tempo com uma roda mais longe que isto do alvo: falhou
};

// Uma reta de `distanceMm` com as duas rodas seguindo o mesmo perfil trapezoidal.
// - Cada roda tem o seu WheelLoop: recebe a tensão de que precisa para acompanhar a trajetória.
// - Sincronia: a diferença de caminho entre as rodas (esquerda - direita, mais o termo das paredes
//   do RF-44 em mm) desloca as referências, a roda adiantada espera e a atrasada é puxada. Com
//   rodas iguais em caminho, o robô anda reto.
// - O perfil termina parado em `distanceMm`: o robô para no centro da célula seguinte, sem deslizar.
class StraightMove {
public:
    struct Output {
        double leftVolts;
        double rightVolts;
        bool done;
    };

    StraightMove(double distanceMm, const StraightMoveConfig& config) noexcept;

    // `offsetMm` positivo = robô mais perto da parede direita (domain::wallCenteringError em mm):
    // adianta a roda direita e o robô volta para a esquerda.
    [[nodiscard]] Output step(double dtSeconds, double leftMm, double rightMm, double leftMmPerS,
                              double rightMmPerS, double offsetMm = 0.0) noexcept;

    // False se a reta terminou pelo tempo de assentar com uma roda longe do alvo (roda travada,
    // robô preso numa parede): o robô NÃO chegou à célula seguinte.
    [[nodiscard]] bool reachedTarget() const noexcept { return reached_; }
    [[nodiscard]] double elapsed() const noexcept { return time_; }
    [[nodiscard]] double maxDifferenceMm() const noexcept { return maxDifference_; }
    [[nodiscard]] double lastDifferenceMm() const noexcept { return lastDifference_; }
    [[nodiscard]] double maxLeftVolts() const noexcept { return maxLeftVolts_; }
    [[nodiscard]] double maxRightVolts() const noexcept { return maxRightVolts_; }
    [[nodiscard]] int saturatedSteps() const noexcept { return saturated_; }
    [[nodiscard]] int steps() const noexcept { return steps_; }
    [[nodiscard]] double duration() const noexcept { return profile_.duration(); }

private:
    StraightMoveConfig config_;
    TrapezoidProfile profile_;
    WheelLoop left_;
    WheelLoop right_;
    double time_{0.0};
    double maxDifference_{0.0};
    double lastDifference_{0.0};
    double maxLeftVolts_{0.0};
    double maxRightVolts_{0.0};
    int saturated_{0};
    int steps_{0};
    bool reached_{true};
};

}  // namespace micromouse::controller
