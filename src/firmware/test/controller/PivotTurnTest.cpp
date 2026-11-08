#include <gtest/gtest.h>

#include <cmath>

#include "controller/PivotTurn.hpp"
#include "domain/RobotParameters.hpp"

namespace micromouse::controller {
namespace {

constexpr PivotProfile kProfile{0.75, 0.65, 30.0, 2.0};
constexpr double kDt = 0.001;

// Gira à velocidade `degPerSec` até `degrees`, em passos de kDt, e devolve a última potência.
WheelSpeeds turnBy(PivotTurn& turn, double degrees, double degPerSec) {
    WheelSpeeds speeds = turn.step(0.0, kDt);
    const int steps = static_cast<int>(degrees / (std::fabs(degPerSec) * kDt) + 0.5);
    for (int i = 0; i < steps && !turn.done(); ++i) {
        speeds = turn.step(degPerSec, kDt);
    }
    return speeds;
}

// 07/11: no chão as rodas patinavam, os pulsos chegavam ao alvo e a curva era dada por feita com o
// robô parado ou girado só 60-70 graus. Agora só o giroscópio encerra a curva: sem girar, ela não
// termina (quem para é o tempo limite do adapter) e as rodas seguem com a potência de cruzeiro.
TEST(PivotTurn, SoOGiroscopioEncerraACurva) {
    PivotTurn turn(90.0, PivotTurn::Direction::Right, kProfile);
    WheelSpeeds speeds{};
    for (int i = 0; i < 3000; ++i) {
        speeds = turn.step(0.0, kDt);
    }
    EXPECT_FALSE(turn.done());
    EXPECT_DOUBLE_EQ(speeds.left, 0.75);
    EXPECT_DOUBLE_EQ(speeds.right, -0.75);
}

TEST(PivotTurn, SentidoDasRodas) {
    PivotTurn left(90.0, PivotTurn::Direction::Left, kProfile);
    const WheelSpeeds l = left.step(0.0, kDt);
    EXPECT_LT(l.left, 0.0);
    EXPECT_GT(l.right, 0.0);
    PivotTurn right(90.0, PivotTurn::Direction::Right, kProfile);
    const WheelSpeeds r = right.step(0.0, kDt);
    EXPECT_GT(r.left, 0.0);
    EXPECT_LT(r.right, 0.0);
}

TEST(PivotTurn, TerminaDentroDaTolerancia) {
    PivotTurn turn(90.0, PivotTurn::Direction::Left, kProfile);
    turnBy(turn, 87.5, 100.0);
    EXPECT_FALSE(turn.done());
    turnBy(turn, 0.6, 100.0);
    EXPECT_TRUE(turn.done());
    EXPECT_NEAR(turn.angle(), 88.0, 0.2);
    const WheelSpeeds after = turn.step(100.0, kDt);
    EXPECT_DOUBLE_EQ(after.left, 0.0);
    EXPECT_DOUBLE_EQ(after.right, 0.0);
}

// O sinal do giroscópio depende de como a placa foi montada: os dois sentidos contam.
TEST(PivotTurn, GiroNegativoTambemConta) {
    PivotTurn turn(90.0, PivotTurn::Direction::Right, kProfile);
    turnBy(turn, 89.0, -100.0);
    EXPECT_TRUE(turn.done());
}

// Perto do alvo a potência cai em rampa até finalSpeed, para o robô girar menos depois do freio.
TEST(PivotTurn, DesaceleraPertoDoAlvo) {
    PivotTurn turn(90.0, PivotTurn::Direction::Right, kProfile);
    EXPECT_DOUBLE_EQ(turnBy(turn, 50.0, 200.0).left, 0.75);  // faltam 40: cruzeiro
    EXPECT_NEAR(turnBy(turn, 25.0, 200.0).left, 0.70, 0.01);  // faltam 15: metade da rampa
    const WheelSpeeds near = turnBy(turn, 12.8, 200.0);       // faltam ~2,2
    EXPECT_FALSE(turn.done());
    EXPECT_GE(near.left, 0.65);
    EXPECT_LT(near.left, 0.66);
}

// O ângulo usa o intervalo medido entre as leituras: se o laço atrasar (2 ms por volta em vez de
// 1 ms), o ângulo não fica pela metade.
TEST(PivotTurn, IntegraComOIntervaloMedido) {
    PivotTurn turn(90.0, PivotTurn::Direction::Left, kProfile);
    for (int i = 0; i < 450; ++i) {
        (void)turn.step(100.0, 0.002);
    }
    EXPECT_TRUE(turn.done());
    EXPECT_NEAR(turn.angle(), 88.0, 0.3);
}

// Valores do robô: cruzeiro 0,75 (07/11: com 0,60 a curva às vezes não saía) e a potência final
// acima dos 0,60.
TEST(PivotTurn, PerfilDoRobo) {
    EXPECT_DOUBLE_EQ(domain::robot::kPivot.cruiseSpeed, 0.75);
    EXPECT_GT(domain::robot::kPivot.finalSpeed, 0.60);
    EXPECT_LT(domain::robot::kPivot.finalSpeed, domain::robot::kPivot.cruiseSpeed);
    EXPECT_GT(domain::robot::kPivot.slowdownDeg, domain::robot::kPivot.toleranceDeg);
}

}  // namespace
}  // namespace micromouse::controller
