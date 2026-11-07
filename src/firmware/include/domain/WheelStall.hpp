#pragma once

namespace micromouse::domain {

// Roda parada na reta: uma roda quase não gira enquanto a outra anda (motor sem força, fio ou
// conector solto, roda travada). Visto em 04/11 e 07/11 com a roda esquerda.
struct WheelStallConfig {
    long minPulses;   // só decide depois que a roda mais rápida andou isto (partida, folgas)
    double minRatio;  // abaixo desta fração da mais rápida, a mais lenta está parada
};

enum class StalledWheel { None, Left, Right };

[[nodiscard]] StalledWheel detectStalledWheel(long leftPulses, long rightPulses,
                                              const WheelStallConfig& config) noexcept;

[[nodiscard]] const char* stalledWheelName(StalledWheel wheel) noexcept;

}  // namespace micromouse::domain
