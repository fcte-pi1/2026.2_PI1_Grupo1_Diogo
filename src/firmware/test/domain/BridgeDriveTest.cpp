#include <gtest/gtest.h>

#include "domain/BridgeDrive.hpp"

namespace micromouse::domain {
namespace {

// Tabela do DRV8833: IN1 = IN2 = 0 deixa o motor solto (roda livre) e IN1 = IN2 = 1 curto-circuita o
// motor (freio). Antes, o brake() mandava 0 nas duas entradas: o robô seguia deslizando depois da
// célula e da curva, e esse resto não entrava na odometria (os encoders zeram a cada célula).
TEST(BridgeDrive, FreioCurtoCircuitaOMotor) {
    EXPECT_DOUBLE_EQ(kBridgeBrake.in1, 1.0);
    EXPECT_DOUBLE_EQ(kBridgeBrake.in2, 1.0);
}

TEST(BridgeDrive, ParaAFrentePwmNoIn1) {
    const BridgeDuty duty = bridgeDuty(0.6);
    EXPECT_DOUBLE_EQ(duty.in1, 0.6);
    EXPECT_DOUBLE_EQ(duty.in2, 0.0);
}

TEST(BridgeDrive, ParaTrasPwmNoIn2) {
    const BridgeDuty duty = bridgeDuty(-0.6);
    EXPECT_DOUBLE_EQ(duty.in1, 0.0);
    EXPECT_DOUBLE_EQ(duty.in2, 0.6);
}

TEST(BridgeDrive, ComandoLimitadoAUm) {
    EXPECT_DOUBLE_EQ(bridgeDuty(1.7).in1, 1.0);
    EXPECT_DOUBLE_EQ(bridgeDuty(-1.7).in2, 1.0);
}

}  // namespace
}  // namespace micromouse::domain
