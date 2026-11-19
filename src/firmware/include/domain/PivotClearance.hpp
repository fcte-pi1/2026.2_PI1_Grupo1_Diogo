#pragma once

#include <optional>

#include "domain/Calibration.hpp"

namespace micromouse::domain {

// Paredes da célula onde o robô gira no lugar, no referencial do robô (frente = para onde aponta).
struct CellWalls {
    bool front{false};
    bool back{false};
    bool left{false};
    bool right{false};
};

// Quanto a pegada do robô passa DENTRO de uma parede durante um giro de 90 graus no lugar (mm; 0 =
// não bate). O eixo fica `axleAheadOfCenterMm` à frente do centro da célula (negativo = atrás), no
// meio do corredor. As paredes ficam a 84 mm do centro (corredor livre de 168 mm) e são infinitas.
// A pegada vem do `Calibration` (frente, largura da frente, largura com rodas) e da traseira do CAD.
[[nodiscard]] double pivotWallIntrusionMm(const Calibration& calibration, double axleAheadOfCenterMm,
                                          bool turnLeft, const CellWalls& walls) noexcept;

// O giro cabe, com `marginMm` de folga em cada parede?
[[nodiscard]] bool pivotInPlaceClears(const Calibration& calibration, double axleAheadOfCenterMm,
                                      bool turnLeft, const CellWalls& walls,
                                      double marginMm = 0.0) noexcept;

// Faixa de posições do eixo (ao longo da direção do robô, passo de 0,5 mm) em que o giro cabe.
struct PivotBand {
    bool found{false};
    double minMm{0.0};
    double maxMm{0.0};
};
[[nodiscard]] PivotBand pivotInPlaceBand(const Calibration& calibration, bool turnLeft,
                                         const CellWalls& walls, double marginMm = 0.0) noexcept;

// O meio da faixa (mesma folga nas duas pontas); vazio se o giro não cabe.
[[nodiscard]] std::optional<double> pivotInPlaceTargetMm(const Calibration& calibration,
                                                         bool turnLeft, const CellWalls& walls,
                                                         double marginMm = 0.0) noexcept;

// O que fazer para girar 90 graus no lugar sem raspar: já cabe onde está, anda `moveMm` (positivo = para
// a frente) até a faixa e gira, ou não cabe em posição nenhuma (a frente do CAD, por exemplo).
enum class PivotAction { PivotNow, MoveThenPivot, DoesNotFit };

struct PivotPlan {
    PivotAction action{PivotAction::DoesNotFit};
    double moveMm{0.0};
    double targetMm{0.0};  // onde o eixo deve estar ao girar (ao longo da direção, do centro da célula)
};

// `axleAheadOfCenterMm`: onde o eixo está agora. Faixa estreita (até 20 mm): vai ao meio dela. Faixa
// larga (sem parede na frente): vai só até 5 mm para dentro da borda mais próxima.
[[nodiscard]] PivotPlan planPivotInPlace(const Calibration& calibration, bool turnLeft,
                                         const CellWalls& walls,
                                         double axleAheadOfCenterMm) noexcept;

}  // namespace micromouse::domain
