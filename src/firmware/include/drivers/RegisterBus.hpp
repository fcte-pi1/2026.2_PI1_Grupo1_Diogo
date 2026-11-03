#pragma once

#include <cstddef>
#include <cstdint>

namespace micromouse::drivers {

// Barramento I²C visto por um driver de sensor: escreve e lê bytes num endereço de 7 bits.
// O firmware implementa com o i2c_master do ESP-IDF (adapters/IdfRegisterBus); os testes, com
// um sensor simulado em memória. Assim o driver do VL53L1X roda e é testado no PC.
class IRegisterBus {
public:
    virtual ~IRegisterBus() = default;
    // Escreve `length` bytes no dispositivo. Devolve false se ele não respondeu (NACK).
    virtual bool write(uint8_t address, const uint8_t* data, size_t length) = 0;
    // Escreve `txLength` bytes e lê `rxLength` bytes do mesmo dispositivo.
    virtual bool writeRead(uint8_t address, const uint8_t* tx, size_t txLength, uint8_t* rx,
                           size_t rxLength) = 0;
    virtual void delayMs(uint32_t ms) = 0;
    [[nodiscard]] virtual uint32_t millis() const = 0;
};

}  // namespace micromouse::drivers
