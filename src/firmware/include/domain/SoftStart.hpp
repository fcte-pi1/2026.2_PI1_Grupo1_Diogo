#pragma once

#include <cstdint>

namespace micromouse::domain {

// Partida suave dos motores: a potência sobe em rampa desde zero ao começar cada movimento. Sem
// ela, a corrente de partida dos N20 derruba a tensão do conversor e o ESP32 reinicia por
// brownout (firmware de teste do hardware, rampa de 80 ms).
inline constexpr uint32_t kSoftStartMs = 80;

// Fração da potência alvo a aplicar depois de `elapsedMs` desde o início do movimento: sobe em
// linha reta de 0 a 1 em `rampMs` e fica em 1 depois disso.
[[nodiscard]] double softStartFactor(uint32_t elapsedMs, uint32_t rampMs = kSoftStartMs) noexcept;

}  // namespace micromouse::domain
