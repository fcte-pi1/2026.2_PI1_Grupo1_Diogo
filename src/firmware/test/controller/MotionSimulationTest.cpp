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
    EXPECT_LT(run.seconds, 2.3);  // freio suave (19/11): ~2,0 s de perfil + assentar (era 1,45 s a 200 mm/s)
}

// Rampa de tensão (soft-start, 19/11): a subida da tensão cai para no máximo 50 V/s e a reta
// ainda chega ao fim da célula, mesmo com a roda dura (que precisa de mais tensão para sair do lugar).
TEST(StraightMoveSimulation, VoltageRampSoftensTheStartAndStillReachesTheCell) {
    const StraightResult hard = simulateStraight(easyWheel(), easyWheel(), kCell);
    const StraightResult soft = simulateStraight(easyWheel(), easyWheel(), kCell, 0.0, 3.0, 50.0);
    ASSERT_TRUE(soft.done);
    EXPECT_GT(hard.maxRiseVoltsPerS, 100.0);  // sem rampa: o empurrão do atrito sobe de uma vez
    EXPECT_LE(soft.maxRiseVoltsPerS, 50.5);   // com rampa: no máximo 50 V/s
    EXPECT_NEAR(soft.leftMm, kCell, 2.0);
    EXPECT_NEAR(soft.rightMm, kCell, 2.0);
    EXPECT_LT(soft.seconds, hard.seconds + 0.4);  // custa pouco tempo
}

TEST(StraightMoveSimulation, VoltageRampStillMovesTheStiffWheelAndKeepsTheWheelsTogether) {
    const StraightResult soft = simulateStraight(easyWheel(), stiffWheel(), kCell, 0.0, 3.0, 50.0);
    ASSERT_TRUE(soft.done);
    EXPECT_NEAR(soft.leftMm, kCell, 3.0);
    EXPECT_NEAR(soft.rightMm, kCell, 3.0);
    EXPECT_LT(soft.maxDifferenceMm, 3.0);
}

// Movimento limpo (20/11): no E15 o robô andava em ARRANCOS (0 a 270 mm/s e de volta a 0, a cada ~0,4 s) com a
// referência em 120 mm/s, porque o empurrão do atrito estático (2,5 V) era somado o tempo todo enquanto a roda
// andava: 3,4 V levariam a roda a ~430 mm/s, o PID derrubava a tensão, a roda parava (parte com 1,7 V) e o empurrão
// voltava. Com rodas de parâmetros reais, a velocidade no meio da reta tem de ficar perto do cruzeiro.
TEST(StraightMoveSimulation, CruiseSpeedIsSteadyWithTheMeasuredWheels) {
    const StraightResult run =
        simulateStraight(realLeftWheel(), realRightWheel(), 3.0 * kCell, 0.0, 8.0, 50.0);
    ASSERT_TRUE(run.done);
    EXPECT_GT(run.minCruiseSpeed, 100.0);  // nenhuma parada: cruzeiro de 120 mm/s
    EXPECT_LT(run.maxCruiseSpeed, 145.0);  // nenhum arranco
    EXPECT_NEAR(run.leftMm, 3.0 * kCell, 3.0);
    EXPECT_NEAR(run.rightMm, 3.0 * kCell, 3.0);
}

// A roda REAL é lenta (constante de tempo de 0,2 a 0,3 s, com a massa do robô e a redução). Com I = 3,0 e D = 0,004
// o controle oscilava de 0 a ~270 mm/s (e até velocidade negativa) a cada ~0,4 s; é o "anda um pouco, para" do E15 de
// 20/11. Aqui a velocidade no meio da reta tem de ficar em volta do cruzeiro, em toda a faixa de inércia e de atrito.
TEST(StraightMoveSimulation, CruiseSpeedStaysSteadyEvenForSlowWheels) {
    for (const double tau : {0.03, 0.10, 0.20, 0.30}) {
        for (const double friction : {0.2, 1.2}) {
            MotorWheel left{0.0075, friction, 1.8, tau};
            MotorWheel right{0.0072, friction, 1.6, tau};
            const StraightResult run = simulateStraight(left, right, 3.0 * kCell, 0.0, 10.0, 50.0);
            ASSERT_TRUE(run.done) << tau << " " << friction;
            EXPECT_GT(run.minCruiseSpeed, 100.0) << "tau " << tau << " atrito " << friction;
            EXPECT_LT(run.maxCruiseSpeed, 145.0) << "tau " << tau << " atrito " << friction;
            EXPECT_NEAR(run.leftMm, 3.0 * kCell, 7.0) << "tau " << tau;
            EXPECT_NEAR(run.rightMm, 3.0 * kCell, 7.0) << "tau " << tau;
        }
    }
}

