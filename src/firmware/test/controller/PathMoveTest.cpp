#include <gtest/gtest.h>

#include <cmath>

#include "controller/PathMove.hpp"
#include "controller/RobotMotion.hpp"
#include "simulation/MotorPlant.hpp"

namespace micromouse::controller {
namespace {

using test::MotorWheel;
constexpr double kDt = 0.002;
constexpr double kPi = 3.14159265358979323846;

// Curva contínua (20/11): aproximação reta + quarto de círculo de raio 90 (no eixo) + reta de saída, num perfil só, sem parar.
PathPlan rightTurn(double approach = 74.0, double exit = 90.0) {
    return {approach, 90.0, 90.0, true, exit, robot::kArcEffectiveTrackMm};
}

TEST(PathPlan, WheelDistancesFollowTheArcGeometry) {
    const PathPlan plan = rightTurn();
    const double arc = 90.0 * kPi / 2.0;
    EXPECT_NEAR(plan.lengthMm(), 74.0 + arc + 90.0, 1e-9);
    const PathPlan::Wheels end = plan.wheelsAt(plan.lengthMm());
    // À direita: a roda de fora é a esquerda, (R + T/2) x 90 graus; a de dentro, (R - T/2) x 90 graus.
    EXPECT_NEAR(end.leftMm, 74.0 + (90.0 + 37.1) * kPi / 2.0 + 90.0, 1e-6);
    EXPECT_NEAR(end.rightMm, 74.0 + (90.0 - 37.1) * kPi / 2.0 + 90.0, 1e-6);
    EXPECT_NEAR(end.headingDeg, -90.0, 1e-9);
    // Na aproximação as duas rodas andam juntas, sem giro.
    const PathPlan::Wheels mid = plan.wheelsAt(50.0);
    EXPECT_NEAR(mid.leftMm, 50.0, 1e-9);
    EXPECT_NEAR(mid.rightMm, 50.0, 1e-9);
    EXPECT_NEAR(mid.headingDeg, 0.0, 1e-9);
    // À esquerda é o espelho.
    PathPlan left = rightTurn();
    left.right = false;
    EXPECT_NEAR(left.wheelsAt(left.lengthMm()).rightMm, end.leftMm, 1e-9);
    EXPECT_NEAR(left.wheelsAt(left.lengthMm()).headingDeg, 90.0, 1e-9);
}

struct PathRun {
    bool done{false};
    double leftMm{0.0}, rightMm{0.0};
    double headingDeg{0.0};      // pela cinemática das rodas (bitola efetiva)
    double minArcSpeed{1e9};     // velocidade do eixo no meio do arco
    double minStartSpeed{1e9};   // nos primeiros 100 ms
    double seconds{0.0};
};

PathRun simulate(const PathPlan& plan, MotorWheel left, MotorWheel right, double startSpeed) {
    // As rodas já andam a `startSpeed` (passagem da reta para a curva sem parar).
    left.speed = startSpeed;
    right.speed = startSpeed;
    PathMove move(plan, robot::kStraightMove, startSpeed);
    SpeedEstimator ls, rs;
    ls.reset(0.0, 0.0);
    rs.reset(0.0, 0.0);
    // Histórico para o estimador já começar com a velocidade certa.
    for (int i = 1; i <= 8; ++i) {
        (void)ls.update(-startSpeed * kDt * (8 - i), -kDt * (8 - i));
        (void)rs.update(-startSpeed * kDt * (8 - i), -kDt * (8 - i));
    }
    PathRun run;
    double heading = 0.0;
    const double arcStart = plan.approachMm, arcEnd = plan.approachMm + plan.radiusMm * plan.angleDeg * kPi / 180.0;
    for (double t = kDt; t < 8.0; t += kDt) {
        const double l = left.encoderMm(), r = right.encoderMm();
        const PathMove::Output out = move.step(kDt, l, r, ls.update(l, t), rs.update(r, t));
        if (out.done) {
            run.done = true;
            run.seconds = t;
            break;
        }
        const double l0 = left.position, r0 = right.position;
        left.step(out.leftVolts, kDt);
        right.step(out.rightVolts, kDt);
        heading += ((right.position - r0) - (left.position - l0)) / plan.trackMm * 180.0 / kPi;
        const double axle = 0.5 * (left.position + right.position);
        const double axleSpeed = 0.5 * (left.speed + right.speed);
        if (axle > arcStart + 20.0 && axle < arcEnd - 20.0) run.minArcSpeed = std::fmin(run.minArcSpeed, axleSpeed);
        if (t < 0.1) run.minStartSpeed = std::fmin(run.minStartSpeed, axleSpeed);
    }
    run.leftMm = left.position;
    run.rightMm = right.position;
    run.headingDeg = heading;
    return run;
}

TEST(PathMoveSimulation, FromRestTheTurnEndsWhereThePlanSaysWithoutStoppingInTheArc) {
    const PathPlan plan = rightTurn();
    const PathRun run = simulate(plan, test::realLeftWheel(), test::realRightWheel(), 0.0);
    ASSERT_TRUE(run.done);
    const PathPlan::Wheels end = plan.wheelsAt(plan.lengthMm());
    EXPECT_NEAR(run.leftMm, end.leftMm, 3.0);
    EXPECT_NEAR(run.rightMm, end.rightMm, 3.0);
    EXPECT_NEAR(run.headingDeg, -90.0, 3.0);
    EXPECT_GT(run.minArcSpeed, 60.0);  // não para no meio do arco
}

TEST(PathMoveSimulation, HandedOffAtCruiseItKeepsMovingAndTurns) {
    const PathPlan plan = rightTurn();
    const PathRun run = simulate(plan, test::realLeftWheel(), test::realRightWheel(), 120.0);
    ASSERT_TRUE(run.done);
    EXPECT_GT(run.minStartSpeed, 90.0);  // a passagem da reta para a curva não freia
    EXPECT_GT(run.minArcSpeed, 90.0);
    EXPECT_NEAR(run.headingDeg, -90.0, 3.0);
}

TEST(PathMoveSimulation, LeftTurnAndStiffWheelAlsoWork) {
    PathPlan plan = rightTurn();
    plan.right = false;
    const PathRun run = simulate(plan, test::easyWheel(), test::stiffWheel(), 120.0);
    ASSERT_TRUE(run.done);
    EXPECT_NEAR(run.headingDeg, 90.0, 4.0);
    const PathPlan::Wheels end = plan.wheelsAt(plan.lengthMm());
    EXPECT_NEAR(run.leftMm, end.leftMm, 4.0);
    EXPECT_NEAR(run.rightMm, end.rightMm, 4.0);
}

TEST(RunProfileFromState, StartsAtTheGivenSpeedAndStopsAtTheTarget) {
    const RunProfile profile(0.0, 120.0, 300.0, robot::kStraightMove.limits);
    EXPECT_NEAR(profile.at(0.0).speed, 120.0, 1e-9);
    EXPECT_NEAR(profile.at(profile.duration()).position, 300.0, 1e-9);
    EXPECT_TRUE(profile.at(profile.duration() + 0.01).finished);
}

}  // namespace
}  // namespace micromouse::controller

