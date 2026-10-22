#include "adapters/BenchMotionAdapter.hpp"

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace micromouse::adapters {

namespace {
// Tempos próximos aos de um micromouse lento, para o painel ter o que animar.
constexpr TickType_t kCellTime = pdMS_TO_TICKS(600);
constexpr TickType_t kTurnTime = pdMS_TO_TICKS(300);
}  // namespace

void BenchMotionAdapter::advanceCell() { vTaskDelay(kCellTime); }
void BenchMotionAdapter::turnLeft() { vTaskDelay(kTurnTime); }
void BenchMotionAdapter::turnRight() { vTaskDelay(kTurnTime); }
void BenchMotionAdapter::turnAround() { vTaskDelay(2 * kTurnTime); }

}  // namespace micromouse::adapters
