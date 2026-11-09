#pragma once

#include "controller/TrapezoidProfile.hpp"
#include "controller/WheelLoop.hpp"

namespace micromouse::controller {

struct PivotMoveConfig {
    ProfileLimits limits;   // °/s e °/s² do giro do robô
    WheelLoopGains wheel;
    double wheelTrackMm;    // bitola: cada roda anda bitola x pi / 360 mm por grau
    double syncGain;        // 0..1, como na reta: as duas rodas andam o mesmo arco
    double toleranceDeg;    // termina com |giro| >= alvo - tolerância (o freio ainda gira um pouco)
    double creepDegPerS;    // perfil acabou e o giroscópio ainda não chegou: continua a esta taxa
    double maxCreepDeg;     // ...no máximo até alvo + isto (depois, quem para é o tempo limite)
    // Raio da curva, do centro do arco ao meio do eixo. 0 = no lugar (uma roda para a frente e a
    // outra para trás). Com raio >= meia bitola, as duas rodas andam para a frente: a de dentro em
    // raio - bitola/2 e a de fora em raio + bitola/2.
    double turnRadiusMm{0.0};
};

// Curva no lugar (pivô, raio 0) ou em arco (raio > 0). As rodas seguem um perfil trapezoidal de
// ÂNGULO, convertido no arco de cada roda pelo raio e pela bitola, com o mesmo controle por roda da
// reta: elas recebem a tensão de que precisam para girar
// no chão (em 07/11, a potência fixa de 0,60 não girava o robô). Quem decide o FIM é o giroscópio:
// - chegou ao alvo antes do fim do perfil (girou mais que o previsto pelos encoders): para já;
// - o perfil acabou e o giroscópio não chegou (rodas patinando): continua devagar até chegar.
// Suspenso, o robô não gira: a curva não termina e o tempo limite do adaptador leva ao Erro.
class PivotMove {
public:
    enum class Direction { Left, Right };
    struct Output {
        double leftVolts;
        double rightVolts;
        bool done;
    };

    PivotMove(double targetDeg, Direction direction, const PivotMoveConfig& config) noexcept;

    [[nodiscard]] Output step(double dtSeconds, double gyroDegPerS, double leftMm, double rightMm,
                              double leftMmPerS, double rightMmPerS) noexcept;
    // Só integra o giroscópio (rodas já freadas): mede quanto o robô ainda gira depois do freio.
    void settle(double gyroDegPerS, double dtSeconds) noexcept;

    [[nodiscard]] bool done() const noexcept { return done_; }
    [[nodiscard]] double angle() const noexcept { return angle_; }  // com o sinal do giroscópio
    [[nodiscard]] double elapsed() const noexcept { return time_; }
    [[nodiscard]] bool crept() const noexcept { return crept_; }
    [[nodiscard]] double maxVolts() const noexcept { return maxVolts_; }
    // Arco que a roda de FORA anda na curva inteira (mm).
    [[nodiscard]] double expectedArcMm() const noexcept {
        return targetDeg_ * kRadPerDeg * outerRadius_;
    }

private:
    double targetDeg_;
    Direction direction_;
    PivotMoveConfig config_;
    TrapezoidProfile profile_;
    WheelLoop left_;
    WheelLoop right_;
    static constexpr double kRadPerDeg = 3.14159265358979323846 / 180.0;
    double outerRadius_;  // raio da roda de fora (mm)
    double innerRadius_;  // raio da roda de dentro (mm); negativo no pivô (ela anda para trás)
    double angle_{0.0};
    double time_{0.0};
    double maxVolts_{0.0};
    bool done_{false};
    bool crept_{false};
};

}  // namespace micromouse::controller
