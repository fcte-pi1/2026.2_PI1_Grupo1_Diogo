#include <gtest/gtest.h>

#include <cstdlib>
#include <limits>

#include "controller/MotionController.hpp"
#include "domain/RobotParameters.hpp"
#include "simulation/StraightLinePlant.hpp"

namespace micromouse::controller {
namespace {

namespace robot = domain::robot;
using test::simulateStraight;
using test::WheelModel;

// Rodas diferentes: a esquerda 25% mais forte e a direita com mais atrito (como em 04/11). Com
// 0,70 e sem correção, a esquerda dá ~2,0 pulsos/ms e a direita ~1,4: a ordem de grandeza dos N20
// de 750 RPM a ~5 V com a redução e o encoder de 285 pulsos por volta.
const WheelModel kStrongLeft{5000.0, 0.30};
const WheelModel kWeakRight{4000.0, 0.35};
constexpr int kRunMs = 600;  // uma célula (~481 pulsos) com folga

MotionController robotController() {
    return MotionController(robot::kStraightGains, robot::kStraightBaseSpeed,
                            robot::kStraightMaxSpeed, robot::kStraightMaxCorrection);
}

// Com os ganhos do robô, o erro converge (as rodas ficam na mesma velocidade) sem a correção chegar
// ao limite, para constantes de tempo do motor de 20 a 50 ms.
TEST(StraightLineSimulation, RobotGainsConvergeWithoutSaturating) {
    for (const double tau : {0.020, 0.030, 0.050}) {
        WheelModel left = kStrongLeft;
        WheelModel right = kWeakRight;
        left.timeConstantS = right.timeConstantS = tau;
        MotionController controller = robotController();
        const test::StraightRunStats run = simulateStraight(controller, left, right, kRunMs);

        EXPECT_EQ(run.saturatedSteps, 0) << "tau " << tau;
        EXPECT_LT(run.maxAbsCorrection, 0.5 * robot::kStraightMaxCorrection) << "tau " << tau;
        EXPECT_LE(std::labs(run.errorChangeLast100ms), 2) << "tau " << tau;  // velocidades iguais
        // Sobra um erro constante (só P): correção / kp. Aqui ~13 pulsos, ~5 mm, ~3 graus de rumo.
        EXPECT_GT(run.finalError, 0) << "tau " << tau;
        EXPECT_LE(run.finalError, 20) << "tau " << tau;
    }
}

// O mesmo com a roda fraca do outro lado: o sinal da correção está certo.
TEST(StraightLineSimulation, RobotGainsCorrectEitherSide) {
    MotionController controller = robotController();
    const test::StraightRunStats run = simulateStraight(controller, kWeakRight, kStrongLeft, kRunMs);
    EXPECT_EQ(run.saturatedSteps, 0);
    EXPECT_LT(run.finalError, 0);
    EXPECT_GE(run.finalError, -20);
}

// Sem correção, a diferença passa de 300 pulsos numa célula: o controle tira mais de 90% disso.
TEST(StraightLineSimulation, CorrectionRemovesMostOfTheDrift) {
    MotionController none({0.0, 0.0, 0.0}, robot::kStraightBaseSpeed, robot::kStraightMaxSpeed);
    const test::StraightRunStats open = simulateStraight(none, kStrongLeft, kWeakRight, kRunMs);
    MotionController controller = robotController();
    const test::StraightRunStats closed =
        simulateStraight(controller, kStrongLeft, kWeakRight, kRunMs);
    EXPECT_GT(open.finalError, 250);
    EXPECT_LT(closed.finalError * 10, open.finalError);
}

// Os ganhos antigos ({0.02, 0, 0.002}, sem limite) na mesma planta: o derivativo sobre pulsos
// inteiros a cada 1 ms leva a correção a 0,70 e zera uma roda, como nos logs de 04/11.
TEST(StraightLineSimulation, OldGainsZeroAWheel) {
    MotionController old({0.02, 0.0, 0.002}, robot::kStraightBaseSpeed, robot::kStraightMaxSpeed);
    const test::StraightRunStats run = simulateStraight(old, kStrongLeft, kWeakRight, kRunMs,
                                                        std::numeric_limits<double>::infinity());
    EXPECT_GE(run.maxAbsCorrection, robot::kStraightBaseSpeed - 1e-9);
    EXPECT_GT(run.saturatedSteps, kRunMs / 10);
}

// Uma roda que quase não gira (04/11: "enc E=0..6" com 85%) satura o controle o tempo todo, e o
// limite de 0,20 não resolve: é mecânica. É assim que a saturação aparece nos números.
TEST(StraightLineSimulation, StuckWheelSaturatesEvenWithTheLimit) {
    const WheelModel stuckLeft{500.0, 0.80};
    MotionController controller = robotController();
    const test::StraightRunStats run = simulateStraight(controller, stuckLeft, kWeakRight, kRunMs);
    EXPECT_GT(run.saturatedSteps, kRunMs / 2);
    EXPECT_LT(run.finalError, -200);
}

}  // namespace
}  // namespace micromouse::controller
