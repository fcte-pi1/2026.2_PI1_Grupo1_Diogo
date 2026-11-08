#pragma once

#include "controller/MotionController.hpp"
#include "domain/Maneuver.hpp"

namespace micromouse::controller {

using domain::PivotProfile;

// Curva no lugar (pivô: rodas em sentidos opostos) encerrada SÓ pelo giroscópio. Em 07/11, a curva
// também terminava quando os pulsos chegavam ao alvo; no chão as rodas patinavam, e o robô seguia
// parado ou girado 60-70 graus enquanto o mapa achava que ele tinha virado.
// Perto do alvo, a potência cai em rampa de cruiseSpeed até finalSpeed: o robô gira menos depois do
// freio. O ângulo é integrado com o intervalo medido entre as leituras do giroscópio.
class PivotTurn {
public:
    enum class Direction { Left, Right };

    PivotTurn(double targetDeg, Direction direction, const PivotProfile& profile);
    // Integra a velocidade angular lida (graus/s) no intervalo `dtSeconds` desde a leitura anterior
    // e devolve a potência das rodas. Depois de done(), devolve 0 e não integra mais.
    [[nodiscard]] WheelSpeeds step(double gyroDegPerSec, double dtSeconds);
    // Só integra (rodas já freadas): mede quanto o robô ainda gira depois do freio.
    void settle(double gyroDegPerSec, double dtSeconds);
    [[nodiscard]] bool done() const noexcept { return done_; }
    [[nodiscard]] double angle() const noexcept { return gyro_.angle(); }  // com o sinal do giro

private:
    domain::GyroTurnController gyro_;
    double targetDeg_;
    Direction direction_;
    PivotProfile profile_;
    bool done_{false};
};

}  // namespace micromouse::controller
