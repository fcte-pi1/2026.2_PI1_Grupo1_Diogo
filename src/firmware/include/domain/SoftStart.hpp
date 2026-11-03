#pragma once

#include <cstdint>

namespace micromouse::domain {

// Partida suave dos motores: a potência sobe em rampa desde zero ao começar cada movimento. É
// preventiva: a corrente de partida dos N20 (cerca de 2 A com os dois travados, docs/7.3) pode
// derrubar a tensão do conversor, embora nos testes do hardware a placa não tenha reiniciado.
// Rampa de 80 ms, a mesma do firmware de teste do hardware.
inline constexpr uint32_t kSoftStartMs = 80;

// Fração da potência alvo a aplicar depois de `elapsedMs` desde o início do movimento: sobe em
// linha reta de 0 a 1 em `rampMs` e fica em 1 depois disso.
[[nodiscard]] double softStartFactor(uint32_t elapsedMs, uint32_t rampMs = kSoftStartMs) noexcept;

}  // namespace micromouse::domain
