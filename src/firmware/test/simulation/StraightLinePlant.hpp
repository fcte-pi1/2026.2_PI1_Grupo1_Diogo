#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>

#include "controller/MotionController.hpp"
#include "domain/RobotParameters.hpp"
#include "domain/SoftStart.hpp"

namespace micromouse::test {

// Planta simples de uma roda N20 com encoder, para simular o controle de reta no PC.
// Velocidade alvo = ganho * (potência - zona morta), em pulsos/s; a roda chega a ela com uma
// constante de tempo de primeira ordem. Os pulsos são inteiros, como no PCNT.
struct WheelModel {
    double gainPulsesPerSecond;  // pulsos/s por unidade de potência acima da zona morta
    double deadband;             // potência abaixo da qual a roda não gira (atrito estático)
    double timeConstantS{0.03};  // N20 com redução: dezenas de ms
    double speed{0.0};           // pulsos/s
    double position{0.0};        // pulsos (contínuo)

    void step(double command, double dt) {
        const double target = gainPulsesPerSecond * std::fmax(0.0, command - deadband);
        speed += (target - speed) * dt / timeConstantS;
        position += speed * dt;
    }
    [[nodiscard]] long count() const { return static_cast<long>(std::floor(position)); }
};

struct StraightRunStats {
    long finalError{0};          // pulsos (esquerda - direita) no fim
    long maxAbsError{0};
    double maxAbsCorrection{0};  // maior |correção| aplicada a uma roda
    int saturatedSteps{0};       // passos com a correção no limite ou uma roda no teto/zero
    int steps{0};
    long errorChangeLast100ms{0};  // quanto o erro andou nos últimos 100 ms (0 = rodas iguais)
};

// Anda `durationMs` com o laço do Drv8833MotionAdapter::advanceCell: erro = pulsos acumulados
// (esquerda - direita) desde o começo, passo de 1 ms, partida suave.
inline StraightRunStats simulateStraight(controller::MotionController& controller, WheelModel left,
                                         WheelModel right, int durationMs,
                                         double maxCorrection =
                                             domain::robot::kStraightMaxCorrection) {
    constexpr double kDt = 0.001;
    const double base = domain::robot::kStraightBaseSpeed;
    const double top = domain::robot::kStraightMaxSpeed;
    StraightRunStats stats;
    long errorAt = 0;
    controller.reset();
    for (int ms = 0; ms < durationMs; ++ms) {
        const long error = left.count() - right.count();
        const controller::WheelSpeeds speeds = controller.correct(static_cast<double>(error), kDt);
        // correção aplicada: o quanto uma roda saiu da base (a outra pode ter batido no teto)
        const double correction =
            std::fmax(std::fabs(speeds.left - base), std::fabs(speeds.right - base));
        stats.maxAbsCorrection = std::fmax(stats.maxAbsCorrection, correction);
        const bool clipped = speeds.left <= 0.0 || speeds.right <= 0.0 || speeds.left >= top ||
                             speeds.right >= top || correction >= maxCorrection - 1e-9;
        if (clipped) ++stats.saturatedSteps;
        const double ramp = domain::softStartFactor(static_cast<uint32_t>(ms));
        left.step(ramp * speeds.left, kDt);
        right.step(ramp * speeds.right, kDt);
        stats.maxAbsError = std::max(stats.maxAbsError, std::labs(error));
        if (ms == durationMs - 100) errorAt = error;
        ++stats.steps;
    }
    stats.finalError = left.count() - right.count();
    stats.errorChangeLast100ms = stats.finalError - errorAt;
    return stats;
}

}  // namespace micromouse::test
