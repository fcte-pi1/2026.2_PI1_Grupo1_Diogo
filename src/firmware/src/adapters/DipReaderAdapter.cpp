#include "adapters/DipReaderAdapter.hpp"

#include "adapters/BoardPins.hpp"
#include "driver/gpio.h"

namespace micromouse::adapters {

void DipReaderAdapter::begin() {
    const gpio_config_t input{
        .pin_bit_mask =
            (1ULL << pins::kDip1) | (1ULL << pins::kDip2) | (1ULL << pins::kDip3),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&input);
}

domain::MazeSetup DipReaderAdapter::read() const {
    const bool dip1 = gpio_get_level(pins::kDip1) == 0;  // pull-up: fechado = true
    const bool dip2 = gpio_get_level(pins::kDip2) == 0;
    const bool dip3 = gpio_get_level(pins::kDip3) == 0;
    return decoder_.decode(dip1, dip2, dip3);
}

}  // namespace micromouse::adapters
