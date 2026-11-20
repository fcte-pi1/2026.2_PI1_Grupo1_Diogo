#include <gtest/gtest.h>

#include <algorithm>
#include <cmath>

#include "domain/Calibration.hpp"
#include "domain/RobotGeometry.hpp"
#include "domain/WallCentering.hpp"

namespace micromouse::domain {
namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr double kDeg = kPi / 180.0;
using robot::kCorridorWidthMm;
using robot::lateralPoseConfig;

// Leitura de um ToF lateral com o eixo deslocado `rightMm` para a DIREITA do centro do corredor e o
// robô girado `headingDeg` para a ESQUERDA: o sensor fica `aheadMm` à frente do eixo e se desloca
// aheadMm x tan(rumo) para o lado (modelo do item 4, sem o cos do rumo: 1,5% a 10 graus).
SideReading leftReading(double rightMm, double headingDeg, const Calibration& c) {
    const double sensorRight = rightMm - c.sideTofAheadOfAxleMm * std::tan(headingDeg * kDeg);
    return {true, kCorridorWidthMm / 2.0 - c.sideTofToCenterMm + sensorRight};
}
SideReading rightReading(double rightMm, double headingDeg, const Calibration& c) {
    const double sensorRight = rightMm - c.sideTofAheadOfAxleMm * std::tan(headingDeg * kDeg);
    return {true, kCorridorWidthMm / 2.0 - c.sideTofToCenterMm - sensorRight};
}

TEST(LateralPose, TwoWallsGiveTheAxleOffsetEvenWhenTheRobotIsTurned) {
    const Calibration c;
    const LateralPoseConfig config = lateralPoseConfig(c);
    for (const double offset : {-12.0, 0.0, 7.5}) {
        for (const double heading : {-4.0, 0.0, 3.0}) {
            const LateralPose pose = estimateLateralPose(
                leftReading(offset, heading, c), rightReading(offset, heading, c), heading, config);
            ASSERT_TRUE(pose.valid);
            EXPECT_NEAR(pose.rightOffsetMm, offset, 0.01) << offset << " " << heading;
        }
    }
}

// O ToF lateral fica 59 mm à frente do eixo: 5 graus de rumo enganam a conta por ~5 mm se o rumo
// não for descontado. (A diferença das duas paredes anula o efeito, uma parede só não.)
TEST(LateralPose, OneWallNeedsTheHeadingCorrection) {
    const Calibration c;
    const LateralPoseConfig config = lateralPoseConfig(c);
    const double heading = 5.0;
    const SideReading left = leftReading(0.0, heading, c);
    const SideReading none{};
    const LateralPose pose = estimateLateralPose(left, none, heading, config);
    ASSERT_TRUE(pose.valid);
    EXPECT_NEAR(pose.rightOffsetMm, 0.0, 0.01);
    // Sem o termo do rumo, o erro seria de 59,15 x tan(5 graus) = 5,2 mm.
    const double naive = left.mm - config.centerMm;
    EXPECT_NEAR(std::fabs(naive), c.sideTofAheadOfAxleMm * std::tan(heading * kDeg), 0.01);
    EXPECT_GT(std::fabs(naive), 5.0);
    const SideReading right = rightReading(-6.0, -2.0, c);
    const LateralPose other = estimateLateralPose(none, right, -2.0, config);
    ASSERT_TRUE(other.valid);
    EXPECT_NEAR(other.rightOffsetMm, -6.0, 0.01);
}

TEST(LateralPose, NominalReadingIsTheCorridorHalfMinusTheSensorOffset) {
    const Calibration c;
    EXPECT_NEAR(lateralPoseConfig(c).centerMm, 33.5, 1e-9);
}

// Nunca usa leitura inválida, 0 mm (muito perto, P1), parede longe nem rumo grande.
TEST(LateralPose, IgnoresInvalidTooCloseAndFarReadings) {
    const Calibration c;
    const LateralPoseConfig config = lateralPoseConfig(c);
    const SideReading none{};
    EXPECT_FALSE(estimateLateralPose(none, none, 0.0, config).valid);
    EXPECT_FALSE(estimateLateralPose({false, 30.0}, {false, 30.0}, 0.0, config).valid);
    EXPECT_FALSE(estimateLateralPose({true, 0.0}, {true, 0.0}, 0.0, config).valid);  // 0 mm
    EXPECT_FALSE(estimateLateralPose({true, 300.0}, {true, 250.0}, 0.0, config).valid);
    // Uma parede boa e a outra 0 mm: só a boa.
    const LateralPose one = estimateLateralPose({true, 0.0}, {true, 40.0}, 0.0, config);
    ASSERT_TRUE(one.valid);
    EXPECT_FALSE(one.usedBoth);
    EXPECT_NEAR(one.rightOffsetMm, config.centerMm - 40.0, 1e-9);
}

// Com giro grande a correção desliga: o robô está torto, não deslocado.
TEST(LateralPose, TurnsOffWhenTheHeadingIsLarge) {
    const Calibration c;
    const LateralPoseConfig config = lateralPoseConfig(c);
    const double limit = config.maxHeadingDeg;
    EXPECT_TRUE(estimateLateralPose(leftReading(0, limit - 0.1, c), rightReading(0, limit - 0.1, c),
                                    limit - 0.1, config)
                    .valid);
    EXPECT_FALSE(estimateLateralPose(leftReading(0, limit + 0.1, c), rightReading(0, limit + 0.1, c),
                                     limit + 0.1, config)
                     .valid);
    EXPECT_FALSE(estimateLateralPose(leftReading(0, -limit - 1, c), rightReading(0, -limit - 1, c),
                                     -limit - 1, config)
                     .valid);
}

TEST(LateralPose, CorrectionIsLimitedAndZeroWithoutAPose) {
    const WallCenteringConfig wall{33.5, 70.0, 0.8, 16.0};
    LateralPose pose{true, 100.0, true};
    EXPECT_DOUBLE_EQ(lateralCorrectionPulses(pose, wall), 16.0);
    pose.rightOffsetMm = -100.0;
    EXPECT_DOUBLE_EQ(lateralCorrectionPulses(pose, wall), -16.0);
    pose.rightOffsetMm = 10.0;
    EXPECT_DOUBLE_EQ(lateralCorrectionPulses(pose, wall), 8.0);
    pose.valid = false;
    EXPECT_DOUBLE_EQ(lateralCorrectionPulses(pose, wall), 0.0);
}

// Deriva simulada (19/11): a cada célula o robô ganha um erro de rumo de 1 grau (giroscópio e rodas
// não perfeitos). Sem correção ele sai do corredor; com a estimativa (ToF a 59 mm do eixo, rumo
// compensado) o erro lateral depois de 12 células fica abaixo de 5 mm. Tolerância: PROPOSTA a
// confirmar com a pista.
struct Drift {
    double offsetMm;   // deslocamento do eixo para a direita
    double maxAbsMm;
};

Drift simulate(bool correct, int cells, double driftDegPerCell, double noiseMm) {
    const Calibration c;
    const LateralPoseConfig config = lateralPoseConfig(c);
    double y = 0.0;        // eixo, para a direita
    double heading = 0.0;  // graus, para a esquerda
    double maxAbs = 0.0;
    unsigned seed = 12345;
    auto noise = [&seed, noiseMm]() {
        seed = seed * 1664525U + 1013904223U;
        return noiseMm * (static_cast<double>(seed >> 8) / static_cast<double>(1U << 24) - 0.5) * 2.0;
    };
    constexpr double kStepMm = 10.0;
    for (int cell = 0; cell < cells; ++cell) {
        heading -= driftDegPerCell;  // deriva: o robô vai virando para a direita
        for (double x = 0.0; x < 180.0; x += kStepMm) {
            if (correct) {
                const SideReading left = leftReading(y, heading, c);
                const SideReading right = rightReading(y, heading, c);
                const LateralPose pose = estimateLateralPose({true, left.mm + noise()},
                                                             {true, right.mm + noise()},
                                                             heading + noise() * 0.1, config);
                if (pose.valid) {
                    // Direção: deslocado para a direita pede girar para a esquerda; o rumo vai
                    // para o alvo proporcional ao erro, limitado a 4 graus.
                    const double target = std::clamp(0.4 * pose.rightOffsetMm, -4.0, 4.0);
                    heading += 0.5 * (target - heading);
                }
            }
            y += kStepMm * std::tan(heading * kDeg) * -1.0;  // rumo para a esquerda = y diminui
            maxAbs = std::max(maxAbs, std::fabs(y));
        }
    }
    return {y, maxAbs};
}

TEST(LateralPose, DriftOverTwelveCellsStaysUnderFiveMillimetresWhenCorrected) {
    const Drift free = simulate(false, 12, 1.0, 0.0);
    EXPECT_GT(free.maxAbsMm, 50.0);  // sem correção, sai do corredor (folga de 30 mm por lado)
    const Drift corrected = simulate(true, 12, 1.0, 1.0);
    EXPECT_LT(std::fabs(corrected.offsetMm), 5.0);
    EXPECT_LT(corrected.maxAbsMm, 10.0);
}


// Corredor de teste de 150 mm (20/11): com uma parede só, o alvo do ToF lateral é meio corredor menos o ToF até
// o centro. Com 168 mm são 33,5; com 150, 24,5. Sem isto o robô era empurrado ~9 mm para a parede oposta.
TEST(LateralPoseCorridor, TheSingleWallTargetFollowsTheCorridorWidth) {
    Calibration c;
    EXPECT_NEAR(lateralPoseConfig(c).centerMm, 33.5, 1e-9);  // padrão: 168 mm
    c.corridorWidthMm = 150.0;
    EXPECT_NEAR(lateralPoseConfig(c).centerMm, 24.5, 1e-9);
    // A folga lateral do robô de 108 mm também acompanha: (150 - 108) / 2 = 21 mm por lado.
    EXPECT_NEAR(robot::lateralClearanceMm(c), 21.0, 1e-9);
}

// Só o esquerdo lê (o direito está perto demais): com o corredor de 150, estar no centro é ler 24,5 e o erro some.
TEST(LateralPoseCorridor, OneWallAtTheRealCenterReadsZeroOffsetWithTheRightWidth) {
    Calibration c;
    c.corridorWidthMm = 150.0;
    const LateralPose pose = estimateLateralPose({true, 24.5}, {false, 0.0}, 0.0, lateralPoseConfig(c));
    ASSERT_TRUE(pose.valid);
    EXPECT_NEAR(pose.rightOffsetMm, 0.0, 1e-9);
    c.corridorWidthMm = 168.0;  // com o valor errado, o robô acharia que está 9 mm para a direita
    const LateralPose wrong = estimateLateralPose({true, 24.5}, {false, 0.0}, 0.0, lateralPoseConfig(c));
    EXPECT_NEAR(wrong.rightOffsetMm, -9.0, 1e-9);
}


// Corrida SERPENTINA-4 (20/11): na ré de 2 células o robô estava centrado com as DUAS paredes (E=20, D=22). Aos 2,7 s a
// parede direita acabou (a abertura da curva) e a estimativa passou para UMA parede, comparando o E com um valor fixo
// (meio corredor de 168 menos o ToF até o centro: 28,5). O corredor real mede ~153 (o centro é E=21): ela achou que o
// robô estava 8 a 14 mm fora do centro, corrigiu para o lado errado e a curva começou colada na parede.
// O centro aprendido com as duas paredes vale para a parede que sobrou.
TEST(LateralPoseLearnedCenter, WhenOneWallDisappearsTheLearnedCenterKeepsTheRobotWhereItWas) {
    Calibration c;
    c.sideTofToCenterMm = 55.5;  // medida de 20/11: corredor de 168 e laterais a 55,5: centro fixo em 28,5
    LateralPoseConfig config = lateralPoseConfig(c);
    ASSERT_NEAR(config.centerMm, 28.5, 1e-9);
    // Duas paredes, E=21 e D=21: centrado, e o centro daquela parede é 21.
    const LateralPose both = estimateLateralPose({true, 21.0}, {true, 21.0}, 0.0, config);
    ASSERT_TRUE(both.valid);
    EXPECT_NEAR(both.rightOffsetMm, 0.0, 1e-9);
    // A direita some. Com o centro fixo, o robô "está 7,5 mm à esquerda" (errado); com o aprendido, está no centro.
    const LateralPose fixedCenter = estimateLateralPose({true, 21.0}, {false, 0.0}, 0.0, config);
    EXPECT_NEAR(fixedCenter.rightOffsetMm, -7.5, 1e-9);
    config.leftCenterMm = 21.0;
    config.rightCenterMm = 21.0;
    const LateralPose learned = estimateLateralPose({true, 21.0}, {false, 0.0}, 0.0, config);
    EXPECT_NEAR(learned.rightOffsetMm, 0.0, 1e-9);
    // E o inverso: some a esquerda.
    const LateralPose rightOnly = estimateLateralPose({false, 0.0}, {true, 21.0}, 0.0, config);
    EXPECT_NEAR(rightOnly.rightOffsetMm, 0.0, 1e-9);
}

TEST(LateralPoseLearnedCenter, LearnedCentersFollowTheMeasuredCorridor) {
    // O centro de cada lado: a leitura menos o desvio estimado (esquerda) ou mais o desvio (direita).
    const LateralPoseCenters centers = learnCenters({true, 24.0}, {true, 18.0}, 3.0);
    EXPECT_NEAR(centers.leftMm, 21.0, 1e-9);   // 24 - 3
    EXPECT_NEAR(centers.rightMm, 21.0, 1e-9);  // 18 + 3
}

// Sem aprendizado (centros em 0) tudo continua como antes.
TEST(LateralPoseLearnedCenter, WithoutLearningTheFixedCenterStillApplies) {
    const LateralPoseConfig config = lateralPoseConfig(Calibration{});
    EXPECT_DOUBLE_EQ(config.leftCenterMm, 0.0);
    EXPECT_DOUBLE_EQ(config.rightCenterMm, 0.0);
    const LateralPose pose = estimateLateralPose({true, 35.5}, {false, 0.0}, 0.0, config);
    EXPECT_NEAR(pose.rightOffsetMm, 2.0, 1e-9);  // 35,5 - 33,5 (o padrão de 168 e 50,5)
}

}  // namespace
}  // namespace micromouse::domain
