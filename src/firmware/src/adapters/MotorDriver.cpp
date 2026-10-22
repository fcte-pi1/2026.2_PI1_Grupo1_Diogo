#include "adapters/MotorDriver.hpp"

#include <algorithm>
#include <cmath>

#include "adapters/BoardPins.hpp"
#include "driver/ledc.h"

namespace micromouse::adapters {

namespace {
constexpr ledc_timer_t kTimer = LEDC_TIMER_0;
constexpr ledc_mode_t kMode = LEDC_LOW_SPEED_MODE;
constexpr uint32_t kFreqHz = 20000;               // 20 kHz: fora do audível
constexpr ledc_timer_bit_t kResBits = LEDC_TIMER_10_BIT;
constexpr uint32_t kDutyMax = 1023;

enum Channel { kLeftIn1, kLeftIn2, kRightIn1, kRightIn2 };

void configChannel(int channel, gpio_num_t pin) {
    ledc_channel_config_t config{};
    config.gpio_num = pin;
    config.speed_mode = kMode;
    config.channel = static_cast<ledc_channel_t>(channel);
    config.timer_sel = kTimer;
    config.duty = 0;
    config.hpoint = 0;
    ledc_channel_config(&config);
}
}  // namespace

void MotorDriver::begin() {
    ledc_timer_config_t timer{};
    timer.speed_mode = kMode;
    timer.timer_num = kTimer;
    timer.duty_resolution = kResBits;
    timer.freq_hz = kFreqHz;
    timer.clk_cfg = LEDC_AUTO_CLK;
    ledc_timer_config(&timer);

    configChannel(kLeftIn1, pins::kMotorLeftIn1);
    configChannel(kLeftIn2, pins::kMotorLeftIn2);
    configChannel(kRightIn1, pins::kMotorRightIn1);
    configChannel(kRightIn2, pins::kMotorRightIn2);
}

void MotorDriver::drive(int in1Channel, int in2Channel, double value) {
    value = std::clamp(value, -1.0, 1.0);
    const uint32_t duty = static_cast<uint32_t>(std::abs(value) * kDutyMax);
    const auto channel1 = static_cast<ledc_channel_t>(in1Channel);
    const auto channel2 = static_cast<ledc_channel_t>(in2Channel);

    if (value >= 0.0) {
        ledc_set_duty(kMode, channel1, duty);
        ledc_set_duty(kMode, channel2, 0);
    } else {
        ledc_set_duty(kMode, channel1, 0);
        ledc_set_duty(kMode, channel2, duty);
    }
    ledc_update_duty(kMode, channel1);
    ledc_update_duty(kMode, channel2);
}

void MotorDriver::setNormalized(double left, double right) {
    drive(kLeftIn1, kLeftIn2, left);
    drive(kRightIn1, kRightIn2, right);
}

void MotorDriver::brake() { setNormalized(0.0, 0.0); }

}  // namespace micromouse::adapters
