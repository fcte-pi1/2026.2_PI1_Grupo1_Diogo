#pragma once

#include <array>
#include <cstdint>

#include "driver/i2c_master.h"
#include "drivers/RegisterBus.hpp"

namespace micromouse::adapters {

// IRegisterBus sobre o i2c_master do ESP-IDF. Registra um device por endereço na primeira vez
// que ele é usado: os VL53L1X mudam de endereço durante o reendereçamento (0x29 -> 0x30...).
class IdfRegisterBus final : public drivers::IRegisterBus {
private:
    static constexpr uint32_t kSpeedHz = 400000;
    static constexpr int kTimeoutMs = 20;

    i2c_master_bus_handle_t bus_{nullptr};
    std::array<i2c_master_dev_handle_t, 128> devices_{};

    i2c_master_dev_handle_t device(uint8_t address);

public:
    void attach(i2c_master_bus_handle_t bus) noexcept { bus_ = bus; }
    // True se algum dispositivo responde no endereço (sem registrá-lo).
    bool probe(uint8_t address);

    bool write(uint8_t address, const uint8_t* data, size_t length) override;
    bool writeRead(uint8_t address, const uint8_t* tx, size_t txLength, uint8_t* rx,
                   size_t rxLength) override;
    void delayMs(uint32_t ms) override;
    [[nodiscard]] uint32_t millis() const override;
};

}  // namespace micromouse::adapters
