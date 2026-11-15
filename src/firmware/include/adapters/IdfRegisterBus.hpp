#pragma once

#include <array>
#include <cstdint>

#include "driver/i2c_master.h"
#include "drivers/RegisterBus.hpp"

namespace micromouse::adapters {

// IRegisterBus sobre o i2c_master do ESP-IDF. Registra um device por endereço na primeira vez
// que ele é usado: os VL53L1X mudam de endereço durante o reendereçamento (0x29 -> 0x30...).
class IdfRegisterBus final : public drivers::IRegisterBus {
public:
    // Falhas de transação de um endereço desde o boot (12/11): na pista de 11/11 o ToF direito
    // parou de responder e nada no log dizia desde quando, nem se era NACK (o sensor não está no
    // endereço) ou tempo esgotado (barramento preso). `slow` conta as que levaram o tempo limite.
    struct Stats {
        unsigned errors{0};
        unsigned slow{0};
        unsigned worstMs{0};
        int lastError{0};  // esp_err_t da última falha (0 = nunca falhou)
    };

private:
    static constexpr uint32_t kSpeedHz = 400000;
    static constexpr int kTimeoutMs = 20;

    i2c_master_bus_handle_t bus_{nullptr};
    std::array<i2c_master_dev_handle_t, 128> devices_{};
    std::array<Stats, 128> stats_{};

    i2c_master_dev_handle_t device(uint8_t address);
    bool note(uint8_t address, int result, int64_t startedUs);

public:
    void attach(i2c_master_bus_handle_t bus) noexcept { bus_ = bus; }
    // True se algum dispositivo responde no endereço (sem registrá-lo).
    bool probe(uint8_t address);
    [[nodiscard]] const Stats& stats(uint8_t address) const noexcept {
        return stats_[address & 0x7F];
    }
    // Repõe os contadores de um endereço (o adaptador dos ToF tira da conta as falhas esperadas
    // durante a configuração de um sensor).
    void setStats(uint8_t address, const Stats& stats) noexcept { stats_[address & 0x7F] = stats; }
    static constexpr int timeoutMs() noexcept { return kTimeoutMs; }

    bool write(uint8_t address, const uint8_t* data, size_t length) override;
    bool writeRead(uint8_t address, const uint8_t* tx, size_t txLength, uint8_t* rx,
                   size_t rxLength) override;
    void delayMs(uint32_t ms) override;
    [[nodiscard]] uint32_t millis() const override;
};

}  // namespace micromouse::adapters
