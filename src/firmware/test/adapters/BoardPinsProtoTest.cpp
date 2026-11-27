// Mapa de pinos da montagem em protoboard (opção RATO_PROTOBOARD).
#define CONFIG_RATO_PROTOBOARD 1

#include <gtest/gtest.h>

#include <set>

#include "adapters/BoardPins.hpp"

namespace micromouse::adapters::pins {
namespace {

const int kUsed[] = {kI2cSda,       kI2cScl,        kTofFrontXshut, kTofLeftXshut,
                     kTofRightXshut, kMotorLeftIn1, kMotorLeftIn2,  kMotorRightIn1,
                     kMotorRightIn2, kEncLeftA,     kEncLeftB,      kEncRightA,
                     kEncRightB,     kBuzzer,       kDip1,          kDip2,
                     kDip3};

// Barra J1 (furo livre ao lado de cada pino) e, da J3, só os dois pinos mais perto das fileiras livres
// acima da ESP (21 e 47), alcançados por jumper sob a placa.
TEST(BoardPinsProto, FiosSoNaJ1EmDoisPinosDaJ3) {
    const std::set<int> j1{4, 5, 6, 7, 15, 16, 17, 18, 8, 9, 10, 11, 12, 13, 14};
    const std::set<int> j3{21, 47};
    int onJ3 = 0;
    for (const int pin : kUsed) {
        const bool inJ1 = j1.count(pin) == 1;
        const bool inJ3 = j3.count(pin) == 1;
        EXPECT_TRUE(inJ1 || inJ3) << "GPIO " << pin;
        onJ3 += inJ3 ? 1 : 0;
    }
    EXPECT_EQ(onJ3, 2);
    EXPECT_EQ(kButton, GPIO_NUM_0);  // botão BOOT da própria placa
}

TEST(BoardPinsProto, NenhumPinoUsadoDuasVezes) {
    EXPECT_EQ(std::set<int>(std::begin(kUsed), std::end(kUsed)).size(), std::size(kUsed));
}

TEST(BoardPinsProto, SemLedsNemInterrupcaoDaImu) {
    EXPECT_EQ(kLedReady, GPIO_NUM_NC);
    EXPECT_EQ(kLedError, GPIO_NUM_NC);
    EXPECT_EQ(kImuInt, GPIO_NUM_NC);
}

// Strapping (0, 3, 45, 46): nenhum fio. Proibidos na N16R8 e na DevKit: PSRAM octal (35-37), USB
// nativo (19-20), log da serial (43-44) e o LED RGB da placa (48).
TEST(BoardPinsProto, NenhumPinoDeStrappingNemProibido) {
    const std::set<int> avoid{0, 3, 45, 46, 19, 20, 35, 36, 37, 43, 44, 48};
    for (const int pin : kUsed) {
        EXPECT_EQ(avoid.count(pin), 0u) << "GPIO " << pin;
    }
}

}  // namespace
}  // namespace micromouse::adapters::pins
