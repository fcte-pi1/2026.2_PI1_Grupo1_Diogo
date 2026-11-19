#include <gtest/gtest.h>

#include "domain/Calibration.hpp"
#include "domain/Maneuver.hpp"
#include "domain/RobotGeometry.hpp"
#include "domain/Odometry.hpp"
#include "domain/RobotParameters.hpp"

namespace micromouse::domain {

namespace {

// 285 pulsos por volta (medidos em 04/11) e roda de 32 mm (medida em 11/11): 32π / 285 = 0,3527 mm
// por pulso.
TEST(RobotParameters, MillimetersPerPulseMatchesMeasuredCounts) {
    Odometry odometry(robot::kWheels);
    odometry.onEncoderPulses(1);
    EXPECT_NEAR(odometry.distanceMm(), 0.3527, 1e-4);
}

TEST(RobotParameters, OneCellTakesAbout511Pulses) {
    Odometry belowCell(robot::kWheels);
    belowCell.onEncoderPulses(510);
    EXPECT_EQ(belowCell.cellsTraveled(), 0);

    Odometry atCell(robot::kWheels);
    atCell.onEncoderPulses(511);
    EXPECT_EQ(atCell.cellsTraveled(), 1);
}

TEST(RobotParameters, QuarterTurnUsesWheelTrackAndCounts) {
    EXPECT_NEAR(pulsesForTurn(robot::kTurn, 90.0), 195.94, 0.01);
}

// Modelo do corpo a partir do CAD (assembly.step, 19/11). Eixo das rodas a 17,25 mm da traseira.
TEST(RobotModel, DefaultsUseTheCadValuesValidatedInTheField) {
    const Calibration calibration;
    EXPECT_DOUBLE_EQ(calibration.frontWidthMm, 101.0);        // faces dos ToF laterais
    EXPECT_DOUBLE_EQ(calibration.widthWithWheelsMm, 108.0);   // pneus de y=33,8 a 54,0
    EXPECT_DOUBLE_EQ(calibration.sideTofToCenterMm, 50.5);    // 84 - 50,5 = 33,5 na pista
    EXPECT_DOUBLE_EQ(calibration.sideTofAheadOfAxleMm, 59.15);
    // Frente: padrão de CAMPO até a medida de paquímetro (CAD: 107,25 chassi / 107,75 com ToF).
    EXPECT_DOUBLE_EQ(calibration.axleToFrontMm, 87.0);
    EXPECT_DOUBLE_EQ(calibration.axleToFrontTofMm, 85.0);
    EXPECT_DOUBLE_EQ(robot::kWheelTrackMm, 88.0);  // CAD: 87,8
    EXPECT_DOUBLE_EQ(robot::kWheelDiameterMm, 32.0);
}

TEST(RobotModel, SideTofCenterMatchesTheCorridorAndTheCentringReading) {
    const Calibration calibration;
    // Meio corredor (84) menos o ToF até o centro do robô = a leitura lateral no centro (33,5).
    EXPECT_NEAR(robot::kCorridorWidthMm / 2.0 - calibration.sideTofToCenterMm, 33.5, 1e-9);
    EXPECT_NEAR(robot::kWallCentering.centerMm, 33.5, 0.2);
}

// Pegada <= 165 x 165 e folga lateral no corredor de 168 mm, com o padrão de campo e com o preset.
TEST(RobotModel, FootprintFitsTheLimitAndTheCorridor) {
    for (const bool cad : {false, true}) {
        Calibration calibration;
        if (cad) {
            ASSERT_EQ(setCalibration(calibration, "preset_cad", "1"), CalibrationSet::Ok);
        }
        EXPECT_LE(robot::footprintLengthMm(calibration), robot::kRobotLimitMm) << cad;
        EXPECT_LE(robot::footprintWidthMm(calibration), robot::kRobotLimitMm) << cad;
        // Folga por lado com as rodas: (168 - 108) / 2 = 30 mm.
        EXPECT_NEAR(robot::lateralClearanceMm(calibration), 30.0, 1e-9) << cad;
    }
}

// Não há cabo à frente do robô (operador, 19/11): só o cabo vermelho e preto da bateria, que sai pela
// lateral esquerda e não entra neste modelo. A margem de cabo à frente é 0 e a pegada vai da traseira
// do chassi (17,25) à frente de campo (87).
TEST(RobotModel, ThereIsNoCableInFrontByDefault) {
    const Calibration calibration;
    EXPECT_DOUBLE_EQ(calibration.cableAheadMm, 0.0);
    EXPECT_DOUBLE_EQ(robot::footprintLengthMm(calibration), robot::kAxleToRearMm + 87.0);
}

TEST(RobotModel, CableMarginIsPartOfTheFootprint) {
    Calibration calibration;
    const double before = robot::footprintLengthMm(calibration);
    ASSERT_EQ(setCalibration(calibration, "cabo_frente_mm", "14"), CalibrationSet::Ok);
    EXPECT_GT(robot::footprintLengthMm(calibration), before - calibration.cableAheadMm +
                                                          14.0 - 1e-9);
    EXPECT_EQ(setCalibration(calibration, "cabo_frente_mm", "80"), CalibrationSet::OutOfRange);
}

// A roda ocupa 16 mm à frente do eixo (diâmetro 32): a frente do chassi tem de passar dela.
TEST(RobotModel, WheelDoesNotStickOutInFrontOfTheBody) {
    const Calibration calibration;
    EXPECT_GT(calibration.axleToFrontMm, robot::kWheelDiameterMm / 2.0);
}

// Preset "cad": os valores do CAD para a frente; o padrão de campo volta com preset_cad=0.
TEST(RobotModel, CadPresetSetsTheFrontAndCanBeUndone) {
    Calibration calibration;
    ASSERT_EQ(setCalibration(calibration, "preset_cad", "1"), CalibrationSet::Ok);
    EXPECT_DOUBLE_EQ(calibration.axleToFrontMm, 107.25);
    EXPECT_DOUBLE_EQ(calibration.axleToFrontTofMm, 107.75);
    ASSERT_EQ(setCalibration(calibration, "preset_cad", "0"), CalibrationSet::Ok);
    EXPECT_DOUBLE_EQ(calibration.axleToFrontMm, 87.0);
    EXPECT_DOUBLE_EQ(calibration.axleToFrontTofMm, 85.0);
    // Um valor medido depois do preset vale mais que o preset.
    const CalibrationParse parsed =
        applyCalibration(calibration, "preset_cad=1 eixo_ate_frente=100");
    EXPECT_EQ(parsed.applied, 2);
    EXPECT_DOUBLE_EQ(calibration.axleToFrontMm, 100.0);
    EXPECT_DOUBLE_EQ(calibration.axleToFrontTofMm, 107.75);
}

// Aviso de boot: campo e CAD divergem na frente por mais de 10 mm (hoje 20,25 mm).
TEST(RobotModel, WarnsWhenFieldAndCadFrontDisagreeByMoreThanTenMillimetres) {
    Calibration calibration;
    EXPECT_GT(bodyVsCadGapMm(calibration), 10.0);
    EXPECT_TRUE(bodyConflictsWithCad(calibration));
    ASSERT_EQ(setCalibration(calibration, "preset_cad", "1"), CalibrationSet::Ok);
    EXPECT_FALSE(bodyConflictsWithCad(calibration));
    ASSERT_EQ(applyCalibration(calibration, "eixo_ate_frente=100 eixo_ate_tof_frente=100").rejected,
              0);
    EXPECT_FALSE(bodyConflictsWithCad(calibration));  // 7,25 e 7,75 mm: dentro dos 10
}

}  // namespace

}  // namespace micromouse::domain
