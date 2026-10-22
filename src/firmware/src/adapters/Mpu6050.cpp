#include "adapters/Mpu6050.hpp"

#include <cstdint>

namespace micromouse::adapters {

namespace {
constexpr uint8_t kAddress = 0x68;
constexpr uint8_t kWhoAmI = 0x75;
constexpr uint8_t kPwrMgmt1 = 0x6B;
constexpr uint8_t kGyroZoutH = 0x47;
constexpr double kGyroScale = 131.0;  // LSB/(graus/s) na faixa ±250 dps
constexpr int kTimeoutMs = 100;

uint8_t readRegister(i2c_master_dev_handle_t device, uint8_t reg) {
    uint8_t value = 0;
    i2c_master_transmit_receive(device, &reg, 1, &value, 1, kTimeoutMs);
    return value;
}
}  // namespace

void Mpu6050::begin(i2c_master_bus_handle_t bus) {
    i2c_device_config_t config{};
    config.dev_addr_length = I2C_ADDR_BIT_LEN_7;
    config.device_address = kAddress;
    config.scl_speed_hz = 400000;
    i2c_master_bus_add_device(bus, &config, &device_);

    const uint8_t wake[2] = {kPwrMgmt1, 0x00};  // sai do modo sleep
    i2c_master_transmit(device_, wake, 2, kTimeoutMs);
}

bool Mpu6050::present() const { return readRegister(device_, kWhoAmI) == 0x68; }

double Mpu6050::gyroZDegPerSec() const {
    uint8_t reg = kGyroZoutH;
    uint8_t bytes[2] = {};
    i2c_master_transmit_receive(device_, &reg, 1, bytes, 2, kTimeoutMs);
    const int16_t raw = static_cast<int16_t>((bytes[0] << 8) | bytes[1]);
    return raw / kGyroScale;
}

}  // namespace micromouse::adapters
