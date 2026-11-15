#pragma once

#include "driver/i2c_master.h"

namespace micromouse::adapters {

// Inicializa e compartilha o barramento I2C mestre (driver i2c_master do
// ESP-IDF v5). Os adapters de sensor pedem o handle e registram seus devices.
class I2cBus {
private:
    i2c_master_bus_handle_t bus_{nullptr};

public:
    void begin();
    [[nodiscard]] i2c_master_bus_handle_t handle() const noexcept;
};

}  // namespace micromouse::adapters
