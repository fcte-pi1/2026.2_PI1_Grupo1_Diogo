#include "adapters/Encoders.hpp"

#include "adapters/BoardPins.hpp"
#include "driver/pulse_cnt.h"  // driver PCNT novo (ESP-IDF 5.x); NÃO o legado driver/pcnt.h

namespace micromouse::adapters {

namespace {
pcnt_unit_handle_t makeQuadrature(gpio_num_t pinA, gpio_num_t pinB) {
    pcnt_unit_config_t unitConfig{};
    unitConfig.high_limit = 30000;
    unitConfig.low_limit = -30000;
    pcnt_unit_handle_t unit = nullptr;
    pcnt_new_unit(&unitConfig, &unit);

    pcnt_chan_config_t channelConfig{};
    channelConfig.edge_gpio_num = pinA;
    channelConfig.level_gpio_num = pinB;
    pcnt_channel_handle_t channel = nullptr;
    pcnt_new_channel(unit, &channelConfig, &channel);

    pcnt_channel_set_edge_action(channel, PCNT_CHANNEL_EDGE_ACTION_INCREASE,
                                 PCNT_CHANNEL_EDGE_ACTION_DECREASE);
    pcnt_channel_set_level_action(channel, PCNT_CHANNEL_LEVEL_ACTION_KEEP,
                                  PCNT_CHANNEL_LEVEL_ACTION_INVERSE);

    pcnt_unit_enable(unit);
    pcnt_unit_clear_count(unit);
    pcnt_unit_start(unit);
    return unit;
}

long read(pcnt_unit_handle_t unit) {
    int count = 0;
    pcnt_unit_get_count(unit, &count);
    return count;
}

// Os Hall dos N20 têm saída em coletor aberto (#394): sem pull-up o sinal fica flutuando. O
// pull-up interno (~45 kOhm) basta na bancada; na PCB o hardware prevê pull-ups externos.
void enablePullups() {
    constexpr gpio_num_t kEncoderPins[] = {pins::kEncLeftA, pins::kEncLeftB, pins::kEncRightA,
                                           pins::kEncRightB};
    for (const gpio_num_t pin : kEncoderPins) {
        gpio_set_pull_mode(pin, GPIO_PULLUP_ONLY);
    }
}
}  // namespace

void Encoders::begin() {
    leftUnit_ = makeQuadrature(pins::kEncLeftA, pins::kEncLeftB);
    rightUnit_ = makeQuadrature(pins::kEncRightA, pins::kEncRightB);
    enablePullups();  // depois do PCNT, que configura os pinos como entrada
}

long Encoders::left() const {
    const long count = read(leftUnit_);
    return invertLeft_ ? -count : count;
}
long Encoders::right() const { return read(rightUnit_); }

void Encoders::reset() {
    pcnt_unit_clear_count(leftUnit_);
    pcnt_unit_clear_count(rightUnit_);
}

}  // namespace micromouse::adapters
