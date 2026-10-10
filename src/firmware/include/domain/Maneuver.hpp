#pragma once

namespace micromouse::domain {

struct TurnConfig {
    double wheelDiameterMm{};
    int countsPerRevolution{};
    double wheelTrackMm{};  // distância entre as rodas (bitola)
};

[[nodiscard]] double pulsesForTurn(const TurnConfig& config, double degrees);

}  // namespace micromouse::domain
