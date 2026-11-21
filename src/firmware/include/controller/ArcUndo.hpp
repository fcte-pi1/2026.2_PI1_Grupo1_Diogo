#pragma once

#include "domain/Maneuver.hpp"

namespace micromouse::controller {

// Desfazer de um arco travado (16/11): volta de ré pelo mesmo arco, a roda de fora mais forte que a
// de dentro, até o giroscópio marcar ~0. Tensões fixas, sem perfil (os encoders não servem: as rodas
// patinaram). Acompanha o PROGRESSO medido pelo giroscópio: se ele não anda (robô preso ou
// segurado, rodas patinando), termina com NoProgress em vez de girar as rodas até o tempo limite.
// Tensões e tempo do desfazer, ajustáveis pelo `calib` (desfazer_*); os padrões são os de RobotMotion.hpp.
struct ArcUndoConfig {
    double outerVolts;
    double innerVolts;
    double timeoutS;
};

class ArcUndo {
public:
    enum class State {
        Running,
        Done,        // voltou a ~0 (ou passou para o outro lado)
        NoProgress,  // o giro não andou: robô preso, segurado ou rodas patinando
        WrongWay,    // o ângulo se AFASTOU do zero (robô calçado nas paredes): para na hora
        Timeout,     // andou, mas não chegou a tempo
    };
    struct Output {
        double leftVolts;
        double rightVolts;
        State state;
    };

    // `startAngleDeg`: ângulo do giroscópio onde o arco travou (negativo = arco à direita).
    ArcUndo(double startAngleDeg, bool rightArc, const ArcUndoConfig& config) noexcept;
    ArcUndo(double startAngleDeg, bool rightArc) noexcept;  // com os padrões de RobotMotion.hpp

    // Chamar a cada volta com o dt e a taxa do giroscópio (graus/s, já corrigida).
    [[nodiscard]] Output step(double dtSeconds, double gyroDegPerS) noexcept;

    [[nodiscard]] double angle() const noexcept { return angle_; }
    [[nodiscard]] double elapsed() const noexcept { return time_; }

private:
    ArcUndoConfig config_;
    double startAngle_;
    bool rightArc_;
    double angle_;
    double time_{0.0};
    domain::TurnStallDetector progress_;
};

}  // namespace micromouse::controller
