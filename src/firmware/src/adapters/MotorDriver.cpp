#include "adapters/MotorDriver.hpp"

#include <cmath>

#include "adapters/BoardPins.hpp"
#include "domain/BridgeDrive.hpp"
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

void MotorDriver::apply(int in1Channel, int in2Channel, const domain::BridgeDuty& duty) {
    const auto channel1 = static_cast<ledc_channel_t>(in1Channel);
    const auto channel2 = static_cast<ledc_channel_t>(in2Channel);
    ledc_set_duty(kMode, channel1, static_cast<uint32_t>(std::lround(duty.in1 * kDutyMax)));
    ledc_set_duty(kMode, channel2, static_cast<uint32_t>(std::lround(duty.in2 * kDutyMax)));
    ledc_update_duty(kMode, channel1);
    ledc_update_duty(kMode, channel2);
}

void MotorDriver::setNormalized(double left, double right) {
    apply(kLeftIn1, kLeftIn2, domain::bridgeDuty(invertLeft_ ? -left : left, kMotorDecay));
    apply(kRightIn1, kRightIn2, domain::bridgeDuty(right, kMotorDecay));
}

// Freio de verdade (as duas entradas em 1). Com as duas em 0, o motor ficava solto e o robô
// deslizava depois de cada célula e de cada curva.
void MotorDriver::brake() {
    apply(kLeftIn1, kLeftIn2, domain::kBridgeBrake);
    apply(kRightIn1, kRightIn2, domain::kBridgeBrake);
}

}  // namespace micromouse::adapters
