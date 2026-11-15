#pragma once

#include <atomic>
#include <cstdint>

#include "driver/i2c_master.h"

namespace micromouse::adapters {

// Monitor de energia INA219: tensão, corrente e potência.
class Ina219 {
private:
    i2c_master_dev_handle_t device_{nullptr};
    // Leituras que falharam desde o boot (a telemetria e a navegação leem de tarefas diferentes).
    mutable std::atomic<unsigned> readErrors_{0};
    [[nodiscard]] uint16_t readOrZero(uint8_t reg) const;

public:
    [[nodiscard]] unsigned readErrors() const noexcept { return readErrors_.load(); }
    void begin(i2c_master_bus_handle_t bus);
    [[nodiscard]] bool present() const;
    [[nodiscard]] double busVoltageV() const;
    [[nodiscard]] double currentA() const;
    [[nodiscard]] double powerW() const;
};

}  // namespace micromouse::adapters
