#include "adapters/Ina219.hpp"

#include <cstdint>

#include "esp_log.h"

namespace micromouse::adapters {

namespace {
constexpr char kTag[] = "ina219";
constexpr uint8_t kAddress = 0x40;
constexpr uint8_t kRegBusVoltage = 0x02;
constexpr uint8_t kRegPower = 0x03;
constexpr uint8_t kRegCurrent = 0x04;
constexpr uint8_t kRegCalibration = 0x05;
constexpr int kTimeoutMs = 100;

// Calibração dependente do shunt (ex.: Rshunt = 0,1 Ohm).
constexpr uint16_t kCalValue = 4096;
constexpr double kCurrentLsb = 0.0001;  // A/bit
constexpr double kPowerLsb = 0.002;     // W/bit

bool writeRegister(i2c_master_dev_handle_t device, uint8_t reg, uint16_t value) {
    if (device == nullptr) {
        return false;
    }
    const uint8_t buffer[3] = {reg, static_cast<uint8_t>(value >> 8),
                               static_cast<uint8_t>(value & 0xFF)};
    return i2c_master_transmit(device, buffer, 3, kTimeoutMs) == ESP_OK;
}

// Devolve false quando a transação I²C falha (sem ACK, barramento travado, timeout). Sem essa
// verificação, uma leitura que falha deixava o buffer zerado e parecia um valor válido.
bool readRegister(i2c_master_dev_handle_t device, uint8_t reg, uint16_t& value) {
    if (device == nullptr) {
        return false;
    }
    uint8_t bytes[2] = {};
    if (i2c_master_transmit_receive(device, &reg, 1, bytes, 2, kTimeoutMs) != ESP_OK) {
        return false;
    }
    value = static_cast<uint16_t>((bytes[0] << 8) | bytes[1]);
    return true;
}

// Leitura para as medidas: se falhar, devolve 0 (o backend recusa a tensão fora da faixa).
uint16_t readOrZero(i2c_master_dev_handle_t device, uint8_t reg) {
    uint16_t value = 0;
    return readRegister(device, reg, value) ? value : 0;
}
}  // namespace

void Ina219::begin(i2c_master_bus_handle_t bus) {
    i2c_device_config_t config{};
    config.dev_addr_length = I2C_ADDR_BIT_LEN_7;
    config.device_address = kAddress;
    config.scl_speed_hz = 400000;
    if (i2c_master_bus_add_device(bus, &config, &device_) != ESP_OK) {
        device_ = nullptr;
        ESP_LOGE(kTag, "falha ao registrar o dispositivo 0x%02X no barramento I2C", kAddress);
        return;
    }
    // O add_device não fala com o chip; é a escrita da calibração que revela um INA219 ausente.
    if (!writeRegister(device_, kRegCalibration, kCalValue)) {
        ESP_LOGE(kTag, "INA219 nao respondeu em 0x%02X ao gravar a calibracao", kAddress);
    }
}

// Presente = responde ao endereço E devolve a calibração que acabamos de gravar. O registrador de
// calibração é lido de volta (reset = 0x0000, bit 0 sempre 0, e kCalValue tem bit 0 em 0), então
// só um INA219 de verdade passa; um barramento vazio dá NACK e leitura falha.
bool Ina219::present() const {
    uint16_t calibration = 0;
    if (!readRegister(device_, kRegCalibration, calibration)) {
        ESP_LOGE(kTag, "INA219 nao respondeu em 0x%02X (sem ACK no barramento I2C)", kAddress);
        return false;
    }
    if (calibration != kCalValue) {
        ESP_LOGE(kTag, "INA219 em 0x%02X devolveu calibracao 0x%04X (esperado 0x%04X)", kAddress,
                 static_cast<unsigned>(calibration), static_cast<unsigned>(kCalValue));
        return false;
    }
    return true;
}

double Ina219::busVoltageV() const {
    const uint16_t raw = readOrZero(device_, kRegBusVoltage);
    return static_cast<double>(raw >> 3) * 0.004;  // LSB = 4 mV
}

double Ina219::currentA() const {
    const int16_t raw = static_cast<int16_t>(readOrZero(device_, kRegCurrent));
    return raw * kCurrentLsb;
}

double Ina219::powerW() const {
    const uint16_t raw = readOrZero(device_, kRegPower);
    return raw * kPowerLsb;
}

}  // namespace micromouse::adapters
