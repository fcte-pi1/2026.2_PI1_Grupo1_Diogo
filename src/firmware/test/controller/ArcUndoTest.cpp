#include <gtest/gtest.h>

#include <cmath>

#include "controller/ArcUndo.hpp"
#include "controller/RobotMotion.hpp"

namespace micromouse::controller {
namespace {

constexpr double kDt = 0.002;

// Roda o desfazer com o giroscópio dando `rateDegPerS` (com o sinal do giro a favor de voltar).
// Devolve o estado final e o tempo gasto.
struct UndoRun {
    ArcUndo::State state{ArcUndo::State::Running};
    double seconds{0.0};
    double angle{0.0};
};

UndoRun runUndo(double startDeg, bool right, double rateDegPerS) {
    ArcUndo undo(startDeg, right);
    UndoRun result;
    // Voltar de um arco à direita (ângulo negativo) é girar para a esquerda (taxa positiva).
    const double signedRate = startDeg < 0.0 ? rateDegPerS : -rateDegPerS;
    for (double t = kDt; t < 5.0; t += kDt) {
        const ArcUndo::Output out = undo.step(kDt, signedRate);
        result.state = out.state;
        result.seconds = t;
        result.angle = undo.angle();
        if (out.state != ArcUndo::State::Running) {
            break;
        }
    }
    return result;
}

TEST(ArcUndo, ReturnsToZeroWhenTheRobotTurnsBack) {
    const UndoRun r = runUndo(-56.7, true, 80.0);
    EXPECT_EQ(r.state, ArcUndo::State::Done);
    EXPECT_LE(std::fabs(r.angle), robot::kArcUndoDoneDeg);
    EXPECT_LT(r.seconds, robot::kArcUndoTimeoutS);
}

TEST(ArcUndo, RightArcReversesWithTheOuterWheelStronger) {
    ArcUndo right(-56.7, true);
    const ArcUndo::Output r = right.step(kDt, 0.0);
    EXPECT_DOUBLE_EQ(r.leftVolts, -robot::kArcUndoOuterVolts);  // roda de fora = esquerda
    EXPECT_DOUBLE_EQ(r.rightVolts, -robot::kArcUndoInnerVolts);
    ArcUndo left(56.7, false);
    const ArcUndo::Output l = left.step(kDt, 0.0);
    EXPECT_DOUBLE_EQ(l.leftVolts, -robot::kArcUndoInnerVolts);
    EXPECT_DOUBLE_EQ(l.rightVolts, -robot::kArcUndoOuterVolts);
}

// C8 t1 (16/11, log_robo.txt:1163): o robô preso ou segurado, rodas patinando (enc E=-249 D=-110) e o
// giro só foi de -56,7 para -51,9 graus em 1501 ms (~3 graus/s). Antes o desfazer girava as rodas
// até o tempo limite e só então dizia "NAO voltou". Agora para ao ver que não há progresso.
TEST(ArcUndo, StopsEarlyWhenTheGyroShowsNoProgress) {
    const UndoRun r = runUndo(-56.7, true, 3.2);
    EXPECT_EQ(r.state, ArcUndo::State::NoProgress);
    EXPECT_LT(r.seconds, robot::kArcUndoTimeoutS);
    EXPECT_GT(std::fabs(r.angle), robot::kArcUndoDoneDeg);  // o robô continua torto
}

TEST(ArcUndo, CompletelyJammedRobotNeverReportsDone) {
    for (const bool right : {true, false}) {
        const UndoRun r = runUndo(right ? -57.0 : 57.0, right, 0.0);
        EXPECT_EQ(r.state, ArcUndo::State::NoProgress);
    }
}

// Avança, mas devagar demais para chegar a tempo: o tempo limite continua valendo.
TEST(ArcUndo, SlowButProgressingRobotEndsByTimeout) {
    const UndoRun r = runUndo(-56.7, true, 20.0);
    EXPECT_EQ(r.state, ArcUndo::State::Timeout);
    EXPECT_NEAR(r.seconds, robot::kArcUndoTimeoutS, 0.01);
}

TEST(ArcUndo, PassingZeroCountsAsBack) {
    const UndoRun r = runUndo(-6.0, true, 300.0);
    EXPECT_EQ(r.state, ArcUndo::State::Done);
}


// Corrida SERPENTINA-2 (20/11): o arco travou a -66,3 graus e o desfazer, em vez de voltar a 0, foi para -97,3
// (o robô, calçado nas paredes, girou mais 31 graus para o lado ERRADO). Isso contava como "progresso" e as rodas
// ficaram a 5 V por 1,5 s (E=-1160 D=-468 pulsos, a "ré violenta"). O desfazer tem de parar assim que o ângulo se
// afasta do zero.
TEST(ArcUndo, StopsAsSoonAsTheAngleMovesAwayFromZero) {
    ArcUndo undo(-66.3, true);
    ArcUndo::Output out{};
    double seconds = 0.0;
    // O giroscópio dá taxa NEGATIVA (continua para a direita): o oposto do que o desfazer quer.
    for (double t = kDt; t < 2.0; t += kDt) {
        out = undo.step(kDt, -60.0);
        seconds = t;
        if (out.state != ArcUndo::State::Running) break;
    }
    EXPECT_EQ(out.state, ArcUndo::State::WrongWay);
    EXPECT_DOUBLE_EQ(out.leftVolts, 0.0);
    EXPECT_DOUBLE_EQ(out.rightVolts, 0.0);
    EXPECT_LT(seconds, 0.4);                       // para logo, não depois de 1,5 s
    EXPECT_LT(std::fabs(undo.angle()), 66.3 + robot::kArcUndoWrongWayDeg + 3.0);  // quase não piora
}

// A ré do desfazer é mais suave: o robô calçado nas paredes não pode ser sacudido a 5 V.
TEST(ArcUndo, VoltagesAreGentle) {
    EXPECT_LE(robot::kArcUndoOuterVolts, 3.5);
    EXPECT_LE(robot::kArcUndoInnerVolts, 2.0);
    EXPECT_LE(robot::kArcUndoTimeoutS, 1.2);
}

}  // namespace
}  // namespace micromouse::controller
