#include <gtest/gtest.h>

#include "controller/RobotMotion.hpp"
#include "controller/StraightMove.hpp"
#include "domain/RobotParameters.hpp"
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

}  // namespace
}  // namespace micromouse::domain
