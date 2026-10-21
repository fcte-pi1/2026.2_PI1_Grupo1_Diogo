#include "adapters/LocalInterfaceAdapter.hpp"

#include "adapters/BoardPins.hpp"
#include "driver/gpio.h"

namespace micromouse::adapters {

void LocalInterfaceAdapter::begin() {
    const gpio_config_t output{
        .pin_bit_mask = (1ULL << pins::kLedReady) | (1ULL << pins::kLedError) |
                        (1ULL << pins::kBuzzer),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&output);

    const gpio_config_t input{
        .pin_bit_mask = (1ULL << pins::kButton),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&input);
}

bool LocalInterfaceAdapter::buttonPressed() const {
    return gpio_get_level(pins::kButton) == 0;  // ativo em nível baixo
}

void LocalInterfaceAdapter::signalReady() {
    gpio_set_level(pins::kLedReady, 1);
    gpio_set_level(pins::kLedError, 0);
}

void LocalInterfaceAdapter::signalRunning() { gpio_set_level(pins::kLedReady, 1); }

void LocalInterfaceAdapter::signalError() {
    gpio_set_level(pins::kLedError, 1);
    gpio_set_level(pins::kBuzzer, 1);
}

}  // namespace micromouse::adapters
