#pragma once

#include "controller/RunProfile.hpp"
#include "controller/StraightMove.hpp"
#include "controller/WheelLoop.hpp"

namespace micromouse::controller {

// Trajetória de uma curva contínua (20/11): reta de aproximação, arco de `angleDeg` com raio `radiusMm` no eixo e reta de saída.
// No arco a roda de fora anda (R + T/2) x ângulo e a de dentro (R - T/2) x ângulo, com T = bitola efetiva.
struct PathPlan {
    double approachMm;
    double radiusMm;
    double angleDeg;
    bool right;
    double exitMm;
    double trackMm;

    struct Wheels {
        double leftMm;
        double rightMm;
        double leftFactor;   // velocidade da roda / velocidade do eixo
        double rightFactor;
        double headingDeg;   // + = esquerda
    };

    [[nodiscard]] double arcLengthMm() const noexcept;
    [[nodiscard]] double lengthMm() const noexcept { return approachMm + arcLengthMm() + exitMm; }
    // Posição de cada roda quando o eixo andou `axleMm` pela trajetória.
    [[nodiscard]] Wheels wheelsAt(double axleMm) const noexcept;
};

// Segue a trajetória com o perfil de velocidade do eixo (que pode começar em movimento, `startSpeed`) e o WheelLoop de cada
// roda; a sincronia corrige a diferença entre as rodas em relação à PLANEJADA (no arco ela não é zero).
class PathMove {
public:
    struct Output {
        double leftVolts;
        double rightVolts;
        bool done;
    };

    // `maxSpeedMmPerS` > 0 limita a velocidade da trajetória (entrando mais rápido, freia até ela).
    PathMove(const PathPlan& plan, const StraightMoveConfig& config, double startSpeedMmPerS = 0.0,
             double maxSpeedMmPerS = 0.0) noexcept;

    // Posições relativas ao início da trajetória. `steerMm` > 0 vira mais para a esquerda (a roda direita adianta
    // steer/2 e a esquerda atrasa steer/2): é por onde entra a correção do rumo pelo giroscópio.
    [[nodiscard]] Output step(double dtSeconds, double leftMm, double rightMm, double leftMmPerS,
                              double rightMmPerS, double steerMm = 0.0) noexcept;
    // Rumo planejado (graus, + = esquerda) para o eixo em `axleMm` da trajetória.
    [[nodiscard]] double plannedHeadingDeg(double axleMm) const noexcept { return plan_.wheelsAt(axleMm).headingDeg; }
    [[nodiscard]] bool reachedTarget() const noexcept { return reached_; }
    [[nodiscard]] double elapsed() const noexcept { return time_; }
    [[nodiscard]] double duration() const noexcept { return profile_.duration(); }
    [[nodiscard]] const PathPlan& plan() const noexcept { return plan_; }

private:
    PathPlan plan_;
    StraightMoveConfig config_;
    RunProfile profile_;
    WheelLoop left_;
    WheelLoop right_;
    double time_{0.0};
    bool reached_{true};
};

}  // namespace micromouse::controller
