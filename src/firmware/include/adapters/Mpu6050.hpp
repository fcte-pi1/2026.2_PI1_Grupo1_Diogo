#pragma once

#include <cstdint>
#include <optional>

#include "driver/i2c_master.h"

namespace micromouse::adapters {

// IMU MPU-6050: velocidade angular em Z (graus/s) para o GyroTurnController.
class Mpu6050 {
private:
    i2c_master_dev_handle_t device_{nullptr};
    // LSB por °/s da faixa em uso, calculada do GYRO_CONFIG lido de volta no begin(). Começa na do
    // reset (±250 °/s), para nunca usar uma escala diferente da do sensor.
    double gyroScale_{131.0};

public:
    void begin(i2c_master_bus_handle_t bus);
    // WHO_AM_I da família compatível: 0x68, 0x70, 0x71, 0x72 ou 0x73 (RF-29, #391)
    [[nodiscard]] bool present() const;
    [[nodiscard]] double gyroZDegPerSec() const;  // eixo vertical (yaw)
    // Faixa do giroscópio em uso (°/s), para o log e o diagnóstico.
    [[nodiscard]] double gyroFullScaleDegPerSec() const noexcept { return 32768.0 / gyroScale_; }
    // Valor lido do WHO_AM_I; vazio se a transação I²C falhar. Clones costumam
    // responder outro valor (0x70 no MPU-6500, 0x71 no MPU-9250).
    [[nodiscard]] std::optional<uint8_t> whoAmI() const;
};

}  // namespace micromouse::adapters
