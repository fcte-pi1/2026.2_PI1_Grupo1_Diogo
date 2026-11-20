#include <gtest/gtest.h>

#include <limits>

#include "controller/RobotMotion.hpp"
#include "domain/BrakeLearner.hpp"
#include "domain/Calibration.hpp"
#include "domain/RobotParameters.hpp"

namespace micromouse::domain {
namespace {

// Sem nenhum `calib`, o robô usa exatamente os valores que estavam fixos no código em 16/11.
TEST(Calibration, DefaultsAreTheValuesInUse) {
    const Calibration calibration;
    EXPECT_DOUBLE_EQ(calibration.axleToFrontMm, robot::kBody.axleToFrontMm);
    EXPECT_DOUBLE_EQ(calibration.frontWidthMm, 2.0 * robot::kBody.halfWidthMm);
    EXPECT_DOUBLE_EQ(calibration.axleToFrontTofMm, robot::kBody.axleToFrontTofMm);
    EXPECT_DOUBLE_EQ(calibration.gyroScale, controller::robot::kGyroScaleCorrection);
    EXPECT_DOUBLE_EQ(calibration.arcBrakeDeg, controller::robot::kArcTurn.toleranceDeg);
    EXPECT_DOUBLE_EQ(calibration.pivotBrakeDeg, controller::robot::kPivotMove.toleranceDeg);
    EXPECT_DOUBLE_EQ(calibration.frontStopMm, controller::robot::kFrontStopMm);
    EXPECT_DOUBLE_EQ(calibration.autoBrake, 0.0);
    EXPECT_DOUBLE_EQ(calibration.centerOnWalls, 0.0);
    EXPECT_DOUBLE_EQ(calibration.headingGain, 0.0);
}

// Modo da curva fechada (item 1, 19/11): 0 = arco (o atual), 1 = uma roda.
TEST(Calibration, TurnModeDefaultsToTheArcAndAcceptsOnlyZeroOrOne) {
    Calibration calibration;
    EXPECT_DOUBLE_EQ(calibration.turnMode, 0.0);
    EXPECT_DOUBLE_EQ(calibration.oneWheelBrakeDeg, controller::robot::kOneWheelTurn.toleranceDeg);
    EXPECT_EQ(setCalibration(calibration, "modo_curva", "1"), CalibrationSet::Ok);
    EXPECT_DOUBLE_EQ(calibration.turnMode, 1.0);
    EXPECT_EQ(setCalibration(calibration, "modo_curva", "2"), CalibrationSet::OutOfRange);
    EXPECT_EQ(setCalibration(calibration, "freio_uma_roda", "6,5"), CalibrationSet::Ok);
    EXPECT_DOUBLE_EQ(calibration.oneWheelBrakeDeg, 6.5);
}

// 19/11 (aprovado A): na reta, os ToF são lidos a cada 10 ms mesmo sem o RF-44. Com módulo ToF defeituoso isso coincidiu
// com reinícios da placa; `tof_na_reta=0` desliga essa leitura (só lê nas paradas). Padrão 1 = como antes.
TEST(Calibration, TofInStraightDefaultsOnAndAcceptsOnlyZeroOrOne) {
    Calibration calibration;
    EXPECT_DOUBLE_EQ(calibration.tofInStraight, 1.0);
    EXPECT_EQ(setCalibration(calibration, "tof_na_reta", "0"), CalibrationSet::Ok);
    EXPECT_DOUBLE_EQ(calibration.tofInStraight, 0.0);
    EXPECT_EQ(setCalibration(calibration, "tof_na_reta", "2"), CalibrationSet::OutOfRange);
}

// Malhas fechadas novas (19/11). A rampa de tensão vem ligada (ataca o BROWNOUT na partida); as outras
// três vêm desligadas até serem medidas no robô.
TEST(Calibration, NewClosedLoopSwitchesHaveSafeDefaultsAndRanges) {
    Calibration calibration;
    EXPECT_DOUBLE_EQ(calibration.voltageRampVPerS, 50.0);
    EXPECT_DOUBLE_EQ(calibration.headingFusion, 0.0);
    EXPECT_DOUBLE_EQ(calibration.reanchorOnWalls, 0.0);
    EXPECT_DOUBLE_EQ(calibration.dynamicFrontStop, 0.0);
    EXPECT_DOUBLE_EQ(calibration.gyroBiasTracking, 0.0);
    // Reta contínua (20/11): vem LIGADA, a pedido do operador (o para-e-anda dava tranco em cada célula).
    EXPECT_DOUBLE_EQ(calibration.continuousRun, 1.0);
    EXPECT_EQ(setCalibration(calibration, "reta_continua", "0"), CalibrationSet::Ok);
    EXPECT_EQ(setCalibration(calibration, "reta_continua", "2"), CalibrationSet::OutOfRange);
    EXPECT_EQ(setCalibration(calibration, "vies_giro", "1"), CalibrationSet::Ok);
    EXPECT_EQ(setCalibration(calibration, "vies_giro", "2"), CalibrationSet::OutOfRange);
    EXPECT_EQ(setCalibration(calibration, "rampa_tensao", "0"), CalibrationSet::Ok);  // sem rampa
    EXPECT_EQ(setCalibration(calibration, "rampa_tensao", "500"), CalibrationSet::OutOfRange);
    EXPECT_EQ(setCalibration(calibration, "fusao_rumo", "0,5"), CalibrationSet::Ok);
    EXPECT_EQ(setCalibration(calibration, "fusao_rumo", "5"), CalibrationSet::OutOfRange);
    EXPECT_EQ(setCalibration(calibration, "reancorar_parede", "1"), CalibrationSet::Ok);
    EXPECT_EQ(setCalibration(calibration, "reancorar_parede", "2"), CalibrationSet::OutOfRange);
    EXPECT_EQ(setCalibration(calibration, "parada_dinamica", "1"), CalibrationSet::Ok);
    EXPECT_EQ(setCalibration(calibration, "parada_dinamica", "-1"), CalibrationSet::OutOfRange);
    EXPECT_EQ(calibrationFields().size(), 24u);
}

TEST(Calibration, EveryDefaultIsInsideItsRange) {
    Calibration calibration;
    EXPECT_EQ(sanitizeCalibration(calibration), 0);
}

TEST(Calibration, SetsOneValueByItsReadableName) {
    Calibration calibration;
    EXPECT_EQ(setCalibration(calibration, "eixo_ate_frente", "85"), CalibrationSet::Ok);
    EXPECT_DOUBLE_EQ(calibration.axleToFrontMm, 85.0);
    EXPECT_EQ(setCalibration(calibration, "escala_giro", "1,068"), CalibrationSet::Ok);  // vírgula
    EXPECT_DOUBLE_EQ(calibration.gyroScale, 1.068);
}

TEST(Calibration, RefusesWhatIsOutOfRangeUnknownOrNotANumber) {
    Calibration calibration;
    EXPECT_EQ(setCalibration(calibration, "escala_giro", "2.0"), CalibrationSet::OutOfRange);
    EXPECT_EQ(setCalibration(calibration, "parada_frente", "5"), CalibrationSet::OutOfRange);
    EXPECT_EQ(setCalibration(calibration, "M1", "87"), CalibrationSet::UnknownName);
    EXPECT_EQ(setCalibration(calibration, "freio_arco", "sete"), CalibrationSet::NotANumber);
    EXPECT_EQ(setCalibration(calibration, "freio_arco", ""), CalibrationSet::NotANumber);
    EXPECT_EQ(setCalibration(calibration, "freio_arco", "7.5x"), CalibrationSet::NotANumber);
    EXPECT_EQ(setCalibration(calibration, "freio_arco", "nan"), CalibrationSet::NotANumber);
    const Calibration defaults;
    EXPECT_DOUBLE_EQ(calibration.gyroScale, defaults.gyroScale);
    EXPECT_DOUBLE_EQ(calibration.frontStopMm, defaults.frontStopMm);
    EXPECT_DOUBLE_EQ(calibration.arcBrakeDeg, defaults.arcBrakeDeg);
}

TEST(Calibration, AppliesSeveralValuesOrNoneAtAll) {
    Calibration calibration;
    const CalibrationParse good =
        applyCalibration(calibration, "eixo_ate_frente=85  largura_frente=104 largura_com_rodas=118");
    EXPECT_EQ(good.applied, 3);
    EXPECT_EQ(good.rejected, 0);
    EXPECT_DOUBLE_EQ(calibration.frontWidthMm, 104.0);
    EXPECT_DOUBLE_EQ(calibration.widthWithWheelsMm, 118.0);

    const CalibrationParse bad = applyCalibration(calibration, "largura_frente=90 escala_giro=9");
    EXPECT_EQ(bad.applied, 0);
    EXPECT_EQ(bad.rejected, 1);
    EXPECT_EQ(bad.firstRejected, "escala_giro=9");
    EXPECT_EQ(bad.firstReason, CalibrationSet::OutOfRange);
    EXPECT_DOUBLE_EQ(calibration.frontWidthMm, 104.0);  // nada mudou

    EXPECT_EQ(applyCalibration(calibration, "largura_frente").rejected, 1);  // sem "="
    EXPECT_EQ(applyCalibration(calibration, "   ").applied, 0);
}

TEST(Calibration, AValueFromMemoryOutsideTheRangeGoesBackToTheDefault) {
    Calibration calibration;
    calibration.gyroScale = 0.0;
    calibration.frontStopMm = std::numeric_limits<double>::quiet_NaN();
    calibration.arcBrakeDeg = 9.0;  // dentro da faixa: fica
    EXPECT_EQ(sanitizeCalibration(calibration), 2);
    const Calibration defaults;
    EXPECT_DOUBLE_EQ(calibration.gyroScale, defaults.gyroScale);
    EXPECT_DOUBLE_EQ(calibration.frontStopMm, defaults.frontStopMm);
    EXPECT_DOUBLE_EQ(calibration.arcBrakeDeg, 9.0);
}

TEST(Calibration, FieldNamesAreUniqueAndShortEnoughForTheLog) {
    const auto& fields = calibrationFields();
    for (std::size_t i = 0; i < fields.size(); ++i) {
        EXPECT_LE(fields[i].name.size(), 26U);
        EXPECT_LT(fields[i].min, fields[i].max);
        for (std::size_t j = i + 1; j < fields.size(); ++j) {
            EXPECT_NE(fields[i].name, fields[j].name);
        }
    }
}

// Com as medidas do corpo de hoje, o arco começa onde está em uso (kArcStartFrontMm).
TEST(Calibration, ArcStartFromTheDefaultBodyIsTheOneInUse) {
    const Calibration calibration;
    const BodyGeometry body{calibration.axleToFrontMm, calibration.frontWidthMm / 2.0,
                            calibration.axleToFrontTofMm};
    EXPECT_DOUBLE_EQ(arcStartFrontMm(body, controller::robot::kArcSetbackMm,
                                     controller::robot::kArcFrontClearanceMm),
                     controller::robot::kArcStartFrontMm);
}

// Autoajuste do freio: vai para o meio do caminho a cada curva e para perto do que o robô mede.
TEST(BrakeLearner, ConvergesToTheMeasuredCoast) {
    BrakeLearner learner(7.5, 2.0, 15.0);
    EXPECT_DOUBLE_EQ(learner.brakeDeg(), 7.5);
    // Piso mais liso: o robô gira 11 graus depois de frear.
    for (int i = 0; i < 6; ++i) {
        const double stop = 90.0 - learner.brakeDeg();
        EXPECT_TRUE(learner.update(stop, stop + 11.0));
    }
    EXPECT_NEAR(learner.brakeDeg(), 11.0, 0.1);
    EXPECT_EQ(learner.learned(), 6);
}

TEST(BrakeLearner, StaysInsideTheLimitsAndIgnoresAbsurdTurns) {
    BrakeLearner learner(7.5, 2.0, 15.0);
    EXPECT_FALSE(learner.update(83.0, 60.0));   // voltou: curva que bateu
    EXPECT_FALSE(learner.update(83.0, 120.0));  // 37 graus depois do freio: não foi normal
    EXPECT_DOUBLE_EQ(learner.brakeDeg(), 7.5);
    for (int i = 0; i < 10; ++i) (void)learner.update(60.0, 88.0);  // 28 graus: no limite de aceitar
    EXPECT_DOUBLE_EQ(learner.brakeDeg(), 15.0);
    for (int i = 0; i < 10; ++i) (void)learner.update(89.0, 89.0);
    EXPECT_DOUBLE_EQ(learner.brakeDeg(), 2.0);
    learner.reset(7.5);
    EXPECT_DOUBLE_EQ(learner.brakeDeg(), 7.5);
    EXPECT_EQ(learner.learned(), 0);
}

}  // namespace
}  // namespace micromouse::domain
