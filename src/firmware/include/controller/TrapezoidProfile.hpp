#pragma once

namespace micromouse::controller {

// Limites de um movimento: velocidade de cruzeiro e aceleração (igual na partida e na frenagem).
// Unidades livres, desde que coerentes: mm, mm/s e mm/s² na reta; graus, °/s e °/s² na curva.
struct ProfileLimits {
    double maxSpeed;
    double acceleration;
};

// Trajetória trapezoidal de 0 até `distance`: acelera, anda em cruzeiro e freia até parar
// exatamente no fim. Se a distância for curta para chegar ao cruzeiro, o perfil vira triângulo.
// É ela que faz a partida suave (sem degrau de corrente) e a parada no centro da célula.
class TrapezoidProfile {
public:
    struct Sample {
        double position;
        double speed;
        bool finished;
    };

    // `distance` negativa ou limites inválidos viram um perfil vazio (já terminado em 0).
    TrapezoidProfile(double distance, const ProfileLimits& limits) noexcept;

    [[nodiscard]] Sample at(double timeSeconds) const noexcept;
    [[nodiscard]] double duration() const noexcept { return total_; }
    [[nodiscard]] double peakSpeed() const noexcept { return peak_; }

private:
    double distance_{0.0};
    double acceleration_{0.0};
    double peak_{0.0};
    double rampTime_{0.0};
    double cruiseTime_{0.0};
    double total_{0.0};
};

}  // namespace micromouse::controller
