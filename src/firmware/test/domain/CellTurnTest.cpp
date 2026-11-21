#include <gtest/gtest.h>

#include <cmath>
#include <cstdio>

#include "domain/CellTurn.hpp"
#include "domain/PivotClearance.hpp"

namespace micromouse::domain {
namespace {

// Robô medido em 20/11: frente 100 mm, ToF frontal a 98, largura 112, cabo ~10 mm à esquerda.
Calibration measuredRobot() {
    Calibration c;
    c.axleToFrontMm = 100.0;
    c.axleToFrontTofMm = 98.0;
    c.frontWidthMm = 112.0;
    c.cableLeftMm = 10.0;
    return c;
}

// A causa da falha do passo 7 (SERPENTINAS 23-29): com os postes dos cantos e a parede da frente, o giro de 90 graus NO LUGAR
// não cabe em posição nenhuma do eixo.
TEST(CellTurn, APlainPivotDoesNotFitWithTheCornerPostsAndAFrontWall) {
    const CellTurnBody body = cellTurnBody(measuredRobot());
    const CellTurnWalls walls{};  // parede à frente e corredores de entrada e saída com as duas paredes
    for (const bool left : {true, false}) {
        for (double axle = -80.0; axle <= 0.0; axle += 2.0) {
            EXPECT_LT(cellTurnClearanceMm(body, left, walls, axle, 90.0, 0.0), 0.0)
                << (left ? "esquerda" : "direita") << " eixo " << axle;
        }
    }
}

// O modelo antigo (paredes como retas infinitas, sem postes) achava que cabia com o eixo 36 mm antes do centro: foi o que o
// firmware de 20/11 fez, e a lateral do chassi bateu no poste.
TEST(CellTurn, TheOldPivotModelIgnoredThePosts) {
    const Calibration c = measuredRobot();
    EXPECT_TRUE(pivotInPlaceClears(c, -36.0, true, CellWalls{true, false, false, false}));
    EXPECT_LT(cellTurnClearanceMm(cellTurnBody(c), true, CellTurnWalls{}, -36.0, 90.0, 0.0), 0.0);
}

TEST(CellTurn, TheSManeuverFitsTheSerpentineLeftTurnAndExitsNearTheMiddle) {
    const CellTurnPlan plan = planCellTurn(cellTurnBody(measuredRobot()), true, CellTurnWalls{}, 3.0, 25.0, 10.0);
    std::printf("esquerda: eixo %.1f giro %.1f diagonal %.1f saida lateral %.1f a frente %.1f folga %.1f\n", plan.axleMm,
                plan.firstTurnDeg, plan.diagonalMm, plan.exitLateralMm, plan.exitAheadMm, plan.clearanceMm);
    ASSERT_TRUE(plan.found);
    EXPECT_GE(plan.clearanceMm, 0.0);
    EXPECT_LT(plan.firstTurnDeg, 90.0);
    EXPECT_GT(plan.diagonalMm, 0.0);
    EXPECT_LE(std::fabs(plan.exitLateralMm), 10.0);  // por desenho: no meio ou até 10 mm para dentro
    // O plano escolhido confere com a checagem independente.
    EXPECT_GE(cellTurnClearanceMm(cellTurnBody(measuredRobot()), true, CellTurnWalls{}, plan.axleMm, plan.firstTurnDeg,
                                  plan.diagonalMm),
              0.0);
}

TEST(CellTurn, TheRightTurnIsTheMirrorWithTheCableOutside) {
    const CellTurnPlan plan = planCellTurn(cellTurnBody(measuredRobot()), false, CellTurnWalls{}, 3.0, 25.0, 10.0);
    std::printf("direita: eixo %.1f giro %.1f diagonal %.1f saida lateral %.1f a frente %.1f folga %.1f\n", plan.axleMm,
                plan.firstTurnDeg, plan.diagonalMm, plan.exitLateralMm, plan.exitAheadMm, plan.clearanceMm);
    ASSERT_TRUE(plan.found);
    EXPECT_GE(plan.clearanceMm, 0.0);
    EXPECT_LE(std::fabs(plan.exitLateralMm), 10.0);
}

// Robustez: o plano escolhido cabe com o robô até 10 mm fora do eixo de entrada, para os dois lados.
TEST(CellTurn, TheChosenPlanToleratesTheEntryLateralError) {
    const CellTurnBody body = cellTurnBody(measuredRobot());
    for (const bool left : {true, false}) {
        const CellTurnPlan plan = planCellTurn(body, left, CellTurnWalls{}, 3.0, 25.0, 10.0);
        ASSERT_TRUE(plan.found);
        for (const double side : {-10.0, 0.0, 10.0}) {
            EXPECT_GE(cellTurnClearanceMm(body, left, CellTurnWalls{}, plan.axleMm, plan.firstTurnDeg, plan.diagonalMm, side),
                      0.0)
                << (left ? "esquerda" : "direita") << " desvio " << side;
        }
    }
}

// Sem parede à frente há bem mais espaço: o plano cabe com folga de sobra.
TEST(CellTurn, WithoutAFrontWallThePlanHasRoom) {
    CellTurnWalls walls{};
    walls.front = false;
    const CellTurnPlan plan = planCellTurn(cellTurnBody(measuredRobot()), true, walls, 0.0, 25.0, 10.0);
    std::printf("sem frente: eixo %.1f giro %.1f diagonal %.1f folga %.1f\n", plan.axleMm, plan.firstTurnDeg,
                plan.diagonalMm, plan.clearanceMm);
    ASSERT_TRUE(plan.found);
    EXPECT_GE(plan.clearanceMm, 3.0);
}

// Sem o S (beta máximo 0) não há plano numa célula com parede à frente: o firmware não pode girar ali.
TEST(CellTurn, WithoutTheSManeuverThereIsNoPlan) {
    EXPECT_FALSE(planCellTurn(cellTurnBody(measuredRobot()), true, CellTurnWalls{}, 0.0, 0.0, 10.0).found);
}

}  // namespace
}  // namespace micromouse::domain
