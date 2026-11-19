#include <gtest/gtest.h>

#include "domain/Calibration.hpp"
#include "domain/SweptFootprint.hpp"

namespace micromouse::domain {
namespace {

Calibration withCadFront() {
    Calibration c;
    EXPECT_EQ(setCalibration(c, "preset_cad", "1"), CalibrationSet::Ok);
    return c;
}

// Simulação de 19/11 (shapely, pegada do CAD, curva à esquerda em volta da roda esquerda, corredor em
// L de 168 mm): com a frente do CAD (107,75) o eixo tem de começar o giro 59 a 77 mm antes do centro
// da célula; com a frente de 87 mm, 45 a 77 mm. A de C++ reproduz as pontas de cima (77,5) e fica
// 3,5 a 4,5 mm menos conservadora embaixo (55,5 e 40,5): quem começa dentro da faixa MAIS ESTREITA
// (a do shapely) está dentro das duas, e o alvo cai nela.
TEST(SweptFootprint, StartBandMatchesTheCadSimulation) {
    const OneWheelStartBand cad = oneWheelStartBand(withCadFront());
    ASSERT_TRUE(cad.found);
    EXPECT_NEAR(cad.minMm, 59.0, 5.0);
    EXPECT_NEAR(cad.maxMm, 77.0, 2.0);

    const OneWheelStartBand field = oneWheelStartBand(Calibration{});
    ASSERT_TRUE(field.found);
    EXPECT_NEAR(field.minMm, 45.0, 6.0);
    EXPECT_NEAR(field.maxMm, 77.0, 2.0);
}

// Começando centrado (ou perto) a quina da frente bate na parede da frente; começando longe demais,
// a traseira/quina de fora bate na parede de fora da entrada.
TEST(SweptFootprint, StartingCenteredHitsTheFrontWall) {
    for (const Calibration& c : {Calibration{}, withCadFront()}) {
        EXPECT_FALSE(oneWheelTurnClears(c, 0.0));
        EXPECT_FALSE(oneWheelTurnClears(c, 30.0));
        EXPECT_FALSE(oneWheelTurnClears(c, 100.0));
    }
}

TEST(SweptFootprint, EveryPointInsideTheBandClearsAndTheEdgesDoNot) {
    for (const Calibration& c : {Calibration{}, withCadFront()}) {
        const OneWheelStartBand band = oneWheelStartBand(c);
        ASSERT_TRUE(band.found);
        for (double d = band.minMm; d <= band.maxMm; d += 1.0) {
            EXPECT_TRUE(oneWheelTurnClears(c, d)) << d;
        }
        EXPECT_FALSE(oneWheelTurnClears(c, band.minMm - 1.0));
        EXPECT_FALSE(oneWheelTurnClears(c, band.maxMm + 1.0));
    }
}

// O robô termina deslocado 15 a 33 mm do eixo do corredor de saída (frente do CAD): a centralização
// do item 4 é obrigatória depois desta curva.
TEST(SweptFootprint, EndsOffsetFromTheExitCorridorAxis) {
    const OneWheelStartBand cad = oneWheelStartBand(withCadFront());
    EXPECT_NEAR(cad.exitOffsetMinMm, 15.0, 5.0);
    EXPECT_NEAR(cad.exitOffsetMaxMm, 33.0, 2.0);
    const OneWheelEnd end = oneWheelEnd(66.0);
    EXPECT_NEAR(end.aheadOfCenterMm, 44.0, 0.1);  // metade da bitola além do centro da célula
    EXPECT_NEAR(end.inwardOffsetMm, 22.0, 0.1);
}

TEST(SweptFootprint, TargetIsInsideTheBandWithMargin) {
    for (const Calibration& c : {Calibration{}, withCadFront()}) {
        const OneWheelStartBand band = oneWheelStartBand(c);
        const double target = oneWheelStartTargetMm(c);
        ASSERT_GT(target, 0.0);
        EXPECT_GE(target - band.minMm, robot::kOneWheelStartMarginMm);
        EXPECT_GE(band.maxMm - target, robot::kOneWheelStartMarginMm);
    }
    // Pegada larga demais: a curva não cabe e o alvo diz isso.
    Calibration wide;
    wide.frontWidthMm = 160.0;
    wide.widthWithWheelsMm = 160.0;
    EXPECT_LT(oneWheelStartTargetMm(wide), 0.0);
}

}  // namespace
}  // namespace micromouse::domain