TEST(StraightMoveSimulation, OneCellIsSmoothWithTheMeasuredWheelsToo) {
    const StraightResult run = simulateStraight(realLeftWheel(), realRightWheel(), kCell, 0.0, 4.0, 50.0);
    ASSERT_TRUE(run.done);
    EXPECT_NEAR(run.leftMm, kCell, 3.0);
    EXPECT_NEAR(run.rightMm, kCell, 3.0);
    EXPECT_LT(run.maxCruiseSpeed, 150.0);
}

// Reta contínua (20/11): três células num movimento só chegam a 540 mm sem parar no meio.
TEST(StraightMoveSimulation, ThreeCellsInOneMoveReachTheEndWithoutStoppingInBetween) {
    const StraightResult run = simulateStraight(easyWheel(), easyWheel(), 3.0 * kCell, 0.0, 6.0, 50.0);
    ASSERT_TRUE(run.done);
    EXPECT_NEAR(run.leftMm, 3.0 * kCell, 2.0);
    EXPECT_NEAR(run.rightMm, 3.0 * kCell, 2.0);
    const StraightResult one = simulateStraight(easyWheel(), easyWheel(), kCell, 0.0, 3.0, 50.0);
    EXPECT_LT(run.seconds, 3.0 * one.seconds - 1.0);  // bem mais rápido que parar em cada célula
}

