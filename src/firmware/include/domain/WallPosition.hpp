#pragma once

#include "domain/Calibration.hpp"

namespace micromouse::domain {

// Reancorar a posição pela parede da frente (19/11). Parado no centro de uma célula, o ToF frontal vê a parede
// no fim de uma das próximas células: com o eixo no centro e `eixo_ate_tof_frente` = 85, ela lê 84 + 180 k - 85 =
// 179 mm (k = 1) ou 359 mm (k = 2). A diferença para isso é o erro de posição do eixo, e corrige a próxima
// reta para a frente. Na própria célula (k = 0) a parede lê ~0 e não serve (o ToF não mede abaixo de ~40 mm).
//
// Só mexe quando o erro passa do nível do ruído e do desvio do ToF (+-10 a 15 mm no B3 de 19/11), e só pela
// METADE do erro, no máximo 15 mm: o erro da odometria é de ~2 mm por célula (501 a 512 pulsos em 511), então
// a correção vale para patinadas e acúmulo de várias células, não para cada medida.
struct WallFix {
    bool valid{false};          // a leitura é uma parede numa posição esperada
    int cellsAhead{0};          // k: quantas células livres antes da parede
    double errorMm{0.0};        // leitura - esperado (positivo: o eixo está ATRÁS do centro)
    double correctionMm{0.0};   // quanto andar a mais na próxima reta (negativo: a menos)
};

inline constexpr double kWallFixNoiseMm = 15.0;
inline constexpr double kWallFixMaxMm = 15.0;
inline constexpr double kWallFixGain = 0.5;
inline constexpr double kWallFixAmbiguityMm = 45.0;  // além disto não é uma parede numa posição esperada

[[nodiscard]] WallFix wallPositionFix(const Calibration& calibration, int frontMm) noexcept;

}  // namespace micromouse::domain
