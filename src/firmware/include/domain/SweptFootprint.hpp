#pragma once

#include "domain/Calibration.hpp"

namespace micromouse::domain {

// Área varrida pela pegada do robô numa curva fechada com UMA roda (a de dentro fica parada e o robô
// gira em volta dela), num corredor em L de 168 mm com paredes de 12 mm. Reproduz a simulação de
// 19/11 (pegada do CAD: retângulo do chassi mais as rodas, com R10 na frente da frente).
//
// Referencial do corredor: origem no centro da célula, x para onde o robô anda, y para a ESQUERDA
// (a curva é para a esquerda; à direita é o espelho). A parede da frente tem a face interna em
// x = 84; a saída fica à esquerda.
struct OneWheelStartBand {
    bool found{false};
    double minMm{0.0};  // o EIXO começa o giro de minMm a maxMm ANTES do centro da célula
    double maxMm{0.0};
    double exitOffsetMinMm{0.0};  // desvio do eixo do centro do corredor de saída, para os dois
    double exitOffsetMaxMm{0.0};  // extremos da faixa (mm, positivo = para o lado da curva)
};

// O robô, com o eixo `axleBeforeCenterMm` antes do centro da célula, gira 90 graus em volta da roda
// esquerda sem tocar nas paredes?
[[nodiscard]] bool oneWheelTurnClears(const Calibration& calibration,
                                      double axleBeforeCenterMm) noexcept;

// A faixa de início em que a curva cabe (passo de 1 mm), com as medidas do `Calibration`.
[[nodiscard]] OneWheelStartBand oneWheelStartBand(const Calibration& calibration) noexcept;

// Para onde o EIXO vai depois da curva: avanço além do centro da célula na nova direção (mm) e
// deslocamento para o lado em relação ao centro do corredor de saída (positivo = para o lado de
// dentro da curva).
struct OneWheelEnd {
    double aheadOfCenterMm;
    double inwardOffsetMm;
};
[[nodiscard]] OneWheelEnd oneWheelEnd(double axleBeforeCenterMm) noexcept;


// Onde o EIXO deve começar o giro: o meio da faixa em que a curva cabe (com a mesma folga nas duas
// pontas). Negativo se a curva não cabe com as medidas do `Calibration`.
[[nodiscard]] double oneWheelStartTargetMm(const Calibration& calibration) noexcept;

}  // namespace micromouse::domain
