// Mapa de pinos do robô montado na bancada (opção RATO_FIOS_MOTORES_TROCADOS, padrão no ESP32-S3).
#define CONFIG_RATO_FIOS_MOTORES_TROCADOS 1

#include <gtest/gtest.h>

#include <set>

#include "adapters/BoardPins.hpp"

namespace micromouse::adapters::pins {
namespace {

// Teste de 07/11 (robô suspenso, uma roda por vez, pelo firmware da eletrônica): o motor nos pinos
// 16/15 gira a roda esquerda e quem conta é o encoder 41/40; o motor 6/5 gira a direita e quem
// conta é o 38/39. Só os fios dos MOTORES foram trocados; os encoders seguem o esquemático 4.3
// (ENC2 = esquerdo). Com os encoders trocados (#436), o controle de reta corrigia ao contrário.
TEST(BoardPinsMontado, EncoderDeCadaRodaFicaComOMotorDaMesmaRoda) {
    EXPECT_EQ((std::set<int>{kMotorLeftIn1, kMotorLeftIn2}), (std::set<int>{16, 15}));
    EXPECT_EQ((std::set<int>{kEncLeftA, kEncLeftB}), (std::set<int>{41, 40}));
    EXPECT_EQ((std::set<int>{kMotorRightIn1, kMotorRightIn2}), (std::set<int>{6, 5}));
    EXPECT_EQ((std::set<int>{kEncRightA, kEncRightB}), (std::set<int>{38, 39}));
}

// Sentido conferido no diagnóstico em 07/11, girando cada roda à mão para a frente: a esquerda
// (A = 41, B = 40, sem inverter) foi de 0 a 322 e a direita (A = 39, B = 38) de 0 a 462.
TEST(BoardPinsMontado, EncodersContamPositivoParaAFrente) {
    EXPECT_EQ(kEncLeftA, GPIO_NUM_41);
    EXPECT_EQ(kEncLeftB, GPIO_NUM_40);
    EXPECT_FALSE(kInvertLeftEncoder);
    EXPECT_EQ(kEncRightA, GPIO_NUM_39);
    EXPECT_EQ(kEncRightB, GPIO_NUM_38);
    EXPECT_FALSE(kInvertLeftMotor);
}

TEST(BoardPinsMontado, NenhumPinoUsadoDuasVezes) {
    const int used[] = {kI2cSda,       kI2cScl,        kTofFrontXshut, kTofLeftXshut,
                        kTofRightXshut, kMotorLeftIn1, kMotorLeftIn2,  kMotorRightIn1,
                        kMotorRightIn2, kEncLeftA,     kEncLeftB,      kEncRightA,
                        kEncRightB,     kLedReady,     kLedError,      kBuzzer,
                        kButton,        kDip1,         kDip2,          kDip3,
                        kImuInt};
    EXPECT_EQ(std::set<int>(std::begin(used), std::end(used)).size(), std::size(used));
}

}  // namespace
}  // namespace micromouse::adapters::pins