namespace micromouse::controller {
namespace {

// Uma correção de rumo positiva (vira mais para a esquerda) adianta a roda direita e atrasa a esquerda.
TEST(PathMoveSteer, PositiveSteerPushesTheRightWheelAhead) {
    const PathPlan plan{50.0, 90.0, 90.0, true, 90.0, robot::kArcEffectiveTrackMm};
    PathMove plain(plan, robot::kStraightMove, 100.0);
    PathMove steered(plan, robot::kStraightMove, 100.0);
    const PathMove::Output a = plain.step(0.01, 0.0, 0.0, 100.0, 100.0, 0.0);
    const PathMove::Output b = steered.step(0.01, 0.0, 0.0, 100.0, 100.0, 10.0);
    EXPECT_GT(b.rightVolts, a.rightVolts);
    EXPECT_LT(b.leftVolts, a.leftVolts);
    EXPECT_NEAR(steered.plannedHeadingDeg(plan.lengthMm()), -90.0, 1e-9);
}

}  // namespace
}  // namespace micromouse::controller

namespace micromouse::controller {
namespace {

// Entrando a 130 mm/s com teto de 80: o perfil freia até o teto, sem ultrapassar a posição, e chega parado.
TEST(RunProfileCeiling, BrakesDownToTheCeilingThenRunsAndStops) {
    ProfileLimits limits = robot::kStraightMove.limits;
    limits.maxSpeed = 80.0;
    const RunProfile profile(0.0, 130.0, 300.0, limits);
    EXPECT_NEAR(profile.at(0.0).speed, 130.0, 1e-9);
    double maxAfter = 0.0, last = -1.0;
    for (double t = 0.0; t < profile.duration() + 0.1; t += 0.005) {
        const RunProfile::Sample s = profile.at(t);
        EXPECT_GE(s.position, last - 1e-9);  // nunca anda para trás
        last = s.position;
        if (t > (130.0 - 80.0) / limits.acceleration + 0.01) maxAfter = std::max(maxAfter, s.speed);
    }
    EXPECT_LE(maxAfter, 80.0 + 1e-6);
    EXPECT_NEAR(profile.at(profile.duration() + 0.01).position, 300.0, 1e-6);
    EXPECT_TRUE(profile.at(profile.duration() + 0.01).finished);
}

TEST(PathMoveSimulation, EnteringFastTheArcRunsAtTheCeilingSpeed) {
    const PathPlan plan{10.0, 90.0, 90.0, true, 90.0, 100.0};
    MotorWheel left = test::realLeftWheel(), right = test::realRightWheel();
    left.speed = right.speed = 130.0;
    PathMove move(plan, robot::kStraightMove, 130.0, 80.0);
    SpeedEstimator ls, rs;
    ls.reset(0.0, 0.0);
    rs.reset(0.0, 0.0);
    for (int i = 1; i <= 8; ++i) {
        (void)ls.update(-130.0 * 0.002 * (8 - i), -0.002 * (8 - i));
        (void)rs.update(-130.0 * 0.002 * (8 - i), -0.002 * (8 - i));
    }
    double arcSpeedMax = 0.0;
    bool done = false;
    for (double t = 0.002; t < 8.0 && !done; t += 0.002) {
        const PathMove::Output out =
            move.step(0.002, left.encoderMm(), right.encoderMm(), ls.update(left.encoderMm(), t), rs.update(right.encoderMm(), t));
        if (out.done) { done = true; break; }
        left.step(out.leftVolts, 0.002);
        right.step(out.rightVolts, 0.002);
        const double axle = 0.5 * (left.position + right.position);
        if (axle > 60.0 && axle < 130.0) arcSpeedMax = std::max(arcSpeedMax, 0.5 * (left.speed + right.speed));
    }
    EXPECT_TRUE(done);
    EXPECT_LT(arcSpeedMax, 95.0);
}

}  // namespace
}  // namespace micromouse::controller
