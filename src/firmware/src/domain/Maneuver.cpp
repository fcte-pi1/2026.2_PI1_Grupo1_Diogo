#include "domain/Maneuver.hpp"

#include <cmath>

namespace micromouse::domain {

double pulsesForTurn(const TurnConfig& config, double degrees) {
    // pulsos = (bitola/2) x |graus| x counts / (180 x diâmetro)
    return (config.wheelTrackMm / 2.0) * std::fabs(degrees) * config.countsPerRevolution /
           (180.0 * config.wheelDiameterMm);
};

}  // namespace micromouse::domain
