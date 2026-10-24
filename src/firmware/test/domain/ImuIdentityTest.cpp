#include <gtest/gtest.h>

#include <cstring>

#include "domain/ImuIdentity.hpp"

namespace micromouse::domain {

TEST(ImuIdentity, OriginalMpu6050) {
    EXPECT_EQ(classifyImu(0x68), ImuModel::Mpu6050);
}

TEST(ImuIdentity, FamilyIdsAreRecognized) {
    EXPECT_EQ(classifyImu(0x70), ImuModel::Mpu6500);
    EXPECT_EQ(classifyImu(0x71), ImuModel::Mpu9250);
}

// O IMU da equipe responde 0x72 (#391): o auto-teste do robô tem que aceitá-lo.
TEST(ImuIdentity, TeamImuIsAccepted) {
    EXPECT_EQ(classifyImu(0x72), ImuModel::Compatible);
    EXPECT_TRUE(isSupportedImu(classifyImu(0x72)));
    EXPECT_EQ(classifyImu(0x73), ImuModel::Compatible);
    EXPECT_TRUE(isSupportedImu(classifyImu(0x73)));
}

TEST(ImuIdentity, AllKnownIdsAreSupported) {
    constexpr uint8_t kIds[] = {0x68, 0x70, 0x71, 0x72, 0x73};
    for (const uint8_t id : kIds) {
        EXPECT_TRUE(isSupportedImu(classifyImu(id))) << "id " << static_cast<int>(id);
    }
}

// 0x00 e 0xFF são o que se lê de um barramento sem dispositivo: nunca podem passar.
TEST(ImuIdentity, BusWithoutDeviceIsRejected) {
    EXPECT_EQ(classifyImu(0x00), ImuModel::Unknown);
    EXPECT_EQ(classifyImu(0xFF), ImuModel::Unknown);
    EXPECT_FALSE(isSupportedImu(classifyImu(0x00)));
    EXPECT_FALSE(isSupportedImu(classifyImu(0xFF)));
}

TEST(ImuIdentity, OtherChipsAreRejected) {
    // vizinhos da lista aceita e valores quaisquer fora dela
    EXPECT_EQ(classifyImu(0x12), ImuModel::Unknown);
    EXPECT_EQ(classifyImu(0x67), ImuModel::Unknown);
    EXPECT_EQ(classifyImu(0x69), ImuModel::Unknown);
    EXPECT_EQ(classifyImu(0x74), ImuModel::Unknown);
}

TEST(ImuIdentity, ExactlyFiveIdsAreSupported) {
    int supported = 0;
    for (int id = 0; id < 256; ++id) {
        if (isSupportedImu(classifyImu(static_cast<uint8_t>(id)))) {
            ++supported;
        }
    }
    EXPECT_EQ(supported, 5);
}

TEST(ImuIdentity, NamesAreReadable) {
    EXPECT_STREQ(imuModelName(ImuModel::Mpu6050), "MPU-6050");
    EXPECT_STREQ(imuModelName(ImuModel::Mpu6500), "MPU-6500");
    EXPECT_STREQ(imuModelName(ImuModel::Mpu9250), "MPU-9250");
    EXPECT_NE(std::strlen(imuModelName(ImuModel::Compatible)), 0u);
    EXPECT_STREQ(imuModelName(ImuModel::Unknown), "modelo desconhecido");
}

}  // namespace micromouse::domain
