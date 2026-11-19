#include <gtest/gtest.h>

#include "domain/Calibration.hpp"
#include "domain/WallPosition.hpp"

namespace micromouse::domain {
namespace {

// Eixo no centro da célula, parede no fim da célula SEGUINTE: a face do ToF fica a 84 + 180 - 85 = 179 mm.
constexpr int kOneCellAhead = 179;

TEST(WallPosition, OnTheNominalPositionThereIsNothingToFix) {
    const WallFix fix = wallPositionFix(Calibration{}, kOneCellAhead);
    ASSERT_TRUE(fix.valid);
    EXPECT_EQ(fix.cellsAhead, 1);
    EXPECT_NEAR(fix.errorMm, 0.0, 1e-9);
    EXPECT_DOUBLE_EQ(fix.correctionMm, 0.0);
}

// Atrás do centro (a parede lê mais longe): corrige para a frente, pela metade do erro.
TEST(WallPosition, BehindTheCenterAdvancesByHalfTheError) {
    const WallFix fix = wallPositionFix(Calibration{}, kOneCellAhead + 20);
    ASSERT_TRUE(fix.valid);
    EXPECT_NEAR(fix.errorMm, 20.0, 1e-9);
    EXPECT_NEAR(fix.correctionMm, 10.0, 1e-9);
}

TEST(WallPosition, PastTheCenterBacksOff) {
    const WallFix fix = wallPositionFix(Calibration{}, kOneCellAhead - 20);
    ASSERT_TRUE(fix.valid);
    EXPECT_NEAR(fix.correctionMm, -10.0, 1e-9);
}

// Abaixo de ~15 mm está no nível do desvio e do ruído do ToF (+-10 a 15 mm no B3): não mexe.
TEST(WallPosition, ErrorsInsideTheToFNoiseAreIgnored) {
    for (const int error : {-14, -6, 6, 14}) {
        const WallFix fix = wallPositionFix(Calibration{}, kOneCellAhead + error);
        ASSERT_TRUE(fix.valid) << error;
        EXPECT_DOUBLE_EQ(fix.correctionMm, 0.0) << error;
    }
}

TEST(WallPosition, TheCorrectionIsCappedAtFifteenMillimetres) {
    const WallFix fix = wallPositionFix(Calibration{}, kOneCellAhead + 44);
    ASSERT_TRUE(fix.valid);
    EXPECT_NEAR(fix.correctionMm, 15.0, 1e-9);
    EXPECT_NEAR(wallPositionFix(Calibration{}, kOneCellAhead - 44).correctionMm, -15.0, 1e-9);
}

// A parede duas células à frente também serve (359 mm).
TEST(WallPosition, ATwoCellWallWorksToo) {
    const WallFix fix = wallPositionFix(Calibration{}, 359 + 20);
    ASSERT_TRUE(fix.valid);
    EXPECT_EQ(fix.cellsAhead, 2);
    EXPECT_NEAR(fix.correctionMm, 10.0, 1e-9);
}

// Entre duas posições esperadas, parede na própria célula, perto demais ou além do alcance útil: não é uma
// medida de posição, e nada é corrigido.
TEST(WallPosition, ReadingsThatAreNotAWallAtAnExpectedDistanceAreRejected) {
    for (const int front : {0, 40, 100, 130, 250, 300, 450, 700}) {
        EXPECT_FALSE(wallPositionFix(Calibration{}, front).valid) << front;
    }
}

// O ToF frontal muda de lugar com `eixo_ate_tof_frente`: a posição esperada acompanha.
TEST(WallPosition, ExpectedDistanceFollowsTheFrontToFPosition) {
    Calibration calibration;
    calibration.axleToFrontTofMm = 107.75;  // frente do CAD
    EXPECT_TRUE(wallPositionFix(calibration, 156).valid);        // 84 + 180 - 107,75 = 156,25
    EXPECT_DOUBLE_EQ(wallPositionFix(calibration, 156).correctionMm, 0.0);
}

}  // namespace
}  // namespace micromouse::domain
