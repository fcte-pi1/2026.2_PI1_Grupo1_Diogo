#include <gtest/gtest.h>

#include "controller/RobotMotion.hpp"
#include "domain/Maneuver.hpp"
#include "domain/RobotParameters.hpp"

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

// Início da curva em arco pelo ToF frontal, com os valores do robô (controller::robot::kArcStart).
TEST(Maneuver, ArcoComParedeNestaCelulaPosicionaPeloFrontal) {
    const ArcStartConfig& config = controller::robot::kArcStart;
    // A2 em 09/11 (C3q): o frontal lia 39 mm na parada. Recua até ele ler o alvo.
    const ArcStart a2 = arcStart(true, 39.0, config);
    EXPECT_TRUE(a2.byFrontWall);
    EXPECT_DOUBLE_EQ(a2.setbackMm, controller::robot::kArcStartFrontMm - 39.0);
    // A4 em 09/11: 76 mm na parada.
    const ArcStart a4 = arcStart(true, 76.0, config);
    EXPECT_TRUE(a4.byFrontWall);
    EXPECT_DOUBLE_EQ(a4.setbackMm, controller::robot::kArcStartFrontMm - 76.0);
}

// A parede do fim da célula SEGUINTE (208-250 mm em 09/11) não é "parede à frente": antes de 10/11
// ela fazia o robô avançar ~120 mm para dentro da célula seguinte antes do arco.
TEST(Maneuver, ArcoNaoAvancaParaAParedeDaCelulaSeguinte) {
    const ArcStartConfig& config = controller::robot::kArcStart;
    for (const double frontMm : {208.0, 214.0, 239.0, 249.0}) {
        const ArcStart start = arcStart(true, frontMm, config);
        EXPECT_FALSE(start.byFrontWall) << frontMm;
        EXPECT_DOUBLE_EQ(start.setbackMm, controller::robot::kArcStartSetbackMm) << frontMm;
        EXPECT_GT(start.setbackMm, 0.0) << frontMm;  // recua, nunca avança
    }
    // Toda parede da própria célula vista em 09/11 (38 a 87 mm no centro) continua valendo.
    for (const double frontMm : {27.0, 38.0, 60.0, 79.0, 87.0}) {
        EXPECT_TRUE(arcStart(true, frontMm, config).byFrontWall) << frontMm;
    }
}

TEST(Maneuver, ArcoSemLeituraValidaUsaORecuoFixo) {
    const ArcStartConfig& config = controller::robot::kArcStart;
    const ArcStart start = arcStart(false, -1.0, config);
    EXPECT_FALSE(start.byFrontWall);
    EXPECT_DOUBLE_EQ(start.setbackMm, controller::robot::kArcStartSetbackMm);
}

// Segunda leitura, com o robô parado depois do recuo: corrige uma vez o que passar da tolerância.
TEST(Maneuver, ArcoCorrigeAPosicaoPelaSegundaLeitura) {
    const ArcStartConfig& config = controller::robot::kArcStart;
    const double target = controller::robot::kArcStartFrontMm;
    EXPECT_DOUBLE_EQ(arcStartCorrection(true, target, config), 0.0);
    EXPECT_DOUBLE_EQ(arcStartCorrection(true, target - 3.0, config), 0.0);  // dentro da tolerância
    EXPECT_DOUBLE_EQ(arcStartCorrection(true, target - 20.0, config), 20.0);  // perto demais: recua
    EXPECT_DOUBLE_EQ(arcStartCorrection(true, target + 12.0, config), -12.0);  // longe: avança
    // Um erro grande (robô muito perto da parede, como no C3j de 09/11): o ajuste é limitado.
    EXPECT_DOUBLE_EQ(arcStartCorrection(true, target - 60.0, config),
                     controller::robot::kArcStartMaxCorrectionMm);
    // Sem medida válida, ou com a parede já fora da célula, não mexe.
    EXPECT_DOUBLE_EQ(arcStartCorrection(false, 50.0, config), 0.0);
    EXPECT_DOUBLE_EQ(arcStartCorrection(true, 210.0, config), 0.0);
}

// Curva travada: o giroscópio para de girar com os motores ligados.
TEST(Maneuver, CurvaTravadaEDetectadaEmMenosDeUmSegundo) {
    TurnStallDetector stall(controller::robot::kTurnStall);
    // Como o arco de A2 em 09/11: gira até ~52 graus e prende.
    double angle = 0.0;
    double stalledAt = -1.0;
    for (double t = 0.0; t < 3.0; t += 0.002) {
        if (angle < 52.0) angle += 100.0 * 0.002;
        if (stall.update(t, angle)) {
            stalledAt = t;
            break;
        }
    }
    ASSERT_GT(stalledAt, 0.0);
    EXPECT_LT(stalledAt, 1.5);  // antes eram 3 s patinando contra a parede
}

TEST(Maneuver, CurvaLentaMasGirandoNaoETravamento) {
    TurnStallDetector stall(controller::robot::kTurnStall);
    // "Continuando devagar" a 40 graus/s (kArcTurn) por 3 s: lenta, mas não travada.
    bool stalled = false;
    for (double t = 0.0; t < 3.0; t += 0.002) {
        stalled = stalled || stall.update(t, 40.0 * t);
    }
    EXPECT_FALSE(stalled);
}

TEST(Maneuver, CurvaNaoETravamentoEnquantoSaiDoLugar) {
    TurnStallDetector stall(controller::robot::kTurnStall);
    // Parado no começo (atrito estático) e depois girando normalmente.
    bool stalled = false;
    for (double t = 0.0; t < 1.5; t += 0.002) {
        const double angle = t < 0.25 ? 0.0 : 120.0 * (t - 0.25);
        stalled = stalled || stall.update(t, angle);
    }
    EXPECT_FALSE(stalled);
}

// A geometria do corpo decide onde o arco começa e mostra por que o giro no lugar não cabe.
TEST(Maneuver, GeometriaDoCorpoDaOInicioDoArco) {
    const BodyGeometry body{87.0, 50.0, 87.0};
    EXPECT_NEAR(pivotCornerRadiusMm(body), 100.3, 0.1);
    EXPECT_NEAR(arcOuterCornerRadiusMm(body, 90.0), 164.8, 0.1);
    EXPECT_NEAR(arcStartFrontMm(body, 90.0, 27.0), 104.8, 0.1);
    // 5 mm a mais de frente no chassi pedem ~2,7 mm a mais de distância no início do arco.
    const BodyGeometry longer{92.0, 50.0, 87.0};
    EXPECT_GT(arcStartFrontMm(longer, 90.0, 27.0), arcStartFrontMm(body, 90.0, 27.0) + 2.0);
}

TEST(Maneuver, GiroNoLugarNaoCabeNoCorredorComOCorpoAtual) {
    // Corredor: célula de 180 mm menos a parede de 12 mm = 84 mm livres para cada lado do centro.
    constexpr double kHalfCorridorMm = (180.0 - 12.0) / 2.0;
    EXPECT_GT(pivotCornerRadiusMm(robot::kBody), kHalfCorridorMm);
    // E o arco, com os valores do robô, começa numa leitura que ainda é "parede desta célula".
    EXPECT_LT(controller::robot::kArcStartFrontMm, controller::robot::kArcFrontWallMaxMm);
    EXPECT_GT(controller::robot::kArcStartFrontMm, 90.0);
}

}  // namespace

}  // namespace micromouse::domain
