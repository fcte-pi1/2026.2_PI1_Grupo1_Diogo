#pragma once

#include "driver/i2c_master.h"
#include "ports/SensorPort.hpp"

namespace micromouse::adapters {

// Lê os 3 ToF (frente/esquerda/direita) no barramento compartilhado e os
// converte em WallsAhead (parede se distância < limiar). Implementa ISensorPort.
class Vl53l1xSensorAdapter final : public ports::ISensorPort {
private:
    i2c_master_bus_handle_t bus_{nullptr};
    double thresholdMm_;

public:
    explicit Vl53l1xSensorAdapter(double wallThresholdMm = 90.0);
    void begin(i2c_master_bus_handle_t bus);  // reendereça os sensores (RF-28)
    [[nodiscard]] ports::WallsAhead sense() const override;

    // Distâncias em mm. Públicas para o firmware de diagnóstico (esp32-diagnostico/).
    [[nodiscard]] int rangeFrontMm() const;
    [[nodiscard]] int rangeLeftMm() const;
    [[nodiscard]] int rangeRightMm() const;
};

}  // namespace micromouse::adapters
