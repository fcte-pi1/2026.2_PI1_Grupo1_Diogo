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
    // Sem alvo ao alcance (corredor aberto): conta como "sem parede".
    static constexpr int kNoReadingMm = 9999;
    // Sensor em falha (não respondeu ou não mediu a tempo): não se sabe se há parede.
    static constexpr int kFaultMm = -1;

    enum class Side { Left, Front, Right };

    struct Reading {
        int mm{kFaultMm};
        drivers::Vl53l1x::RangeStatus status{drivers::Vl53l1x::RangeStatus::None};
        drivers::ReadingKind kind{drivers::ReadingKind::Fault};
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
    mutable bool healthy_{true};
    mutable char faultSummary_[48]{};

    bool bringUp(Slot& slot);
    Reading poll(Slot& slot, bool requireFresh) const;
    [[nodiscard]] int rangeMm(Side side) const;

public:
    explicit Vl53l1xSensorAdapter(double wallThresholdMm = 90.0);
    void begin(i2c_master_bus_handle_t bus);  // reendereça os sensores (RF-28)
    [[nodiscard]] ports::WallsAhead sense() const override;

    // True se os 3 sensores responderam e foram configurados no begin() (auto-teste, RF-27).
    [[nodiscard]] bool allReady() const;
    // True se, no último sense(), os 3 sensores deram medida ou "sem alvo" (nenhuma falha). O laço
    // da navegação usa isto no SensorHealthMonitor (RF-55): falhas seguidas levam ao estado Erro.
    [[nodiscard]] bool healthy() const noexcept { return healthy_; }
    // Quais sensores falharam no último sense() (vazio se nenhum), para o motivo do fim da corrida.
    [[nodiscard]] const char* faultSummary() const noexcept { return faultSummary_; }
    [[nodiscard]] bool ready(Side side) const;
    [[nodiscard]] Reading reading(Side side) const;  // última medida guardada, não lê uma nova
    // Medida nova de um lado, se o sensor tiver uma pronta (não espera, e consome a medida). Para a
    // centralização pelas paredes durante o movimento (RF-44). Não mexe em healthy().
    [[nodiscard]] std::optional<Reading> freshReading(Side side) const;

    // Distâncias em mm. Públicas para o firmware de diagnóstico (esp32-diagnostico/).
    [[nodiscard]] int rangeFrontMm() const;
    [[nodiscard]] int rangeLeftMm() const;
    [[nodiscard]] int rangeRightMm() const;
};

}  // namespace micromouse::adapters
