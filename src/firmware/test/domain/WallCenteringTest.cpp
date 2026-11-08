#include <gtest/gtest.h>

#include "controller/MotionController.hpp"
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

// O sinal fecha com o controle de reta: perto da parede direita, a roda direita acelera e o robô
// vira para a esquerda, de volta ao centro.
TEST(WallCentering, SignMatchesTheStraightController) {
    controller::MotionController straight(robot::kStraightGains, robot::kStraightBaseSpeed,
                                          robot::kStraightMaxSpeed, robot::kStraightMaxCorrection);
    const double term = wallCenteringError(wall(60), wall(20), robot::kWallCentering);
    const controller::WheelSpeeds speeds = straight.correct(0.0 + term, 0.001);
    EXPECT_GT(speeds.right, speeds.left);
}

// Valores do robô: termo máximo bem abaixo do que satura o controle de reta.
TEST(WallCentering, RobotConfigCannotSaturateTheStraightControlAlone) {
    EXPECT_LT(robot::kWallCentering.maxPulses * robot::kStraightGains.proportionalGain,
              robot::kStraightMaxCorrection);
    EXPECT_LE(robot::kWallCentering.useBelowMm, 90.0);  // só a parede da própria célula
}

// O efeito do termo de parede na potência é ganho x kp. O projeto (docs/rf44-centralizacao.md) é
// 10 mm fora do centro = correção 0,025 e no máximo 0,075; quando o kp da reta muda, os ganhos da
// parede acompanham (07/11: kp de 0,005 para 0,010 dobrava o efeito da parede).
TEST(WallCentering, RobotConfigKeepsTheDesignedAuthority) {
    const double kp = robot::kStraightGains.proportionalGain;
    EXPECT_NEAR(robot::kWallCentering.gainPulsesPerMm * kp * 10.0, 0.025, 1e-9);
    EXPECT_NEAR(robot::kWallCentering.maxPulses * kp, 0.075, 1e-9);
}

}  // namespace
}  // namespace micromouse::domain
