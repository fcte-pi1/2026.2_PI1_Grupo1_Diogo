#include <gtest/gtest.h>

#include "controller/RobotMotion.hpp"
#include "controller/StraightMove.hpp"
#include "domain/RobotParameters.hpp"
#include "domain/Calibration.hpp"
#include "domain/RobotGeometry.hpp"
#include "domain/WallCentering.hpp"

namespace micromouse::domain {
namespace {

constexpr WallCenteringConfig kConfig{40.0, 90.0, 0.5, 15.0};

SideReading wall(double mm) { return {true, mm}; }
const SideReading kNoWall{};

TEST(WallCentering, CenteredBetweenTwoWallsGivesZero) {
    EXPECT_DOUBLE_EQ(wallCenteringError(wall(40), wall(40), kConfig), 0.0);
    // Com as duas paredes vale a diferença, mesmo que o centro calibrado esteja errado.
    EXPECT_DOUBLE_EQ(wallCenteringError(wall(55), wall(55), kConfig), 0.0);
}

TEST(WallCentering, CloserToTheRightWallIsPositive) {
    EXPECT_DOUBLE_EQ(wallCenteringError(wall(50), wall(30), kConfig), 0.5 * 10.0);
    EXPECT_DOUBLE_EQ(wallCenteringError(wall(30), wall(50), kConfig), -0.5 * 10.0);
}

TEST(WallCentering, OneWallComparesWithTheCalibratedCenter) {
    EXPECT_DOUBLE_EQ(wallCenteringError(wall(50), kNoWall, kConfig), 0.5 * 10.0);   // longe da esq.
    EXPECT_DOUBLE_EQ(wallCenteringError(kNoWall, wall(50), kConfig), -0.5 * 10.0);  // longe da dir.
    EXPECT_DOUBLE_EQ(wallCenteringError(wall(40), kNoWall, kConfig), 0.0);
}

// Sem parede, parede longe (a da célula vizinha), "sem alvo" ou falha: só os encoders.
TEST(WallCentering, NoUsableWallGivesZero) {
    EXPECT_DOUBLE_EQ(wallCenteringError(kNoWall, kNoWall, kConfig), 0.0);
    EXPECT_DOUBLE_EQ(wallCenteringError(wall(250), wall(300), kConfig), 0.0);
    EXPECT_DOUBLE_EQ(wallCenteringError({false, 20.0}, kNoWall, kConfig), 0.0);  // leitura inválida
    // Uma parede perto e a outra longe: usa só a perto.
    EXPECT_DOUBLE_EQ(wallCenteringError(wall(30), wall(250), kConfig), -0.5 * 10.0);
}

TEST(WallCentering, TermIsLimited) {
    EXPECT_DOUBLE_EQ(wallCenteringError(wall(85), wall(0), kConfig), 15.0);
    EXPECT_DOUBLE_EQ(wallCenteringError(wall(0), wall(85), kConfig), -15.0);
}

// O sinal fecha com a reta: perto da parede direita, a roda direita é adiantada e o robô vira para
// a esquerda, de volta ao centro. O adaptador passa o termo em mm (pulsos x mm por pulso).
TEST(WallCentering, SignMatchesTheStraightMove) {
    const double term = wallCenteringError(wall(60), wall(20), robot::kWallCentering);
    ASSERT_GT(term, 0.0);
    controller::StraightMove move(robot::kCellSizeMm, controller::robot::kStraightMove);
    controller::StraightMove::Output out{};
    for (int i = 0; i < 50; ++i) {
        out = move.step(0.002, 0.0, 0.0, 0.0, 0.0, term * controller::robot::kMmPerPulse);
    }
    EXPECT_GT(out.rightVolts, out.leftVolts);
}

// Valores do robô: o termo máximo fica em poucos mm de diferença entre as rodas (~4 graus de rumo),
// e só a parede da própria célula entra.
TEST(WallCentering, RobotConfigStaysSmall) {
    EXPECT_LT(robot::kWallCentering.maxPulses * controller::robot::kMmPerPulse, 7.0);
    EXPECT_LE(robot::kWallCentering.useBelowMm, 90.0);
}


// Ganho e teto do termo da parede são calibráveis (`ganho_parede`, `max_parede`): os de 09/11 (0,8 pulso/mm,
// no máximo 16 pulsos = ~6 mm) não seguravam 25 mm de erro (E15 de 20/11).
TEST(WallCenteringConfigFromCalibration, DefaultsMatchTheConstantsInUse) {
    const Calibration c;
    const WallCenteringConfig config = robot::wallCenteringConfig(c);
    EXPECT_DOUBLE_EQ(config.gainPulsesPerMm, robot::kWallCentering.gainPulsesPerMm);
    EXPECT_DOUBLE_EQ(config.maxPulses, robot::kWallCentering.maxPulses);
    EXPECT_NEAR(config.centerMm, 33.5, 0.2);
}

TEST(WallCenteringConfigFromCalibration, StrongerGainAndCapCorrectALargerOffset) {
    Calibration c;
    c.corridorWidthMm = 150.0;
    c.wallGainPulsesPerMm = 2.0;
    c.wallMaxPulses = 60.0;
    const WallCenteringConfig config = robot::wallCenteringConfig(c);
    EXPECT_NEAR(config.centerMm, 24.5, 1e-9);
    const LateralPose pose{true, 25.0, false};  // 25 mm para a direita
    const double weak = lateralCorrectionPulses(pose, robot::kWallCentering);
    const double strong = lateralCorrectionPulses(pose, config);
    EXPECT_NEAR(weak, 16.0, 1e-9);     // o teto de antes
    EXPECT_NEAR(strong, 50.0, 1e-9);   // 2,0 x 25
    EXPECT_GT(strong * controller::robot::kMmPerPulse, 15.0);  // ~17,6 mm de correção, contra 5,6
}

}  // namespace
}  // namespace micromouse::domain
