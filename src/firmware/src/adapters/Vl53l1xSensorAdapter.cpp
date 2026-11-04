#include "adapters/Vl53l1xSensorAdapter.hpp"

#include "adapters/BoardPins.hpp"
#include "esp_log.h"

namespace micromouse::adapters {

namespace {

constexpr char kTag[] = "tof";

// Parâmetros do firmware de teste do hardware, que funcionaram na bancada: modo curto (paredes
// a poucos centímetros), 50 ms por medida e uma medida nova a cada 50 ms.
constexpr uint32_t kTimingBudgetUs = 50000;
constexpr uint32_t kPeriodMs = 50;
constexpr uint16_t kIoTimeoutMs = 300;
// XSHUT em 0 por 150 ms para o sensor esquecer o endereço antigo, e 60 ms de boot ao religar.
constexpr uint32_t kShutdownMs = 150;
constexpr uint32_t kBootMs = 60;
// Ao sentir as paredes, espera uma medida feita depois que o robô parou (no máximo ~1,5 medida).
constexpr uint32_t kFreshTimeoutMs = 80;

}  // namespace

Vl53l1xSensorAdapter::Vl53l1xSensorAdapter(double wallThresholdMm)
    : thresholdMm_(wallThresholdMm),
      // Endereços do "4.3 - Projeto conceitual de hardware", Seção 5.2.
      slots_{{Slot{"esquerdo", pins::kTofLeftXshut, 0x30},
              Slot{"frontal", pins::kTofFrontXshut, 0x31},
              Slot{"direito", pins::kTofRightXshut, 0x32}}} {}

// Liga um sensor e o move para o endereço dele. Normalmente ele acorda em 0x29; se o XSHUT não
// o reiniciou de vez (já aconteceu na bancada), ele ainda está no endereço novo, e serve também.
bool Vl53l1xSensorAdapter::bringUp(Slot& slot) {
    gpio_set_level(slot.xshut, 1);
    regBus_.delayMs(kBootMs);

    for (const uint8_t address : {drivers::Vl53l1x::kDefaultAddress, slot.address}) {
        if (!regBus_.probe(address)) {
            continue;
        }
        slot.sensor.emplace(regBus_, address);
        drivers::Vl53l1x& sensor = *slot.sensor;
        sensor.setTimeout(kIoTimeoutMs);
        if (!sensor.init()) {
            continue;
        }
        if (sensor.address() != slot.address) {
            sensor.setAddress(slot.address);
        }
        sensor.setDistanceMode(drivers::Vl53l1x::DistanceMode::Short);
        sensor.setMeasurementTimingBudget(kTimingBudgetUs);
        sensor.startContinuous(kPeriodMs);
        if (sensor.lastTransferOk()) {
            ESP_LOGI(kTag, "%s pronto em 0x%02X", slot.name, slot.address);
            return true;
        }
    }

    slot.sensor.reset();
    gpio_set_level(slot.xshut, 0);  // desligado, para não ocupar o 0x29 dos outros
    ESP_LOGE(kTag, "%s nao respondeu (XSHUT=GPIO%d)", slot.name, slot.xshut);
    return false;
}

void Vl53l1xSensorAdapter::begin(i2c_master_bus_handle_t bus) {
    regBus_.attach(bus);

    // 1) Desliga TODOS por XSHUT=0 (todos voltam a 0x29 ao religar).
    for (Slot& slot : slots_) {
        gpio_reset_pin(slot.xshut);
        gpio_set_direction(slot.xshut, GPIO_MODE_OUTPUT);
        gpio_set_level(slot.xshut, 0);
        slot.sensor.reset();
        slot.last = {};
    }
    regBus_.delayMs(kShutdownMs);

    // 2) Liga e reendereça um a um: esquerdo 0x30, frontal 0x31, direito 0x32 (RF-28).
    for (Slot& slot : slots_) {
        bringUp(slot);
    }
}

// Lê um sensor. Com waitFresh (ao sentir as paredes), espera uma medida nova; se ela não vier no
// prazo, ou se o sensor não responder, a leitura é FALHA, e não a parede da célula anterior.
Vl53l1xSensorAdapter::Reading Vl53l1xSensorAdapter::poll(Slot& slot, bool waitFresh) const {
    if (!slot.sensor) {
        slot.last = {};
        return slot.last;
    }
    drivers::Vl53l1x& sensor = *slot.sensor;
    bool ready = sensor.dataReady();
    if (waitFresh) {
        const uint32_t start = regBus_.millis();
        while (!ready && regBus_.millis() - start < kFreshTimeoutMs) {
            regBus_.delayMs(1);
            ready = sensor.dataReady();
        }
    }
    if (ready) {
        const uint16_t mm = sensor.read(false);
        const drivers::Vl53l1x::RangeStatus status = sensor.rangingData().status;
        const drivers::ReadingKind kind =
            drivers::classifyReading(sensor.lastTransferOk(), true, status);
        switch (kind) {
            case drivers::ReadingKind::Distance:
                slot.last = {static_cast<int>(mm), status, kind};
                break;
            case drivers::ReadingKind::NoTarget:
                slot.last = {kNoReadingMm, status, kind};
                break;
            case drivers::ReadingKind::Fault:
                slot.last = {kFaultMm, status, kind};
                break;
        }
    } else if (waitFresh) {
        // Nenhuma medida nova no prazo (ou o sensor parou de responder).
        slot.last = {kFaultMm, drivers::Vl53l1x::RangeStatus::None, drivers::ReadingKind::Fault};
    }
    return slot.last;
}

int Vl53l1xSensorAdapter::rangeMm(Side side) const {
    return poll(slots_[static_cast<size_t>(side)], false).mm;
}

int Vl53l1xSensorAdapter::rangeFrontMm() const { return rangeMm(Side::Front); }
int Vl53l1xSensorAdapter::rangeLeftMm() const { return rangeMm(Side::Left); }
int Vl53l1xSensorAdapter::rangeRightMm() const { return rangeMm(Side::Right); }

bool Vl53l1xSensorAdapter::ready(Side side) const {
    return slots_[static_cast<size_t>(side)].sensor.has_value();
}

bool Vl53l1xSensorAdapter::allReady() const {
    return ready(Side::Left) && ready(Side::Front) && ready(Side::Right);
}

Vl53l1xSensorAdapter::Reading Vl53l1xSensorAdapter::reading(Side side) const {
    return poll(slots_[static_cast<size_t>(side)], false);
}

ports::WallsAhead Vl53l1xSensorAdapter::sense() const {
    // Parede presente quando a distância medida fica abaixo do limiar
    // calibrado (RNF-31). O limiar vem do construtor (thresholdMm_).
    // Uma medida já pronta pode ser de quando o robô ainda andava: descarta a dos três sensores
    // e espera a próxima, que todos fazem ao mesmo tempo (no máximo ~50 ms).
    for (Slot& slot : slots_) {
        if (slot.sensor && slot.sensor->dataReady()) {
            (void)slot.sensor->read(false);
        }
    }
    const Reading left = poll(slots_[static_cast<size_t>(Side::Left)], true);
    const Reading front = poll(slots_[static_cast<size_t>(Side::Front)], true);
    const Reading right = poll(slots_[static_cast<size_t>(Side::Right)], true);

    // Um sensor em falha conta como PAREDE: o robô não avança por um lado que não enxerga. E a
    // falha fica registrada em healthy(), para o laço da navegação levar ao Erro se ela persistir.
    auto wall = [this](const Reading& reading) {
        switch (reading.kind) {
            case drivers::ReadingKind::Distance:
                return reading.mm < thresholdMm_;
            case drivers::ReadingKind::NoTarget:
                return false;
            case drivers::ReadingKind::Fault:
                return true;
        }
        return true;
    };
    healthy_ = left.kind != drivers::ReadingKind::Fault &&
               front.kind != drivers::ReadingKind::Fault &&
               right.kind != drivers::ReadingKind::Fault;
    if (!healthy_) {
        ESP_LOGW(kTag, "falha de leitura: esq %s, frente %s, dir %s",
                 left.kind == drivers::ReadingKind::Fault ? "FALHA" : "ok",
                 front.kind == drivers::ReadingKind::Fault ? "FALHA" : "ok",
                 right.kind == drivers::ReadingKind::Fault ? "FALHA" : "ok");
    }
    return {wall(front), wall(left), wall(right)};
}

}  // namespace micromouse::adapters
