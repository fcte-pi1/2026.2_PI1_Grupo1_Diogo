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
}  // namespace

void Encoders::begin() {
    leftUnit_ = makeQuadrature(pins::kEncLeftA, pins::kEncLeftB);
    rightUnit_ = makeQuadrature(pins::kEncRightA, pins::kEncRightB);
}

long Encoders::left() const { return read(leftUnit_); }
long Encoders::right() const { return read(rightUnit_); }

void Encoders::reset() {
    pcnt_unit_clear_count(leftUnit_);
    pcnt_unit_clear_count(rightUnit_);
}

}  // namespace micromouse::adapters
