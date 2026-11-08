#pragma once

namespace micromouse::domain {

struct TurnConfig {
    double wheelDiameterMm{};
    int countsPerRevolution{};
    double wheelTrackMm{};  // distância entre as rodas (bitola)
};

[[nodiscard]] double pulsesForTurn(const TurnConfig& config, double degrees);

// Potência da curva no lugar (controller::PivotTurn).
struct PivotProfile {
    double cruiseSpeed;   // potência das rodas longe do alvo
    double finalSpeed;    // potência ao chegar ao alvo (a roda já está girando)
    double slowdownDeg;   // a quantos graus do alvo a potência começa a cair
    double toleranceDeg;  // a curva termina com |ângulo| >= alvo - tolerância
};

class GyroTurnController {
private:
    double targetDeg_;
    double toleranceDeg_;
    double angle_{0.0};

public:
    GyroTurnController(double targetDeg, double toleranceDeg);
    [[nodiscard]] double angle() const noexcept;
    [[nodiscard]] bool reached() const noexcept;
    void integrate(double angularVelDegPerS, double deltaTimeSeconds);
    void reset() noexcept;
};

}  // namespace micromouse::domain
