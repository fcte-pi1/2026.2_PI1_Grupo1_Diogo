#include <gtest/gtest.h>

#include "domain/Maneuver.hpp"

namespace micromouse::domain {

namespace {

TurnConfig makeConfig() {
    return {
        32.0,  //
        360,   //
        90.0   //
    };
}

TEST(Maneuver, PulsosPara90Graus) { EXPECT_DOUBLE_EQ(pulsesForTurn(makeConfig(), 90.0), 253.125); }

TEST(Maneuver, PulsosEscalamComOAngulo) {
    const TurnConfig config = makeConfig();
    EXPECT_DOUBLE_EQ(pulsesForTurn(config, 180.0), 2.0 * pulsesForTurn(config, 90.0));
}

TEST(Maneuver, SinalNaoAlteraMagnitude) {
    const TurnConfig config = makeConfig();
    EXPECT_DOUBLE_EQ(pulsesForTurn(config, -90.0), pulsesForTurn(config, 90.0));
}

TEST(Maneuver, RejeitaConfiguracaoInvalida) {
    EXPECT_THROW((void)pulsesForTurn({0.0, 360, 90.0}, 90.0), std::invalid_argument);
    EXPECT_THROW((void)pulsesForTurn({32.0, 0, 90.0}, 90.0), std::invalid_argument);
    EXPECT_THROW((void)pulsesForTurn({32.0, 360, -1.0}, 90.0), std::invalid_argument);
}

TEST(Maneuver, GyroComecaZeradoENaoAlcancado) {
    GyroTurnController gyro(90.0, 2.0);
    EXPECT_DOUBLE_EQ(gyro.angle(), 0.0);
    EXPECT_FALSE(gyro.reached());
}

TEST(Maneuver, GyroIntegraAngulo) {
    GyroTurnController gyro(90.0, 2.0);
    gyro.integrate(45.0, 0.1);  // +4.5
    gyro.integrate(45.0, 0.1);  // +4.5 -> 9.0
    EXPECT_DOUBLE_EQ(gyro.angle(), 9.0);
    EXPECT_FALSE(gyro.reached());
}

TEST(Maneuver, GyroAlcancaDentroDaTolerancia) {
    GyroTurnController gyro(90.0, 2.0);
    gyro.integrate(88.0, 1.0);  // 88 >= 90-2 -> alcançado
    EXPECT_TRUE(gyro.reached());
}

TEST(Maneuver, GyroResetZera) {
    GyroTurnController gyro(90.0, 2.0);
    gyro.integrate(90.0, 1.0);
    gyro.reset();
    EXPECT_DOUBLE_EQ(gyro.angle(), 0.0);
    EXPECT_FALSE(gyro.reached());
}

TEST(Maneuver, GyroAlcancaNoSentidoNegativo) {
    GyroTurnController gyro(90.0, 2.0);
    gyro.integrate(-90.0, 1.0);  // -90, |−90| >= 88
    EXPECT_TRUE(gyro.reached());
    EXPECT_DOUBLE_EQ(gyro.angle(), -90.0);
}

// RNF-34: a referência angular é zerada a cada curva concluída. Cada curva começa do zero e
// integra só a deriva do próprio intervalo, e o erro de uma curva não entra na conta da seguinte.
// O teste não mede o rumo absoluto do robô: somadas, as derivas das curvas dão o mesmo total.
TEST(Maneuver, ReferenciaAngularZeraACadaCurva) {
    constexpr double kDriftDegPerS = 0.196;  // desvio parado medido no imu 3 da ESP32-S3
    constexpr double kDt = 0.01;
    constexpr int kTurns = 10;

    // Cada curva começa com a referência zerada, como o pivot() faz com um controlador novo.
    GyroTurnController gyro(90.0, 2.0);
    double driftOfFirstTurn = 0.0;
    double driftOfLastTurn = 0.0;
    for (int turn = 0; turn < kTurns; ++turn) {
        gyro.reset();
        EXPECT_DOUBLE_EQ(gyro.angle(), 0.0);
        double drift = 0.0;
        while (!gyro.reached()) {
            gyro.integrate(90.0 + kDriftDegPerS, kDt);
            drift += kDriftDegPerS * kDt;
        }
        if (turn == 0) driftOfFirstTurn = drift;
        driftOfLastTurn = drift;
    }
    EXPECT_NEAR(driftOfLastTurn, driftOfFirstTurn, 1e-9);
    EXPECT_LT(driftOfLastTurn, 0.5);
}

TEST(Maneuver, GyroIgnoraDtInvalido) {
    GyroTurnController gyro(90.0, 2.0);
    gyro.integrate(1000.0, 0.0);
    gyro.integrate(1000.0, -1.0);
    EXPECT_DOUBLE_EQ(gyro.angle(), 0.0);
}

}  // namespace

}  // namespace micromouse::domain