// Encurtar o alvo andando (o caminho vira na célula que está chegando): a reta para no centro dela.
TEST(StraightMoveSimulation, RetargetWhileMovingStopsAtTheNewCellCenter) {
    constexpr double kDt = 0.002;
    MotorWheel left = easyWheel();
    MotorWheel right = easyWheel();
    controller::StraightMove move(3.0 * kCell, controller::robot::kStraightMove);
    controller::SpeedEstimator leftSpeed;
    controller::SpeedEstimator rightSpeed;
    leftSpeed.reset(0.0, 0.0);
    rightSpeed.reset(0.0, 0.0);
    bool retargeted = false;
    bool done = false;
    for (double t = kDt; t < 6.0 && !done; t += kDt) {
        const double l = left.encoderMm();
        const double r = right.encoderMm();
        // Os ToF laterais (59 mm à frente do eixo) passam o centro da 2a célula: o caminho vira ali.
        if (!retargeted && 0.5 * (l + r) >= 2.0 * kCell - 59.0) {
            ASSERT_TRUE(move.retarget(2.0 * kCell));
            retargeted = true;
        }
        const controller::StraightMove::Output out =
            move.step(kDt, l, r, leftSpeed.update(l, t), rightSpeed.update(r, t));
        done = out.done;
        left.step(out.leftVolts, kDt);
        right.step(out.rightVolts, kDt);
    }
    ASSERT_TRUE(done);
    EXPECT_TRUE(move.reachedTarget());
    EXPECT_NEAR(left.position, 2.0 * kCell, 3.0);
    EXPECT_NEAR(right.position, 2.0 * kCell, 3.0);
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

// Rampa de tensão (soft-start) também no giro: a subida cai para no máximo 50 V/s e a curva ainda termina
// perto de 90 graus, nos dois sentidos.
TEST(PivotMoveSimulation, VoltageRampStillTurnsNinetyAndLimitsTheRise) {
    for (const PivotMove::Direction direction :
         {PivotMove::Direction::Right, PivotMove::Direction::Left}) {
        const PivotResult hard =
            simulatePivot(easyWheel(), easyWheel(), 90.0, direction, 1.0, 0.0);
        const PivotResult soft =
            simulatePivot(easyWheel(), easyWheel(), 90.0, direction, 1.0, 0.0, false, 3.0, 50.0);
        ASSERT_TRUE(soft.done);
        EXPECT_GT(hard.maxRiseVoltsPerS, 100.0);
        EXPECT_LE(soft.maxRiseVoltsPerS, 50.5);
        EXPECT_NEAR(std::fabs(soft.trueDeg), 90.0, 4.0);
        EXPECT_LT(soft.seconds, hard.seconds + 0.5);
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
        // Depois do freio o robô ainda gira (inércia medida no chão).
        trueDeg += std::copysign(kArcBrakeCoastDeg, trueDeg);
        ASSERT_TRUE(out.done);
        EXPECT_NEAR(std::fabs(trueDeg), 90.0, 4.0);
        const double innerMm = direction == PivotMove::Direction::Right ? right.position : left.position;
        EXPECT_LT(innerMm, 110.0);
        EXPECT_GT(innerMm, 40.0);
        EXPECT_GE(minVolts, -2.0 - 1e-9);  // a de dentro só freia, até -2 V
        EXPECT_LT(t, 2.0 / 0.75);  // limite de 16/11, na proporção da velocidade -25% (19/11)
    }
}

// Raio do caminho do arco (16/11, log_robo.txt, 45 arcos com a escala 1,08 do giro): a conta
// (roda de fora - roda de dentro) / ângulo deu bitola efetiva de 74,2 +- 2,3 mm, e a média dos dois
// caminhos / ângulo deu raio de 80,7 +- 2,3 mm no lugar dos 90 mm planejados. O plano usava a
// bitola de projeto (88 mm): o robô gira 88/74,2 = 1,19x mais rápido do que o perfil prevê e fecha o
// arco ~9 mm para dentro e ~9 mm curto (foto do C1: "eixo ~1 cm para dentro da curva").
constexpr double kMeasuredEffectiveTrackMm = 74.2;

TEST(PivotMoveSimulation, ArcPathRadiusMatchesThePlanOnTheRealRobot) {
    constexpr double kDt = 0.002;
    constexpr double kRadToDeg = 57.29577951308232;
    for (const PivotMove::Direction direction :
         {PivotMove::Direction::Right, PivotMove::Direction::Left}) {
        PivotMove move(90.0, direction, controller::robot::kArcTurn);
        MotorWheel left = easyWheel();
        MotorWheel right = easyWheel();
        controller::SpeedEstimator leftSpeed;
        controller::SpeedEstimator rightSpeed;
        leftSpeed.reset(0.0, 0.0);
        rightSpeed.reset(0.0, 0.0);
        double trueDeg = 0.0;
        double rate = 0.0;
        PivotMove::Output out{};
        double t = 0.0;
        while (!out.done && t < 3.0) {
            t += kDt;
            const double l = left.encoderMm();
            const double r = right.encoderMm();
            out = move.step(kDt, rate, l, r, leftSpeed.update(l, t), rightSpeed.update(r, t));
            left.step(out.leftVolts, kDt);
            right.step(out.rightVolts, kDt);
            // O robô gira pela diferença entre as rodas dividida pela bitola EFETIVA.
            rate = (left.speed - right.speed) / kMeasuredEffectiveTrackMm * kRadToDeg;
            trueDeg += rate * kDt;
        }
        ASSERT_TRUE(out.done);
        const double radiusMm = 0.5 * (left.position + right.position) /
                                (std::fabs(trueDeg) / kRadToDeg);
        EXPECT_NEAR(radiusMm, controller::robot::kArcSetbackMm, 2.0);
    }
}

// Curva com UMA roda (item 1, 19/11): a roda de dentro fica parada (raio 0) e a de fora anda um arco de
// raio = bitola, até o giroscópio fechar os 90 graus. O freio inicial é o do arco (4,2 graus):
// PROPOSTA A CONFIRMAR, ainda não há medida de uma roda só no robô (os logs de 16/11 não têm).
TEST(PivotMoveSimulation, OneWheelTurnKeepsTheInnerWheelStillAndClosesNinetyDegrees) {
    constexpr double kDt = 0.002;
    constexpr double kRadToDeg = 57.29577951308232;
    for (const PivotMove::Direction direction :
         {PivotMove::Direction::Left, PivotMove::Direction::Right}) {
        PivotMove move(90.0, direction, controller::robot::kOneWheelTurn);
        MotorWheel left = easyWheel();
        MotorWheel right = stiffWheel();
        controller::SpeedEstimator leftSpeed;
        controller::SpeedEstimator rightSpeed;
        leftSpeed.reset(0.0, 0.0);
        rightSpeed.reset(0.0, 0.0);
        double trueDeg = 0.0;
        double rate = 0.0;
        PivotMove::Output out{};
        double t = 0.0;
        double innerVoltsMax = 0.0;
        while (!out.done && t < 3.0) {
            t += kDt;
            const double l = left.encoderMm();
            const double r = right.encoderMm();
            out = move.step(kDt, rate, l, r, leftSpeed.update(l, t), rightSpeed.update(r, t));
            const double inner = direction == PivotMove::Direction::Left ? out.leftVolts : out.rightVolts;
            innerVoltsMax = std::fmax(innerVoltsMax, std::fabs(inner));
            left.step(out.leftVolts, kDt);
            right.step(out.rightVolts, kDt);
            rate = (left.speed - right.speed) / controller::robot::kArcEffectiveTrackMm * kRadToDeg;
            trueDeg += rate * kDt;
        }
        trueDeg += std::copysign(kArcBrakeCoastDeg, trueDeg);
        ASSERT_TRUE(out.done);
        EXPECT_NEAR(std::fabs(trueDeg), 90.0, 5.0);
        const double innerMm = direction == PivotMove::Direction::Left ? left.position : right.position;
        const double outerMm = direction == PivotMove::Direction::Left ? right.position : left.position;
        EXPECT_LT(std::fabs(innerMm), 6.0);  // a roda de dentro praticamente não anda
        EXPECT_GT(outerMm, 0.6 * controller::robot::kArcEffectiveTrackMm * 1.5708);
        EXPECT_LT(t, 2.0);
        // Sentido de giro certo (no simulador, positivo = a esquerda anda mais = curva à direita).
        EXPECT_EQ(trueDeg > 0.0, direction == PivotMove::Direction::Right);
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
