#include <gtest/gtest.h>

#include "domain/ArcClearance.hpp"
#include "domain/Calibration.hpp"

namespace micromouse::domain {
namespace {

// Modelo do arco numa curva em L (20/11): o robô começa a `setback` mm antes do centro da célula e percorre um quarto de
// círculo de raio `setback` em volta do canto de dentro; as paredes são a da esquerda, a da frente e o bloco de dentro.
// Desvio lateral + = para a direita (lado de dentro); longitudinal + = mais perto da parede da frente.

ArcBody realBody() { return {100.0, 17.25, 56.0, 0.0}; }
ArcBody oldBody() { return {87.0, 17.25, 50.5, 0.0}; }

TEST(ArcClearance, CenteredRobotFitsAndFarFromTheWallDoesNot) {
    EXPECT_GT(arcMinClearanceMm(realBody(), 0.0, -14.0, 168.0, 90.0), 5.0);
    EXPECT_LT(arcMinClearanceMm(realBody(), 0.0, +10.0, 168.0, 90.0), 0.0);  // perto demais da parede da frente
    EXPECT_LT(arcMinClearanceMm(realBody(), 0.0, -40.0, 168.0, 90.0), 0.0);  // longe demais: o lado de dentro bate
}

// O robô REAL (frente 100, largura 112) só cabe começando entre ~24 e ~4 mm mais longe da parede da frente; o antigo de
// projeto (87, 101) tinha de -24 a +8. É o que travou as curvas de 20/11.
TEST(ArcClearance, TheRealBodyHasANarrowerLongitudinalWindow) {
    const ArcWindow real = arcStartWindow(realBody(), 168.0, 90.0);
    const ArcWindow old = arcStartWindow(oldBody(), 168.0, 90.0);
    ASSERT_TRUE(real.found);
    ASSERT_TRUE(old.found);
    EXPECT_NEAR(real.longMinMm, -24.0, 4.0);
    EXPECT_NEAR(real.longMaxMm, -4.0, 4.0);
    EXPECT_GT(old.longMaxMm, real.longMaxMm);
    EXPECT_NEAR(real.bestLongMm, -16.0, 5.0);
}

TEST(ArcClearance, TheBatteryCableOnTheLeftNarrowsTheLateralWindow) {
    ArcBody withCable = realBody();
    withCable.leftExtraMm = 10.0;
    const ArcWindow plain = arcStartWindow(realBody(), 168.0, 90.0);
    const ArcWindow cable = arcStartWindow(withCable, 168.0, 90.0);
    ASSERT_TRUE(plain.found && cable.found);
    EXPECT_GT(cable.latMinMm, plain.latMinMm);  // o lado esquerdo perde folga
}

TEST(ArcClearance, ANarrowCorridorNeedsAPreciseCenteredStart) {
    ArcBody withCable = realBody();
    withCable.leftExtraMm = 10.0;
    const ArcWindow wide = arcStartWindow(withCable, 168.0, 90.0);
    const ArcWindow narrow = arcStartWindow(withCable, 153.0, 90.0);
    ASSERT_TRUE(wide.found && narrow.found);
    EXPECT_LT(narrow.latMaxMm - narrow.latMinMm, wide.latMaxMm - wide.latMinMm);
    EXPECT_LE(narrow.latMaxMm - narrow.latMinMm, 20.0);  // ~+-8 mm em torno do centro
}

// Onde o plano coloca o início do arco, em relação ao ponto nominal: 174 - (raio do canto de fora + folga) (84 de meio
// corredor + 90 de recuo). Com a folga de 20 mm e o corpo real são -23 mm, no limite da janela; com 12 mm, -15 mm, perto do ótimo.
TEST(ArcClearance, TheStartPlanLandsInsideTheWindowWithTheCalibratedClearance) {
    const ArcWindow real = arcStartWindow(realBody(), 168.0, 90.0);
    Calibration calibration;
    calibration.axleToFrontMm = 100.0;
    calibration.axleToFrontTofMm = 98.0;
    calibration.frontWidthMm = 112.0;
    calibration.arcClearanceMm = 20.0;
    const double edge = arcStartPlanOffsetMm(calibration, 168.0, 90.0);
    EXPECT_NEAR(edge, -23.0, 1.0);
    EXPECT_LT(edge - real.longMinMm, 3.0);  // com 20 mm de folga o plano está colado no limite de trás
    calibration.arcClearanceMm = 12.0;
    const double better = arcStartPlanOffsetMm(calibration, 168.0, 90.0);
    EXPECT_NEAR(better, -15.0, 1.0);
    EXPECT_GT(better - real.longMinMm, 6.0);   // folga de 6+ mm para o lado de trás
    EXPECT_GT(real.longMaxMm - better, 6.0);   // e de 6+ mm para o lado da parede da frente
}

}  // namespace
}  // namespace micromouse::domain
