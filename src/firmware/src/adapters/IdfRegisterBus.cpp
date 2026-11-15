#include "adapters/IdfRegisterBus.hpp"

#include <algorithm>

#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace micromouse::adapters {

i2c_master_dev_handle_t IdfRegisterBus::device(uint8_t address) {
    address &= 0x7F;
    if (devices_[address] == nullptr && bus_ != nullptr) {
        i2c_device_config_t config{};
        config.dev_addr_length = I2C_ADDR_BIT_LEN_7;
        config.device_address = address;
        config.scl_speed_hz = kSpeedHz;
        if (i2c_master_bus_add_device(bus_, &config, &devices_[address]) != ESP_OK) {
            devices_[address] = nullptr;
        }
    }
    return devices_[address];
}

bool IdfRegisterBus::probe(uint8_t address) {
    return bus_ != nullptr && i2c_master_probe(bus_, address & 0x7F, kTimeoutMs) == ESP_OK;
}

// Conta a falha de uma transação e quanto ela demorou. Devolve true se deu certo.
bool IdfRegisterBus::note(uint8_t address, int result, int64_t startedUs) {
    if (result == ESP_OK) {
        return true;
    }
    Stats& stats = stats_[address & 0x7F];
    const unsigned ms = static_cast<unsigned>((esp_timer_get_time() - startedUs) / 1000);
    ++stats.errors;
    if (ms + 2 >= static_cast<unsigned>(kTimeoutMs)) {
        ++stats.slow;
    }
    stats.worstMs = std::max(stats.worstMs, ms);
    stats.lastError = result;
    return false;
}

bool IdfRegisterBus::write(uint8_t address, const uint8_t* data, size_t length) {
    i2c_master_dev_handle_t handle = device(address);
    if (handle == nullptr) {
        return false;
    }
    const int64_t started = esp_timer_get_time();
    return note(address, i2c_master_transmit(handle, data, length, kTimeoutMs), started);
}

bool IdfRegisterBus::writeRead(uint8_t address, const uint8_t* tx, size_t txLength, uint8_t* rx,
                               size_t rxLength) {
    i2c_master_dev_handle_t handle = device(address);
    if (handle == nullptr) {
        return false;
    }
    const int64_t started = esp_timer_get_time();
    return note(address,
                i2c_master_transmit_receive(handle, tx, txLength, rx, rxLength, kTimeoutMs),
                started);
}

void IdfRegisterBus::delayMs(uint32_t ms) {
    const TickType_t ticks = pdMS_TO_TICKS(ms);
    vTaskDelay(ticks > 0 ? ticks : 1);
}

uint32_t IdfRegisterBus::millis() const {
    return static_cast<uint32_t>(xTaskGetTickCount() * portTICK_PERIOD_MS);
}

}  // namespace micromouse::adapters
