#pragma once

#include <cstdint>

namespace micromouse::domain {

// Toque do botão de largada (19/11): curto larga a corrida (ao SOLTAR); longo alterna a orientação do
// labirinto (em pé <-> deitado, e o 4x4 passa a ser relatado girado), sem largar.
// PROPOSTA A CONFIRMAR: 1000 ms para o toque longo.
inline constexpr uint32_t kLongPressMs = 1000;
inline constexpr uint32_t kButtonDebounceMs = 30;

enum class ButtonEvent {
    None,
    ShortPress,  // soltou depois de um toque curto: larga
    LongPress    // completou o tempo de toque longo, ainda apertado: alterna (uma vez por toque)
};

class ButtonGesture {
public:
    // `startPressed`: o botão já estava apertado ao começar a esperar (da sessão anterior). Só conta
    // depois de soltar e apertar de novo.
    explicit ButtonGesture(bool startPressed = false) noexcept : waitRelease_(startPressed) {}

    // Chamar a cada leitura do botão, com o tempo em ms.
    [[nodiscard]] ButtonEvent update(bool pressed, uint32_t nowMs) noexcept {
        if (waitRelease_) {
            waitRelease_ = pressed;
            return ButtonEvent::None;
        }
        if (pressed) {
            if (!down_) {
                down_ = true;
                longReported_ = false;
                since_ = nowMs;
                return ButtonEvent::None;
            }
            if (!longReported_ && nowMs - since_ >= kLongPressMs) {
                longReported_ = true;
                return ButtonEvent::LongPress;
            }
            return ButtonEvent::None;
        }
        if (!down_) {
            return ButtonEvent::None;
        }
        down_ = false;
        if (longReported_ || nowMs - since_ < kButtonDebounceMs) {
            return ButtonEvent::None;  // o toque longo já foi usado; ou foi um quique
        }
        return ButtonEvent::ShortPress;
    }

private:
    bool waitRelease_;
    bool down_{false};
    bool longReported_{false};
    uint32_t since_{0};
};

}  // namespace micromouse::domain
