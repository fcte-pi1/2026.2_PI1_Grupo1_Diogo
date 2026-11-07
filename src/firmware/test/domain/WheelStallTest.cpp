#include <gtest/gtest.h>

#include "domain/RobotParameters.hpp"
#include "domain/WheelStall.hpp"

namespace micromouse::domain {
namespace {

constexpr WheelStallConfig kConfig{120, 0.20};

// Teste de 07/11 na pista: "enc E=0 D=123 pot E=0.85". A roda esquerda não girou, e o robô só
// percebeu pelo tempo limite de 3 s, depois de empurrar a parede. Suspenso, a célula ainda
// "terminava" pela média dos dois encoders, com a direita girando em dobro.
TEST(WheelStall, DetectsTheWheelThatDoesNotTurn) {
    EXPECT_EQ(detectStalledWheel(0, 123, kConfig), StalledWheel::Left);
    EXPECT_EQ(detectStalledWheel(130, 6, kConfig), StalledWheel::Right);
    EXPECT_EQ(detectStalledWheel(20, 150, kConfig), StalledWheel::Left);  // 13%: quase parada
}

// Rodas diferentes, mas as duas girando (até 25% de diferença no teste de 04/11): não é roda parada.
TEST(WheelStall, UnequalButTurningWheelsAreFine) {
    EXPECT_EQ(detectStalledWheel(180, 292, kConfig), StalledWheel::None);  // 62%, de 07/11
    EXPECT_EQ(detectStalledWheel(360, 480, kConfig), StalledWheel::None);
    EXPECT_EQ(detectStalledWheel(481, 481, kConfig), StalledWheel::None);
}

// No começo da célula (partida suave, folga da redução), poucos pulsos não dizem nada.
TEST(WheelStall, WaitsForEnoughPulsesBeforeDeciding) {
    EXPECT_EQ(detectStalledWheel(0, 119, kConfig), StalledWheel::None);
    EXPECT_EQ(detectStalledWheel(0, 0, kConfig), StalledWheel::None);
    EXPECT_EQ(detectStalledWheel(0, 120, kConfig), StalledWheel::Left);
}

// Pulsos negativos (roda girando para trás) contam pelo módulo: para trás não é "andar".
TEST(WheelStall, UsesTheMagnitudeOfThePulses) {
    EXPECT_EQ(detectStalledWheel(-5, 200, kConfig), StalledWheel::Left);
    EXPECT_EQ(detectStalledWheel(-200, -190, kConfig), StalledWheel::None);
}

// Valores do robô: a decisão sai antes de 1/3 da célula, e a razão fica longe da diferença
// normal entre as rodas.
TEST(WheelStall, RobotConfigDecidesEarlyAndToleratesUnequalWheels) {
    EXPECT_LT(robot::kWheelStall.minPulses, 481 / 3);
    EXPECT_LE(robot::kWheelStall.minRatio, 0.25);
}

}  // namespace
}  // namespace micromouse::domain
