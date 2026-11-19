#include <gtest/gtest.h>

#include "domain/Calibration.hpp"
#include "domain/PivotClearance.hpp"
#include "domain/RobotParameters.hpp"

namespace micromouse::domain {
namespace {

// Célula de 168 mm livres (meio corredor = 84). O eixo gira no lugar 90 graus. A posição do eixo é
// medida ao longo da direção em que o robô aponta, a partir do centro da célula (negativo = atrás).
constexpr CellWalls kFrontBackLeft{true, true, true, false};
constexpr CellWalls kFrontBackRight{true, true, false, true};

// Pegada de campo (87 mm do eixo à frente): o canto da frente fica a 100,6 mm do eixo, mais que os
// 84 mm de meio corredor. No centro da célula o canto bate na parede da frente em 16,6 mm.
TEST(PivotClearance, AxleAtTheCellCenterHitsTheFrontWall) {
    const Calibration calibration;
    EXPECT_NEAR(pivotWallIntrusionMm(calibration, 0.0, false, kFrontBackLeft), 16.6, 0.6);
    EXPECT_FALSE(pivotInPlaceClears(calibration, 0.0, false, kFrontBackLeft));
}

// O plano B atual: o recuo parou com a traseira na parede de trás (eixo a ~67 mm atrás do centro) e
// o robô gira ali. O canto de trás varre a parede de trás: bate em ~39 mm.
TEST(PivotClearance, TurningWithTheRearAgainstTheBackWallHitsIt) {
    const Calibration calibration;
    const double axleMm = -(robot::kCorridorWidthMm / 2.0 - robot::kAxleToRearMm);  // -66,75
    EXPECT_NEAR(pivotWallIntrusionMm(calibration, axleMm, false, kFrontBackLeft), 39.1, 1.0);
}

// Parede na frente, atrás e de um lado: só cabe com o eixo ~17 a ~27,5 mm ATRÁS do centro (faixa de
// 10,5 mm). A parede lateral não muda a faixa, e a curva é para o lado aberto, nos dois espelhos.
TEST(PivotClearance, FrontAndBackWallsLeaveAWindowBehindTheCenter) {
    const Calibration calibration;
    for (const bool left : {false, true}) {
        const CellWalls walls = left ? kFrontBackRight : kFrontBackLeft;
        const PivotBand band = pivotInPlaceBand(calibration, left, walls, 0.0);
        ASSERT_TRUE(band.found);
        EXPECT_NEAR(band.minMm, -27.5, 0.6);
        EXPECT_NEAR(band.maxMm, -17.0, 0.6);
        EXPECT_TRUE(pivotInPlaceClears(calibration, -22.0, left, walls));
    }
}

// Com 5 mm de folga em cada parede (erro de odometria do recuo) a faixa some: a manobra encosta.
TEST(PivotClearance, AFiveMillimetreMarginLeavesAlmostNoWindow) {
    const Calibration calibration;
    const PivotBand band = pivotInPlaceBand(calibration, false, kFrontBackLeft, 5.0);
    if (band.found) {
        EXPECT_LT(band.maxMm - band.minMm, 2.0);
    }
}

// Com a frente do CAD (107,25 mm do eixo) o canto fica a 118,5 mm: não cabe em nenhuma posição.
TEST(PivotClearance, CadFrontLengthNeverFitsBetweenTheFrontAndBackWalls) {
    Calibration calibration;
    calibration.axleToFrontMm = robot::kCadAxleToFrontMm;
    EXPECT_FALSE(pivotInPlaceBand(calibration, false, kFrontBackLeft, 0.0).found);
}

// Sem parede atrás (corredor aberto atrás) o eixo pode ficar mais para trás, e o alvo fica no meio.
TEST(PivotClearance, TargetIsTheMiddleOfTheWindow) {
    const Calibration calibration;
    const auto target = pivotInPlaceTargetMm(calibration, false, kFrontBackLeft, 0.0);
    ASSERT_TRUE(target.has_value());
    EXPECT_NEAR(*target, -22.25, 0.6);
    EXPECT_FALSE(pivotInPlaceTargetMm(calibration, false, kFrontBackLeft, 8.0).has_value());
}

}  // namespace
}  // namespace micromouse::domain

namespace micromouse::domain {
namespace {

// Plano do giro no lugar: gira já, anda até a faixa e gira, ou avisa que não cabe.
TEST(PivotPlan, RearAgainstTheBackWallMovesForwardIntoTheWindow) {
    const Calibration calibration;
    const double rearWallMm = -(robot::kCorridorWidthMm / 2.0 - robot::kAxleToRearMm);
    const PivotPlan plan = planPivotInPlace(calibration, false, kFrontBackLeft, rearWallMm);
    EXPECT_EQ(plan.action, PivotAction::MoveThenPivot);
    EXPECT_NEAR(plan.targetMm, -22.25, 0.6);
    EXPECT_NEAR(plan.moveMm, plan.targetMm - rearWallMm, 1e-9);
    EXPECT_GT(plan.moveMm, 40.0);  // para a frente
    EXPECT_TRUE(pivotInPlaceClears(calibration, plan.targetMm, false, kFrontBackLeft));
}

TEST(PivotPlan, AtTheCenterItReversesIntoTheWindow) {
    const Calibration calibration;
    const PivotPlan plan = planPivotInPlace(calibration, true, kFrontBackRight, 0.0);
    EXPECT_EQ(plan.action, PivotAction::MoveThenPivot);
    EXPECT_NEAR(plan.moveMm, -22.25, 0.6);  // para trás
}

TEST(PivotPlan, InsideTheWindowTurnsAtOnce) {
    const Calibration calibration;
    const PivotPlan plan = planPivotInPlace(calibration, false, kFrontBackLeft, -22.0);
    EXPECT_EQ(plan.action, PivotAction::PivotNow);
    EXPECT_DOUBLE_EQ(plan.moveMm, 0.0);
}

TEST(PivotPlan, CadFrontLengthDoesNotFitAndSaysSo) {
    Calibration calibration;
    calibration.axleToFrontMm = robot::kCadAxleToFrontMm;
    const PivotPlan plan = planPivotInPlace(calibration, false, kFrontBackLeft, -22.0);
    EXPECT_EQ(plan.action, PivotAction::DoesNotFit);
    EXPECT_DOUBLE_EQ(plan.moveMm, 0.0);
}

// Sem parede na frente só a de trás limita: faixa larga, o robô só vai até a borda dela (com folga).
TEST(PivotPlan, WithoutAFrontWallItOnlyMovesToTheEdgeOfTheWindow) {
    const Calibration calibration;
    const CellWalls backOnly{false, true, false, false};
    const PivotPlan plan = planPivotInPlace(calibration, false, backOnly, -66.75);
    EXPECT_EQ(plan.action, PivotAction::MoveThenPivot);
    EXPECT_TRUE(pivotInPlaceClears(calibration, plan.targetMm, false, backOnly));
    EXPECT_LT(plan.moveMm, 45.0);  // bem menos que ir ao centro da faixa
}

}  // namespace
}  // namespace micromouse::domain
