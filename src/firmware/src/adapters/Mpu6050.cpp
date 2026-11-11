#include "adapters/Mpu6050.hpp"

#include <cstdint>

#include "domain/ImuIdentity.hpp"
#include "esp_log.h"

namespace micromouse::adapters {

namespace {
constexpr char kTag[] = "mpu6050";
constexpr uint8_t kAddress = 0x68;
constexpr uint8_t kWhoAmI = 0x75;
constexpr uint8_t kPwrMgmt1 = 0x6B;
constexpr uint8_t kGyroZoutH = 0x47;
constexpr int kTimeoutMs = 100;

// Devolve false quando a transação I²C falha (sem ACK, timeout), como no Ina219 (#357):
// sem essa verificação, uma leitura que falha parecia um valor 0 válido.
bool readRegisters(i2c_master_dev_handle_t device, uint8_t reg, uint8_t* out, size_t size) {
    if (device == nullptr) {
        return false;
    }
    return i2c_master_transmit_receive(device, &reg, 1, out, size, kTimeoutMs) == ESP_OK;
}
}  // namespace

void Mpu6050::begin(i2c_master_bus_handle_t bus) {
    i2c_device_config_t config{};
    config.dev_addr_length = I2C_ADDR_BIT_LEN_7;
    config.device_address = kAddress;
    config.scl_speed_hz = 400000;
    if (i2c_master_bus_add_device(bus, &config, &device_) != ESP_OK) {
        device_ = nullptr;
        ESP_LOGE(kTag, "falha ao registrar o dispositivo 0x%02X no barramento I2C", kAddress);
        return;
    }

    const uint8_t wake[2] = {kPwrMgmt1, 0x00};  // sai do modo sleep
    if (i2c_master_transmit(device_, wake, 2, kTimeoutMs) != ESP_OK) {
        ESP_LOGE(kTag, "MPU-6050 nao respondeu em 0x%02X ao sair do sleep", kAddress);
    }

    // Faixa de ±1000 °/s: a curva termina só pelo giroscópio, e um pivô passa dos ±250 °/s do
    // padrão. A escala vem do valor LIDO DE VOLTA: se a escrita falhar, ela continua batendo com o
    // sensor (com a escala errada, o ângulo sairia 4x menor e o robô giraria demais).
    const uint8_t range[2] = {domain::kGyroConfigRegister, domain::kGyroConfigForTurns};
    (void)i2c_master_transmit(device_, range, 2, kTimeoutMs);
    uint8_t gyroConfig = 0;
    const bool readBack = readRegisters(device_, domain::kGyroConfigRegister, &gyroConfig, 1);
    if (readBack) {
        gyroScale_ = domain::gyroLsbPerDegPerSec(gyroConfig);
    }
    constexpr uint8_t kFsSelMask = 0x18;
    if (!readBack || (gyroConfig & kFsSelMask) != (domain::kGyroConfigForTurns & kFsSelMask)) {
        ESP_LOGW(kTag, "giroscopio ficou em +-%.0f graus/s (GYRO_CONFIG=0x%02X): curvas rapidas "
                       "podem saturar a leitura",
                 gyroFullScaleDegPerSec(), gyroConfig);
    } else {
        ESP_LOGI(kTag, "giroscopio em +-%.0f graus/s", gyroFullScaleDegPerSec());
    }
}

std::optional<uint8_t> Mpu6050::whoAmI() const {
    uint8_t value = 0;
    if (!readRegisters(device_, kWhoAmI, &value, 1)) {
        return std::nullopt;
    }
    return value;
}

bool Mpu6050::present() const {
    const std::optional<uint8_t> id = whoAmI();
    if (!id) {
        ESP_LOGE(kTag, "MPU-6050 nao respondeu em 0x%02X (sem ACK no barramento I2C)", kAddress);
        return false;
    }
    const domain::ImuModel model = domain::classifyImu(*id);
    if (!domain::isSupportedImu(model)) {
        ESP_LOGE(kTag, "WHO_AM_I = 0x%02X nao e de um MPU-6050 nem de um compativel (aceitos: 0x68, "
                       "0x70, 0x71, 0x72 e 0x73)",
                 *id);
        return false;
    }
    if (model != domain::ImuModel::Mpu6050) {
        // Aceito: o mapa de registradores e a escala padrao sao os do MPU-6050 (#391).
        ESP_LOGW(kTag, "WHO_AM_I = 0x%02X (%s): aceito como MPU-6050", *id,
                 domain::imuModelName(model));
    }
    return true;
}

std::optional<double> Mpu6050::readGyroZDegPerSec() const {
    uint8_t bytes[2] = {};
    if (!readRegisters(device_, kGyroZoutH, bytes, 2)) {
        return std::nullopt;
    }
    const int16_t raw = static_cast<int16_t>((bytes[0] << 8) | bytes[1]);
    return raw / gyroScale_;
}

double Mpu6050::gyroZDegPerSec() const {
    // Como o Ina219: sem leitura, 0 (o auto-teste já reprovou o sensor ausente).
    return readGyroZDegPerSec().value_or(0.0);
}

}  // namespace micromouse::adapters
