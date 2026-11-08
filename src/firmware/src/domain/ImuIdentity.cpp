#include "domain/ImuIdentity.hpp"

namespace micromouse::domain {

ImuModel classifyImu(uint8_t whoAmI) noexcept {
    switch (whoAmI) {
        case 0x68:
            return ImuModel::Mpu6050;
        case 0x70:
            return ImuModel::Mpu6500;
        case 0x71:
            return ImuModel::Mpu9250;
        case 0x72:
        case 0x73:
            return ImuModel::Compatible;
        default:
            return ImuModel::Unknown;
    }
}

bool isSupportedImu(ImuModel model) noexcept { return model != ImuModel::Unknown; }

const char* imuModelName(ImuModel model) noexcept {
    switch (model) {
        case ImuModel::Mpu6050:
            return "MPU-6050";
        case ImuModel::Mpu6500:
            return "MPU-6500";
        case ImuModel::Mpu9250:
            return "MPU-9250";
        case ImuModel::Compatible:
            return "compativel com MPU-6500";
        case ImuModel::Unknown:
            break;
    }
    return "modelo desconhecido";
}

double gyroLsbPerDegPerSec(uint8_t gyroConfig) noexcept {
    switch ((gyroConfig >> 3) & 0x03) {
        case 1:
            return 65.5;
        case 2:
            return 32.8;
        case 3:
            return 16.4;
        default:
            return 131.0;
    }
}

double gyroFullScaleDegPerSec(uint8_t gyroConfig) noexcept {
    return 250.0 * static_cast<double>(1 << ((gyroConfig >> 3) & 0x03));
}

}  // namespace micromouse::domain
