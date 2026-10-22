#pragma once

#include "driver/i2c_master.h"

namespace micromouse::adapters {

// IMU MPU-6050: velocidade angular em Z (graus/s) para o GyroTurnController.
class Mpu6050 {
private:
    i2c_master_dev_handle_t device_{nullptr};

public:
    void begin(i2c_master_bus_handle_t bus);
    [[nodiscard]] bool present() const;           // WHO_AM_I == 0x68 (RF-29)
    [[nodiscard]] double gyroZDegPerSec() const;  // eixo vertical (yaw)
};

}  // namespace micromouse::adapters
