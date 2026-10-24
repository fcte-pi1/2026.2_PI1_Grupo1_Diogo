#include "adapters/LocalInterfaceAdapter.hpp"

#include "adapters/BoardPins.hpp"
#include "driver/gpio.h"
#include "driver/ledc.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"

namespace micromouse::adapters {

namespace {

constexpr char kTag[] = "buzzer";

// O timer 0 e os canais 0 a 3 são dos motores (MotorDriver.cpp): o buzzer fica com o timer 1 e o
// canal 4, para que o PWM dos motores continue a 20 kHz.
constexpr ledc_mode_t kMode = LEDC_LOW_SPEED_MODE;
constexpr ledc_timer_t kTimer = LEDC_TIMER_1;
constexpr ledc_channel_t kChannel = LEDC_CHANNEL_4;
constexpr ledc_timer_bit_t kResolution = LEDC_TIMER_10_BIT;
constexpr uint32_t kHalfDuty = 512;  // 50% de onda quadrada com 10 bits
constexpr uint32_t kInitialHz = 2000;

// Nível do pino com o transistor em corte (buzzer calado). Com o BC547 NPN, nível baixo.
constexpr uint32_t kSilentLevel = pins::kBuzzerActiveHigh ? 0 : 1;

QueueHandle_t gQueue = nullptr;

void stopTone() { ledc_stop(kMode, kChannel, kSilentLevel); }

void startTone(uint32_t frequencyHz) {
    ledc_set_freq(kMode, kTimer, frequencyHz);
    ledc_set_duty(kMode, kChannel, kHalfDuty);
    ledc_update_duty(kMode, kChannel);
}

void playTones(domain::BuzzerPattern pattern) {
    for (const domain::Tone& tone : domain::patternTones(pattern)) {
        if (tone.frequencyHz != 0) {
            startTone(tone.frequencyHz);
        }
        vTaskDelay(pdMS_TO_TICKS(tone.durationMs));
        stopTone();
    }
}

void buzzerTask(void*) {
    while (true) {
        int pattern = 0;
        if (xQueueReceive(gQueue, &pattern, portMAX_DELAY) == pdTRUE) {
            playTones(static_cast<domain::BuzzerPattern>(pattern));
        }
    }
}

// O pino fica em nível de silêncio ANTES de o LEDC assumi-lo: com a base do transistor solta, o
// buzzer poderia estalar no boot.
void initBuzzer() {
    gpio_set_direction(pins::kBuzzer, GPIO_MODE_OUTPUT);
    gpio_set_level(pins::kBuzzer, kSilentLevel);

    ledc_timer_config_t timer{};
    timer.speed_mode = kMode;
    timer.timer_num = kTimer;
    timer.duty_resolution = kResolution;
    timer.freq_hz = kInitialHz;
    timer.clk_cfg = LEDC_AUTO_CLK;
    ledc_timer_config(&timer);

    ledc_channel_config_t channel{};
    channel.gpio_num = pins::kBuzzer;
    channel.speed_mode = kMode;
    channel.channel = kChannel;
    channel.timer_sel = kTimer;
    channel.duty = 0;
    channel.hpoint = 0;
    ledc_channel_config(&channel);
    stopTone();  // com duty 0 o pino ficaria em nível baixo, que ligaria um PNP

    gQueue = xQueueCreate(4, sizeof(int));
    if (gQueue == nullptr ||
        xTaskCreate(buzzerTask, "buzzer", 3072, nullptr, 2, nullptr) != pdPASS) {
        ESP_LOGE(kTag, "falha ao criar a tarefa do buzzer: os padroes sonoros ficam desligados");
        gQueue = nullptr;
    }
}

}  // namespace

void LocalInterfaceAdapter::begin() {
    const gpio_config_t output{
        .pin_bit_mask = (1ULL << pins::kLedReady) | (1ULL << pins::kLedError),
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

    initBuzzer();
}

bool LocalInterfaceAdapter::buttonPressed() const {
    return gpio_get_level(pins::kButton) == 0;  // ativo em nível baixo
}

void LocalInterfaceAdapter::signalReady() {
    gpio_set_level(pins::kLedReady, 1);
    gpio_set_level(pins::kLedError, 0);
    playPattern(domain::BuzzerPattern::Ready);
}

void LocalInterfaceAdapter::signalRunning() { gpio_set_level(pins::kLedReady, 1); }

void LocalInterfaceAdapter::signalError() {
    gpio_set_level(pins::kLedError, 1);
    playPattern(domain::BuzzerPattern::Alarm);  // 3 bips e depois silêncio (RF-9, RF-55)
}

void LocalInterfaceAdapter::signalGoal() { playPattern(domain::BuzzerPattern::Goal); }

void LocalInterfaceAdapter::playPattern(domain::BuzzerPattern pattern) {
    if (gQueue == nullptr) {
        return;
    }
    const int item = static_cast<int>(pattern);
    xQueueSend(gQueue, &item, 0);  // fila cheia: o padrão novo é descartado, nunca bloqueia
}

void LocalInterfaceAdapter::beep(uint32_t frequencyHz, uint32_t durationMs) {
    startTone(frequencyHz);
    vTaskDelay(pdMS_TO_TICKS(durationMs));
    stopTone();
}

}  // namespace micromouse::adapters
