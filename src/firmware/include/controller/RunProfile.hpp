#pragma once

#include "controller/TrapezoidProfile.hpp"

namespace micromouse::controller {

// Perfil de uma reta que pode mudar de alvo andando (20/11, reta contínua). Parte de um estado
// (posição, velocidade) e chega parado em `target`: acelera até o cruzeiro se houver espaço, anda e
// freia. Do repouso, é o mesmo trapézio de TrapezoidProfile.
// retarget() recomeça o perfil a partir do estado no instante dado: para encurtar (parar no centro da
// célula que está chegando, porque o caminho vira ali) ou alongar (o caminho continua reto). Recusa um
// alvo que exigiria frear mais forte que 1,5 x a aceleração.
class RunProfile {
public:
    using Sample = TrapezoidProfile::Sample;

    RunProfile(double distance, const ProfileLimits& limits) noexcept;

    [[nodiscard]] Sample at(double timeSeconds) const noexcept;
    [[nodiscard]] double duration() const noexcept { return start_ + total_; }
    [[nodiscard]] double target() const noexcept { return target_; }
    [[nodiscard]] bool retarget(double newTarget, double atTimeSeconds) noexcept;

    static constexpr double kMaxBrakeFactor = 1.5;

private:
    void plan(double fromPosition, double fromSpeed, double target) noexcept;

    ProfileLimits limits_;
    double start_{0.0};     // instante em que este segmento começa
    double p0_{0.0};        // posição e velocidade no início do segmento
    double v0_{0.0};
    double target_{0.0};
    double peak_{0.0};
    double accel_{0.0};     // aceleração da subida (até o pico)
    double decel_{0.0};     // desaceleração da descida
    double t1_{0.0};        // duração da subida
    double t2_{0.0};        // duração do cruzeiro
    double t3_{0.0};        // duração da frenagem
    double total_{0.0};
};

}  // namespace micromouse::controller
