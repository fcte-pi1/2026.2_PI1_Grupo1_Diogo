// Mapa de pinos da PCB feita pelo esquemático 4.3 (opção RATO_FIOS_MOTORES_TROCADOS desligada).
#include <gtest/gtest.h>

#include <set>

#include "adapters/BoardPins.hpp"

namespace micromouse::adapters::pins {
namespace {

// Esquemático 4.3: motor 1 (16/15) e ENC1 (38/39) = roda direita; motor 2 (6/5) e ENC2 (41/40) =
// roda esquerda.
TEST(BoardPinsEsquematico, MotorEEncoderDeCadaRodaNoMesmoLado) {
    EXPECT_EQ((std::set<int>{kMotorLeftIn1, kMotorLeftIn2}), (std::set<int>{6, 5}));
    EXPECT_EQ((std::set<int>{kEncLeftA, kEncLeftB}), (std::set<int>{41, 40}));
    EXPECT_EQ((std::set<int>{kMotorRightIn1, kMotorRightIn2}), (std::set<int>{16, 15}));
    EXPECT_EQ((std::set<int>{kEncRightA, kEncRightB}), (std::set<int>{38, 39}));
}

TEST(BoardPinsEsquematico, NenhumPinoUsadoDuasVezes) {
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
