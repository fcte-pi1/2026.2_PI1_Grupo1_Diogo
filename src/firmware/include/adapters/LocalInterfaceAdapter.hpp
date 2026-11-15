#pragma once

#include <cstdint>

#include "domain/BuzzerPattern.hpp"
#include "ports/SignalPort.hpp"

namespace micromouse::adapters {

// Aciona LEDs/buzzer e lê o botão de início.
//
// O buzzer é passivo (precisa de um tom) e usa um canal e um timer do LEDC só dele: o timer 0
// é dos motores, a 20 kHz, e não pode mudar de frequência (#392). Cada padrão sonoro toca numa
// tarefa própria, então quem sinaliza (a navegação) não espera o som terminar.
class LocalInterfaceAdapter final : public ports::ISignalPort {
public:
    void begin();
    [[nodiscard]] bool buttonPressed() const;

    void signalReady() override;
    void signalRunning() override;
    void signalError() override;
    void signalGoal() override;

    // Toca um padrão em segundo plano, sem bloquear. Ignorado se o begin() não rodou.
    void playPattern(domain::BuzzerPattern pattern);
    // Toca um tom de frequencyHz por durationMs e BLOQUEIA até acabar (firmware de diagnóstico).
    void beep(uint32_t frequencyHz, uint32_t durationMs);
};

}  // namespace micromouse::adapters
