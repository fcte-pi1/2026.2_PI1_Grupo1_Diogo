#pragma once

#include <cstdint>
#include <vector>

namespace micromouse::domain {

// Um trecho do padrão sonoro: um tom de frequencyHz (0 = silêncio) por durationMs.
struct Tone {
    uint16_t frequencyHz;
    uint16_t durationMs;
};

// Os três padrões do buzzer passivo, validados na bancada pelo hardware (TESTE-HW-08, #392).
enum class BuzzerPattern {
    Ready,  // RF-32: prontidão, 2 bips agudos de 2,5 kHz
    Goal,   // RF-8: objetivo cumprido, tom ascendente de 2,0 a 3,8 kHz
    Alarm   // RF-9 e RF-55: falha ou bateria fraca, 3 bips graves de 1,5 kHz
};

[[nodiscard]] std::vector<Tone> patternTones(BuzzerPattern pattern);

[[nodiscard]] uint32_t patternDurationMs(BuzzerPattern pattern);

[[nodiscard]] const char* patternName(BuzzerPattern pattern) noexcept;

}  // namespace micromouse::domain
