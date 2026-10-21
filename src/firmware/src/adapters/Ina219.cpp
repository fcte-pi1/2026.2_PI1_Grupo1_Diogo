#include "adapters/Ina219.hpp"

#include <cstdint>

namespace micromouse::adapters {

namespace {
constexpr uint8_t kAddress = 0x40;
constexpr uint8_t kRegConfig = 0x00;
constexpr uint8_t kRegBusVoltage = 0x02;
constexpr uint8_t kRegPower = 0x03;
constexpr uint8_t kRegCurrent = 0x04;
constexpr uint8_t kRegCalibration = 0x05;
constexpr int kTimeoutMs = 100;

// Calibração dependente do shunt (ex.: Rshunt = 0,1 Ohm).
constexpr uint16_t kCalValue = 4096;
constexpr double kCurrentLsb = 0.0001;  // A/bit
constexpr double kPowerLsb = 0.002;     // W/bit

void writeRegister(i2c_master_dev_handle_t device, uint8_t reg, uint16_t value) {
    const uint8_t buffer[3] = {reg, static_cast<uint8_t>(value >> 8),
                               static_cast<uint8_t>(value & 0xFF)};
    i2c_master_transmit(device, buffer, 3, kTimeoutMs);
}

uint16_t readRegister(i2c_master_dev_handle_t device, uint8_t reg) {
    uint8_t bytes[2] = {};
    i2c_master_transmit_receive(device, &reg, 1, bytes, 2, kTimeoutMs);
    return static_cast<uint16_t>((bytes[0] << 8) | bytes[1]);
}
}  // namespace

void Ina219::begin(i2c_master_bus_handle_t bus) {
    i2c_device_config_t config{};
    config.dev_addr_length = I2C_ADDR_BIT_LEN_7;
    config.device_address = kAddress;
    config.scl_speed_hz = 400000;
    i2c_master_bus_add_device(bus, &config, &device_);
    writeRegister(device_, kRegCalibration, kCalValue);
}

bool Ina219::present() const { return readRegister(device_, kRegConfig) != 0xFFFF; }

double Ina219::busVoltageV() const {
    const uint16_t raw = readRegister(device_, kRegBusVoltage);
    return static_cast<double>(raw >> 3) * 0.004;  // LSB = 4 mV
}

double Ina219::currentA() const {
    const int16_t raw = static_cast<int16_t>(readRegister(device_, kRegCurrent));
    return raw * kCurrentLsb;
}

double Ina219::powerW() const {
    const uint16_t raw = readRegister(device_, kRegPower);
    return raw * kPowerLsb;
}

}  // namespace micromouse::adapters
