#pragma once

#include <array>
#include <cstdint>
#include <optional>

#include "adapters/IdfRegisterBus.hpp"
#include "driver/gpio.h"
#include "driver/i2c_master.h"
#include "drivers/Vl53l1x.hpp"
#include "ports/SensorPort.hpp"

namespace micromouse::adapters {

// Lê os 3 ToF (frente/esquerda/direita) no barramento compartilhado e os
// converte em WallsAhead (parede se distância < limiar). Implementa ISensorPort.
class Vl53l1xSensorAdapter final : public ports::ISensorPort {
public:
    // Devolvido quando o sensor não tem medida válida: nada ao alcance (ou sensor ausente).
    static constexpr int kNoReadingMm = 9999;

    enum class Side { Left, Front, Right };

    struct Reading {
        int mm{kNoReadingMm};
        drivers::Vl53l1x::RangeStatus status{drivers::Vl53l1x::RangeStatus::None};
    };

private:
    struct Slot {
        const char* name;
        gpio_num_t xshut;
        uint8_t address;
        std::optional<drivers::Vl53l1x> sensor{};
        Reading last{};
    };

    double thresholdMm_;
    mutable IdfRegisterBus regBus_;
    mutable std::array<Slot, 3> slots_;

    bool bringUp(Slot& slot);
    Reading poll(Slot& slot, bool waitFresh) const;
    [[nodiscard]] int rangeMm(Side side) const;

public:
    explicit Vl53l1xSensorAdapter(double wallThresholdMm = 90.0);
    void begin(i2c_master_bus_handle_t bus);  // reendereça os sensores (RF-28)
    [[nodiscard]] ports::WallsAhead sense() const override;

    // True se os 3 sensores responderam e foram configurados no begin() (auto-teste, RF-27).
    [[nodiscard]] bool allReady() const;
    [[nodiscard]] bool ready(Side side) const;
    [[nodiscard]] Reading reading(Side side) const;  // última medida, sem esperar uma nova

    // Distâncias em mm. Públicas para o firmware de diagnóstico (esp32-diagnostico/).
    [[nodiscard]] int rangeFrontMm() const;
    [[nodiscard]] int rangeLeftMm() const;
    [[nodiscard]] int rangeRightMm() const;
};

}  // namespace micromouse::adapters
