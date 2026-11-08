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

// Slow decay (opção RATO_SLOW_DECAY): no tempo desligado do PWM o motor fica freado, e não solto.
// Para a frente, IN1 fica em 1 e o IN2 recebe o PWM do freio (1 - potência).
TEST(BridgeDrive, SlowDecayParaAFrente) {
    const BridgeDuty duty = bridgeDuty(0.6, DecayMode::Slow);
    EXPECT_DOUBLE_EQ(duty.in1, 1.0);
    EXPECT_NEAR(duty.in2, 0.4, 1e-12);
}

TEST(BridgeDrive, SlowDecayParaTras) {
    const BridgeDuty duty = bridgeDuty(-0.6, DecayMode::Slow);
    EXPECT_NEAR(duty.in1, 0.4, 1e-12);
    EXPECT_DOUBLE_EQ(duty.in2, 1.0);
}

TEST(BridgeDrive, SlowDecayNosExtremos) {
    const BridgeDuty full = bridgeDuty(1.0, DecayMode::Slow);
    EXPECT_DOUBLE_EQ(full.in1, 1.0);
    EXPECT_DOUBLE_EQ(full.in2, 0.0);
    const BridgeDuty zero = bridgeDuty(0.0, DecayMode::Slow);  // potência 0 = freio
    EXPECT_DOUBLE_EQ(zero.in1, kBridgeBrake.in1);
    EXPECT_DOUBLE_EQ(zero.in2, kBridgeBrake.in2);
}

// O modo padrão continua o de antes (fast decay).
TEST(BridgeDrive, FastDecayEOPadrao) {
    const BridgeDuty fast = bridgeDuty(0.6, DecayMode::Fast);
    const BridgeDuty standard = bridgeDuty(0.6);
    EXPECT_DOUBLE_EQ(fast.in1, standard.in1);
    EXPECT_DOUBLE_EQ(fast.in2, standard.in2);
}

}  // namespace
}  // namespace micromouse::domain
