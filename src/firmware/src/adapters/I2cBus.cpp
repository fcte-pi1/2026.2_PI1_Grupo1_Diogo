#include "adapters/I2cBus.hpp"

#include "adapters/BoardPins.hpp"

namespace micromouse::adapters {

void I2cBus::begin() {
    i2c_master_bus_config_t config{};
    config.i2c_port = I2C_NUM_0;
    config.sda_io_num = pins::kI2cSda;
    config.scl_io_num = pins::kI2cScl;
    config.clk_source = I2C_CLK_SRC_DEFAULT;
    config.glitch_ignore_cnt = 7;
    config.flags.enable_internal_pullup = true;
    i2c_new_master_bus(&config, &bus_);
}

i2c_master_bus_handle_t I2cBus::handle() const noexcept { return bus_; }

}  // namespace micromouse::adapters
