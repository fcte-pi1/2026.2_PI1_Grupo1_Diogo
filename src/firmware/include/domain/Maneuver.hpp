#pragma once

namespace micromouse::domain {

struct TurnConfig {
    double wheelDiameterMm{};
    int countsPerRevolution{};
    double wheelTrackMm{};  // distância entre as rodas (bitola)
};

[[nodiscard]] double pulsesForTurn(const TurnConfig& config, double degrees);

class GyroTurnController {
private:
    double targetDeg_;
    double toleranceDeg_;
    double angle_{0.0};

public:
    GyroTurnController(double targetDeg, double toleranceDeg);
    [[nodiscard]] double angle() const noexcept;
    [[nodiscard]] bool reached() const noexcept;
};

}  // namespace micromouse::domain
