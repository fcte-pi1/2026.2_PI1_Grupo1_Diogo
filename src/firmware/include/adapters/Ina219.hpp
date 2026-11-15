#pragma once

#include "driver/i2c_master.h"

namespace micromouse::adapters {

// Monitor de energia INA219: tensão, corrente e potência.
class Ina219 {
private:
    i2c_master_dev_handle_t device_{nullptr};

public:
    void begin(i2c_master_bus_handle_t bus);
    [[nodiscard]] bool present() const;
    [[nodiscard]] double busVoltageV() const;
    [[nodiscard]] double currentA() const;
    [[nodiscard]] double powerW() const;
};

}  // namespace micromouse::adapters
