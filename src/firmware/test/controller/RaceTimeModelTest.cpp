#include <gtest/gtest.h>

#include "controller/RaceTimeModel.hpp"
#include "controller/RobotMotion.hpp"

namespace micromouse::controller {
namespace {

// Os limites e o freio do arco no D1 de 16/11 (log_robo.txt, passos 1-11): reta 200 mm/s e 600 mm/s²,
// arco 120 graus/s e 600 graus/s², freio 7 graus (tolerância 7,0).
constexpr StraightMoveConfig kStraight1611{{200.0, 600.0}, robot::kWheelLoop, 0.5, 1.5, 15.0, 0.3, 10.0};
constexpr PivotMoveConfig kArc1611{{120.0, 600.0}, robot::kWheelLoop, robot::kArcEffectiveTrackMm,
                                   0.5, 7.0, 40.0, 30.0, robot::kArcSetbackMm};

// O modelo reproduz o D1 de 16/11: 12 passos em 29,9 s. Passos de reta de uma célula: 1,2 a 1,7 s
// (nav: passo 1, 2, 3 e 5); passos com curva: 3,2 a 4,0 s (passos 4, 6, 7, 8, 9 e 11).
TEST(RaceTimeModel, ReproducesTheD1StepTimesOfNovember16th) {
    const StepTimes times = stepTimes(kStraight1611, kArc1611);
    EXPECT_NEAR(times.straightStepS, 1.5, 1.5 * 0.15);
    EXPECT_NEAR(times.turnStepS, 3.6, 3.6 * 0.15);
    // D1: 6 retas e 6 curvas em 12 passos, 29,9 s.
    EXPECT_NEAR(6 * times.straightStepS + 6 * times.turnStepS, 29.9, 29.9 * 0.15);
}

TEST(RaceTimeModel, TimeToReachAnAngleFollowsTheTrapezoid) {
    const ProfileLimits limits{120.0, 600.0};
    // Rampa de 0,2 s e 12 graus, depois cruzeiro a 120 graus/s.
    EXPECT_NEAR(timeToReach(12.0, 90.0, limits), 0.2, 1e-9);
    EXPECT_NEAR(timeToReach(72.0, 90.0, limits), 0.2 + 60.0 / 120.0, 1e-9);
    // Perto do fim, na frenagem: chega ao alvo antes do perfil acabar.
    EXPECT_LT(timeToReach(89.0, 90.0, limits), TrapezoidProfile(90.0, limits).duration());
    EXPECT_NEAR(timeToReach(90.0, 90.0, limits), TrapezoidProfile(90.0, limits).duration(), 1e-9);
}

// Velocidade de corrida 25% menor (pedido de 19/11): cada limite caiu a 75%.
// Depois (19/11, mesmo dia): o robô balança para a frente e para trás quando freia (a inércia ao parar).
// A frenagem é a aceleração do perfil, então ela cai MAIS que a velocidade: velocidade a 80% e
// aceleração a 50% dos valores de -25%. Perfil de uma célula: ~2,0 s (antes ~1,5 s).
constexpr double kStraightSpeedMinus25 = 150.0, kStraightAccelMinus25 = 450.0;
constexpr double kPivotSpeedMinus25 = 225.0, kPivotAccelMinus25 = 1125.0;
constexpr double kArcSpeedMinus25 = 67.5, kArcAccelMinus25 = 337.5;

TEST(RaceTimeModel, SoftBrakingHasEightyPercentSpeedAndHalfTheAcceleration) {
    EXPECT_DOUBLE_EQ(robot::kStraightMove.limits.maxSpeed, 0.8 * kStraightSpeedMinus25);
    EXPECT_DOUBLE_EQ(robot::kStraightMove.limits.acceleration, 0.5 * kStraightAccelMinus25);
    EXPECT_DOUBLE_EQ(robot::kPivotMove.limits.maxSpeed, 0.8 * kPivotSpeedMinus25);
    EXPECT_DOUBLE_EQ(robot::kPivotMove.limits.acceleration, 0.5 * kPivotAccelMinus25);
    EXPECT_DOUBLE_EQ(robot::kArcTurn.limits.maxSpeed, 0.8 * kArcSpeedMinus25);
    EXPECT_DOUBLE_EQ(robot::kArcTurn.limits.acceleration, 0.5 * kArcAccelMinus25);
    EXPECT_DOUBLE_EQ(robot::kOneWheelTurn.limits.maxSpeed, robot::kArcTurn.limits.maxSpeed);
    EXPECT_DOUBLE_EQ(robot::kOneWheelTurn.limits.acceleration, robot::kArcTurn.limits.acceleration);
}

// A inércia cai junto com a velocidade: o freio (graus antes do alvo) é o de -25% x 0,8.
TEST(RaceTimeModel, BrakeAnglesScaleWithTheSpeed) {
    EXPECT_NEAR(robot::kPivotMove.toleranceDeg, 10.1 * 0.8, 0.05);
    EXPECT_NEAR(robot::kArcTurn.toleranceDeg, 3.2 * 0.8, 0.05);
    EXPECT_NEAR(robot::kOneWheelTurn.toleranceDeg, 3.2 * 0.8, 0.05);
}

// Frenagem suave: a reta de uma célula desacelera a no máximo 0,25 g-ish (225 mm/s²) e a velocidade
// de cruzeiro não passa de 120 mm/s.
TEST(RaceTimeModel, StraightDecelerationIsGentle) {
    EXPECT_LE(robot::kStraightMove.limits.acceleration, 225.0);
    EXPECT_LE(robot::kStraightMove.limits.maxSpeed, 120.0);
    const double cellS = TrapezoidProfile(180.0, robot::kStraightMove.limits).duration();
    EXPECT_GT(cellS, 1.9);
    EXPECT_LT(cellS, 2.2);
}

// A conta antes de aplicar: com as velocidades atuais, o pior caso do 12x4 (guard = 4 x 12 x 4 = 192
// passos, metade deles curvas, como no D1) tem de caber no limite de segurança de 10 min ou o limite
// de tempo é quem para a corrida. O teste registra os dois números.
TEST(RaceTimeModel, WorstCaseOfTheTwelveByFourAgainstTheTenMinuteLimit) {
    const StepTimes now = stepTimes(robot::kStraightMove, robot::kArcTurn);
    const StepTimes before = stepTimes(kStraight1611, kArc1611);
    constexpr int kGuard = 4 * 12 * 4;
    const double worstNow = worstCaseSeconds(kGuard, 0.5, now);
    const double worstBefore = worstCaseSeconds(kGuard, 0.5, before);
    RecordProperty("pior_caso_12x4_antes_s", static_cast<int>(worstBefore));
    RecordProperty("pior_caso_12x4_agora_s", static_cast<int>(worstNow));
    EXPECT_GT(worstNow, worstBefore);                       // mais lento
    EXPECT_GT(now.turnStepS, before.turnStepS);
    // O limite de 10 min existe porque o guard de passos sozinho pode passar dele.
    EXPECT_GT(worstNow, robot::kRaceTimeLimitS);
    // Passos que cabem em 10 min no modelo: acima do que uma corrida normal do 12x4 faz (~60-100).
    EXPECT_GT(robot::kRaceTimeLimitS / (0.5 * now.straightStepS + 0.5 * now.turnStepS), 100.0);
}

// Limite de tempo de segurança: a corrida para com um motivo explícito.
TEST(RaceDeadline, ExpiresOnlyAfterTheLimitAndSaysSo) {
    EXPECT_DOUBLE_EQ(robot::kRaceTimeLimitS, 600.0);
    RaceDeadline deadline(robot::kRaceTimeLimitS);
    EXPECT_FALSE(deadline.expired(0.0));
    EXPECT_FALSE(deadline.expired(599.9));
    EXPECT_TRUE(deadline.expired(600.1));
    char text[96];
    deadline.describe(text, sizeof text, 600.1, 187, 52);
    EXPECT_STREQ(text, "tempo limite de 10 min esgotado: 187 passos, 52 celulas");
}

}  // namespace
}  // namespace micromouse::controller
