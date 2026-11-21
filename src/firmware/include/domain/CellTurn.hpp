#pragma once

#include "domain/Calibration.hpp"

namespace micromouse::domain {

// Curva numa célula SEM paredes dos lados (giro_aberto), com parede à frente (21/11).
//
// Por que existe: o modelo do giro no lugar (PivotClearance) trata as paredes como retas infinitas e ignora os POSTES dos
// cantos. Numa célula aberta só a parede da frente entrava na conta, e o planejador aceitava girar 90 graus com o eixo 31-36 mm
// antes do centro. Com os postes (e o cabo da bateria à esquerda) esse giro não cabe em posição nenhuma: no fim dele a lateral
// do lado de dentro passa por cima do poste do canto (SERPENTINAS 23-29, passo 7: "a parte esquerda do chassi encosta na parede",
// rumo +10 graus com as rodas andando iguais). A frente longa (100 mm) obriga o eixo a ficar >= 31 mm atrás do centro, e é esse
// recuo que vira deslocamento lateral para o lado de dentro na saída.
//
// A saída é um "S": gira só (90 - beta) graus, anda `diagonalMm` na diagonal (o eixo vai para o meio do corredor de saída) e
// completa a curva girando o resto. O plano é checado contra paredes e postes em todo o movimento.
//
// Referencial (curva à ESQUERDA; a direita é o espelho): centro da célula na origem, rumo antigo +x, saída +y. Paredes com 12 mm
// de espessura, face interna a 84 mm do centro; postes 12 x 12 mm nos quatro cantos (+-90, +-90).
struct CellTurnBody {
    double frontMm;      // eixo até a frente (o maior entre o chassi e o ToF frontal)
    double rearMm;       // eixo até a traseira
    double halfWidthMm;  // meia largura (com os ToF laterais)
    double cableMm;      // o que o cabo da bateria sobressai no lado ESQUERDO do robô (de -rear até +20 mm do eixo)
};

struct CellTurnWalls {
    bool front{true};       // parede à frente na célula da curva (rumo antigo)
    bool exitInner{true};   // parede do lado de dentro no corredor de saída (começa na borda da célula)
    bool exitOuter{true};   // parede do lado de fora no corredor de saída
    bool entrySides{true};  // paredes laterais do corredor de entrada (antes da borda de trás da célula)
};

struct CellTurnPlan {
    bool found{false};
    double axleMm{0.0};         // onde o eixo deve estar ao começar (ao longo do rumo antigo; + = à frente do centro)
    double firstTurnDeg{90.0};  // primeiro giro (sempre no sentido da curva)
    double diagonalMm{0.0};     // reta na diagonal depois do primeiro giro (0 = giro simples)
    double exitLateralMm{0.0};  // eixo em relação ao eixo do corredor de saída no fim (+ = para o lado de DENTRO da curva)
    double exitAheadMm{0.0};    // quanto o eixo já avançou na direção de saída, a partir do centro da célula
    double clearanceMm{0.0};    // menor folga do corpo a paredes e postes no movimento todo
};

// Corpo do robô com as medidas do calib (cabo: `cabo_esq_mm`).
[[nodiscard]] CellTurnBody cellTurnBody(const Calibration& calibration) noexcept;

// Menor folga (mm; negativa = encosta/invade) do movimento: girar `firstTurnDeg` com o eixo em `axleMm`, andar `diagonalMm`,
// completar até 90 graus e entrar 60 mm no corredor de saída.
// `entryLateralMm`: o robô fora do eixo do corredor de entrada (+ = para o lado da saída, que é o lado de dentro da curva).
[[nodiscard]] double cellTurnClearanceMm(const CellTurnBody& body, bool turnLeft, const CellTurnWalls& walls, double axleMm,
                                         double firstTurnDeg, double diagonalMm, double entryLateralMm = 0.0) noexcept;

// Escolhe o movimento de MAIOR folga no pior caso do desvio lateral de entrada (+-`entryUncertaintyMm`): beta de 0 a
// `maxBetaDeg` (de 5 em 5), eixo de 0 a -60 mm e saída no meio do corredor ou até 10 mm para o lado de dentro. found = false
// quando nenhum movimento cabe (folga < 0). `marginMm` é só referência para o log (o firmware avisa quando a folga fica abaixo).
[[nodiscard]] CellTurnPlan planCellTurn(const CellTurnBody& body, bool turnLeft, const CellTurnWalls& walls,
                                        double marginMm, double maxBetaDeg, double entryUncertaintyMm) noexcept;

}  // namespace micromouse::domain
