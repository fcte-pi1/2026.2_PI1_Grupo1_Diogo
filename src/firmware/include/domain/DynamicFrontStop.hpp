#pragma once

#include <algorithm>
#include <cmath>

namespace micromouse::domain {

// Parada pela parede da frente que conta a velocidade (19/11). Quando o frontal lê menos que `parada_frente`
// (35 mm), a reta para, mas o robô ainda anda mais `v^2 / (2 a)` até parar: a velocidade da corrida decidia
// em que ponto ele ficava. Aqui o limiar sobe por essa distância, para o robô parar em `parada_frente`
// qualquer que seja a velocidade.
// A desaceleração do freio (1600 mm/s²) vem de 19/11: a 150 mm/s, as retas contra o fundo empurraram ~7 mm
// além do que mandou o limiar (150² / 3200 = 7,0 mm). PROPOSTA A CONFIRMAR no robô.
inline constexpr double kFrontBrakeDecelMmPerS2 = 1600.0;
inline constexpr double kDynamicFrontStopMaxExtraMm = 20.0;  // teto: uma velocidade ruim não afasta o limiar

[[nodiscard]] inline double dynamicFrontStopMm(double frontStopMm, double speedMmPerS) noexcept {
    const double extra = speedMmPerS * speedMmPerS / (2.0 * kFrontBrakeDecelMmPerS2);
    return frontStopMm + std::min(extra, kDynamicFrontStopMaxExtraMm);
}

}  // namespace micromouse::domain
