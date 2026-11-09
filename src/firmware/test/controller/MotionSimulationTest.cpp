#include <gtest/gtest.h>

#include <cmath>

#include "controller/RobotMotion.hpp"
#include "simulation/MotorPlant.hpp"

namespace micromouse::test {
namespace {

using controller::PivotMove;
constexpr double kCell = domain::robot::kCellSizeMm;

// Rodas iguais: para no centro da célula seguinte, reto, abaixo do teto de tensão, logo depois do
// perfil (1,23 s com 200 mm/s e 600 mm/s²).
TEST(StraightMoveSimulation, EqualWheelsStopAtTheNextCell) {
    const StraightResult run = simulateStraight(easyWheel(), easyWheel(), kCell);
    ASSERT_TRUE(run.done);
    EXPECT_NEAR(run.leftMm, kCell, 2.0);
    EXPECT_NEAR(run.rightMm, kCell, 2.0);
    EXPECT_LT(run.maxDifferenceMm, 1.5);
    EXPECT_LE(run.maxVolts, controller::robot::kMotorMaxVolts + 1e-9);
    EXPECT_LT(run.seconds, 1.45);
}

// O caso de 07/11: uma roda bem mais dura (não sai do lugar com 2 V, mais carga). Cada roda recebe a
// tensão de que precisa: as duas chegam juntas e o robô não vira.
TEST(StraightMoveSimulation, StiffWheelGetsMoreVoltageAndKeepsUp) {
    for (const bool stiffOnRight : {true, false}) {
        const MotorWheel left = stiffOnRight ? easyWheel() : stiffWheel();
        const MotorWheel right = stiffOnRight ? stiffWheel() : easyWheel();
        const StraightResult run = simulateStraight(left, right, kCell);
        ASSERT_TRUE(run.done) << stiffOnRight;
        EXPECT_NEAR(run.leftMm, kCell, 2.5) << stiffOnRight;
        EXPECT_NEAR(run.rightMm, kCell, 2.5) << stiffOnRight;
        // 4 mm de diferença ~ 2,6 graus de rumo, que a sincronia desfaz antes do fim.
        EXPECT_LT(run.maxDifferenceMm, 4.0) << stiffOnRight;
        EXPECT_LT(std::fabs(run.leftMm - run.rightMm), 1.5) << stiffOnRight;
    }
}

// Roda travada (09/11: a esquerda não andou nem com 6 V): a reta termina pelo tempo e é FALHA, e
// não "ok" com o robô parado.
TEST(StraightMoveSimulation, BlockedWheelIsReportedAsNotReached) {
    MotorWheel blocked = easyWheel();
    blocked.breakawayVolts = 100.0;  // não sai do lugar com nenhuma tensão
    controller::StraightMove move(kCell, controller::robot::kStraightMove);
    MotorWheel right = easyWheel();
    controller::StraightMove::Output out{};
    double t = 0.0;
    while (!out.done && t < 3.0) {
        t += 0.002;
        out = move.step(0.002, blocked.encoderMm(), right.encoderMm(), blocked.speed, right.speed);
        blocked.step(out.leftVolts, 0.002);
        right.step(out.rightVolts, 0.002);
    }
    ASSERT_TRUE(out.done);
    EXPECT_FALSE(move.reachedTarget());
}

TEST(StraightMoveSimulation, NormalRunReachesTheTarget) {
    controller::StraightMove move(kCell, controller::robot::kStraightMove);
    MotorWheel left = easyWheel();
    MotorWheel right = stiffWheel();
    controller::StraightMove::Output out{};
    for (double t = 0.0; !out.done && t < 3.0; t += 0.002) {
        out = move.step(0.002, left.encoderMm(), right.encoderMm(), left.speed, right.speed);
        left.step(out.leftVolts, 0.002);
        right.step(out.rightVolts, 0.002);
    }
    EXPECT_TRUE(move.reachedTarget());
}

// Com a potência fixa antiga (0,70 em fast decay = ~3,2 V), a roda dura nem sairia do lugar.
TEST(StraightMoveSimulation, OldFixedPowerWouldNotMoveTheStiffWheel) {
    MotorWheel wheel = stiffWheel();
    for (int i = 0; i < 500; ++i) wheel.step(3.2 - 1.0, 0.002);  // 3,2 V menos a queda do driver
    EXPECT_DOUBLE_EQ(wheel.position, 0.0);
}

// RF-44: perto da parede direita (termo positivo), a roda direita é adiantada.
TEST(StraightMoveSimulation, WallOffsetSteersAwayFromTheCloserWall) {
    controller::StraightMove move(kCell, controller::robot::kStraightMove);
    controller::StraightMove::Output out{};
    for (int i = 0; i < 50; ++i) out = move.step(0.002, 0.0, 0.0, 0.0, 0.0, 3.0);
    EXPECT_GT(out.rightVolts, out.leftVolts);
}

// Curva no chão com as rodas patinando (o robô gira só 80% do que os encoders indicam) e o desvio
// do giroscópio medido em 09/11 (-1,7 °/s): o giroscópio decide e o robô gira ~90°.
TEST(PivotMoveSimulation, SlippingWheelsStillTurnNinetyByTheGyro) {
    for (const PivotMove::Direction direction :
         {PivotMove::Direction::Right, PivotMove::Direction::Left}) {
        const PivotResult turn =
            simulatePivot(easyWheel(), stiffWheel(), 90.0, direction, 0.8, -1.7);
        ASSERT_TRUE(turn.done);
        EXPECT_TRUE(turn.crept);  // os encoders acabaram antes: continuou até o giroscópio ver
        EXPECT_NEAR(std::fabs(turn.trueDeg), 90.0, 4.0);
        EXPECT_LT(turn.seconds, 1.5);
        EXPECT_LE(turn.maxVolts, controller::robot::kMotorMaxVolts + 1e-9);
    }
}

// Rodas que não patinam: termina pelo giroscópio no fim do perfil, sem precisar continuar.
TEST(PivotMoveSimulation, CleanTurnEndsWithTheProfile) {
    const PivotResult turn =
        simulatePivot(easyWheel(), easyWheel(), 90.0, PivotMove::Direction::Right, 1.0, 0.0);
    ASSERT_TRUE(turn.done);
    EXPECT_NEAR(turn.trueDeg, 88.0, 3.0);
    EXPECT_LT(turn.seconds, 0.8);
}

TEST(PivotMoveSimulation, TurnAroundReachesOneEighty) {
    const PivotResult turn =
        simulatePivot(easyWheel(), stiffWheel(), 180.0, PivotMove::Direction::Right, 0.85, 0.0);
    ASSERT_TRUE(turn.done);
    EXPECT_NEAR(std::fabs(turn.trueDeg), 180.0, 5.0);
}

// Curva em arco (09/11): as duas rodas andam para a frente (a de dentro só freia, até -2 V), a de
// fora mais rápida, e o giroscópio fecha os 90° nos dois sentidos, mesmo com as rodas patinando.
// A roda de dentro tem que ficar perto do arco planejado (raio 46 mm, ~72 mm em 90°): em 09/11, sem
// poder frear, ela andou 223 mm e o arco abriu.
TEST(PivotMoveSimulation, ArcTurnKeepsBothWheelsGoingForward) {
    constexpr double kDt = 0.002;
    constexpr double kRadToDeg = 57.29577951308232;
    for (const PivotMove::Direction direction :
         {PivotMove::Direction::Right, PivotMove::Direction::Left}) {
        PivotMove move(90.0, direction, controller::robot::kArcTurn);
        MotorWheel left = easyWheel();
        MotorWheel right = stiffWheel();
        controller::SpeedEstimator leftSpeed;
        controller::SpeedEstimator rightSpeed;
        leftSpeed.reset(0.0, 0.0);
        rightSpeed.reset(0.0, 0.0);
        double trueDeg = 0.0;
        double rate = 0.0;
        double minVolts = 0.0;
        PivotMove::Output out{};
        double t = 0.0;
        while (!out.done && t < 3.0) {
            t += kDt;
            const double l = left.encoderMm();
            const double r = right.encoderMm();
            out = move.step(kDt, rate, l, r, leftSpeed.update(l, t), rightSpeed.update(r, t));
            minVolts = std::fmin(minVolts, std::fmin(out.leftVolts, out.rightVolts));
            left.step(out.leftVolts, kDt);
            right.step(out.rightVolts, kDt);
            rate = (left.speed - right.speed) / domain::robot::kWheelTrackMm * kRadToDeg * 0.9;
            trueDeg += rate * kDt;
        }
        ASSERT_TRUE(out.done);
        EXPECT_NEAR(std::fabs(trueDeg), 90.0, 4.0);
        const double innerMm = direction == PivotMove::Direction::Right ? right.position : left.position;
        EXPECT_LT(innerMm, 110.0);
        EXPECT_GT(innerMm, 40.0);
        EXPECT_GE(minVolts, -2.0 - 1e-9);  // a de dentro só freia, até -2 V
        EXPECT_LT(t, 2.0);
    }
}

// Suspenso: o robô não gira, o giroscópio não chega e a curva não termina sozinha (o tempo limite
// do adaptador leva ao Erro, como no C2 do roteiro).
TEST(PivotMoveSimulation, SuspendedRobotNeverFinishesTheTurn) {
    const PivotResult turn = simulatePivot(easyWheel(), easyWheel(), 90.0,
                                           PivotMove::Direction::Right, 1.0, 0.0, true, 3.0);
    EXPECT_FALSE(turn.done);
}

}  // namespace
}  // namespace micromouse::test
