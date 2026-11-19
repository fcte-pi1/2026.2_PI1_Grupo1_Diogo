#include <gtest/gtest.h>

#include <cmath>

#include "controller/HeadingFusion.hpp"

namespace micromouse::controller {
namespace {

constexpr double kDt = 0.01;

// Peso 0: só o giroscópio (o comportamento de antes).
TEST(HeadingFusion, ZeroWeightIsThePureGyroIntegral) {
    HeadingFusion fusion;
    double heading = 0.0;
    for (int i = 0; i < 100; ++i) {
        heading = fusion.step(2.0, 50.0, kDt, 0.0);  // o encoder dizendo 50 graus não conta
    }
    EXPECT_NEAR(heading, 2.0, 1e-9);  // 2 graus/s por 1 s
}

// O giroscópio tem um desvio de 1 grau/s e o robô, na verdade, anda reto (os encoders dizem 0): o giro
// puro acumula 3 graus em 3 s; a fusão o segura perto de desvio/peso = 1/0,5 = 2 graus no máximo.
TEST(HeadingFusion, EncodersHoldBackTheGyroBias) {
    HeadingFusion fusion;
    double fused = 0.0;
    double pure = 0.0;
    for (int i = 0; i < 300; ++i) {
        fused = fusion.step(1.0, 0.0, kDt, 0.5);
        pure += 1.0 * kDt;
    }
    EXPECT_NEAR(pure, 3.0, 1e-9);
    EXPECT_LT(fused, 2.0);
    EXPECT_GT(fused, 0.0);
}

// Roda patinando: o robô gira de verdade 4 graus (o giroscópio vê, o encoder não). Com o peso baixo a
// fusão ainda acompanha a maior parte do giro verdadeiro.
TEST(HeadingFusion, SlipDoesNotHideAGenuineTurn) {
    HeadingFusion fusion;
    double fused = 0.0;
    for (int i = 0; i < 100; ++i) {
        fused = fusion.step(4.0, 0.0, kDt, 0.5);  // 4 graus/s por 1 s; encoder parado
    }
    EXPECT_GT(fused, 3.0);  // de 4 graus verdadeiros, perde menos de 1 grau
}

// Quando as duas fontes concordam, a fusão não muda nada.
TEST(HeadingFusion, AgreeingSourcesAreUntouched) {
    HeadingFusion fusion;
    double fused = 0.0;
    for (int i = 0; i < 100; ++i) {
        const double truth = 3.0 * (i + 1) * kDt;
        fused = fusion.step(3.0, truth, kDt, 1.0);
    }
    EXPECT_NEAR(fused, 3.0, 1e-6);
}

TEST(HeadingFusion, ResetStartsOver) {
    HeadingFusion fusion;
    (void)fusion.step(10.0, 0.0, 0.5, 0.0);
    fusion.reset();
    EXPECT_DOUBLE_EQ(fusion.heading(), 0.0);
}

// Rumo das rodas: (direita - esquerda) / bitola, positivo para a esquerda; de ré o sinal inverte.
TEST(HeadingFusion, WheelHeadingFollowsTheDifferenceBetweenTheWheels) {
    constexpr double kTrack = 88.0;
    constexpr double kPi = 3.14159265358979323846;
    EXPECT_NEAR(wheelHeadingDeg(0.0, 1.0, kTrack, 1.0), (1.0 / kTrack) * 180.0 / kPi, 1e-9);
    EXPECT_NEAR(wheelHeadingDeg(1.0, 0.0, kTrack, 1.0), -(1.0 / kTrack) * 180.0 / kPi, 1e-9);
    EXPECT_NEAR(wheelHeadingDeg(0.0, 1.0, kTrack, -1.0), -(1.0 / kTrack) * 180.0 / kPi, 1e-9);
    EXPECT_DOUBLE_EQ(wheelHeadingDeg(5.0, 5.0, kTrack, 1.0), 0.0);
}

}  // namespace
}  // namespace micromouse::controller
