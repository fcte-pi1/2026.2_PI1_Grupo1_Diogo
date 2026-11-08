#pragma once

#include <cstdint>

namespace micromouse::domain {

// Modelo do IMU, identificado pelo registrador WHO_AM_I (0x75). O MPU-6050 original responde
// 0x68. Os módulos comerciais costumam trazer chips compatíveis (família MPU-6500 e clones) que
// respondem outro valor, mas têm o mesmo mapa dos registradores que o firmware usa (PWR_MGMT_1,
// GYRO_ZOUT_H e WHO_AM_I) e a mesma escala padrão de ±250 °/s (131 LSB por °/s). O IMU da equipe
// responde 0x72 (#391).
enum class ImuModel {
    Mpu6050,     // 0x68
    Mpu6500,     // 0x70
    Mpu9250,     // 0x71
    Compatible,  // 0x72 e 0x73: compatíveis, sem modelo confirmado
    Unknown      // qualquer outro valor (inclusive 0x00 e 0xFF, de um barramento sem resposta)
};

[[nodiscard]] ImuModel classifyImu(uint8_t whoAmI) noexcept;

// Os modelos que o firmware aceita no auto-teste: todos menos Unknown.
[[nodiscard]] bool isSupportedImu(ImuModel model) noexcept;

[[nodiscard]] const char* imuModelName(ImuModel model) noexcept;

// Faixa do giroscópio (GYRO_CONFIG, registrador 0x1B, bits 4..3 FS_SEL; igual no MPU-6050 e nos
// compatíveis). O padrão depois do reset é ±250 °/s, pouco para um pivô: a curva, que termina só
// pelo giroscópio, saturaria a leitura e o robô giraria demais. O firmware usa ±1000 °/s.
inline constexpr uint8_t kGyroConfigRegister = 0x1B;
inline constexpr uint8_t kGyroConfigForTurns = 0x10;  // FS_SEL = 2: ±1000 °/s

// Escala (LSB por °/s) e faixa (°/s) para um valor LIDO do GYRO_CONFIG.
[[nodiscard]] double gyroLsbPerDegPerSec(uint8_t gyroConfig) noexcept;
[[nodiscard]] double gyroFullScaleDegPerSec(uint8_t gyroConfig) noexcept;

}  // namespace micromouse::domain
