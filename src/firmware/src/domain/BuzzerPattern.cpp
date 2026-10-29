#include "domain/BuzzerPattern.hpp"

namespace micromouse::domain {

std::vector<Tone> patternTones(BuzzerPattern pattern) {
    switch (pattern) {
        case BuzzerPattern::Ready:
            return {{1300, 160}, {0, 80}, {1300, 160}};
        case BuzzerPattern::Goal:
            return {{1200, 100}, {1350, 100}, {1500, 250}};
        case BuzzerPattern::Alarm:
            return {{1800, 150}, {0, 150}, {1800, 150}, {0, 150}, {1800, 150}};
    }
    return {};
}

uint32_t patternDurationMs(BuzzerPattern pattern) {
    uint32_t total = 0;
    for (const Tone& tone : patternTones(pattern)) {
        total += tone.durationMs;
    }
    return total;
}

const char* patternName(BuzzerPattern pattern) noexcept {
    switch (pattern) {
        case BuzzerPattern::Ready:
            return "pronto";
        case BuzzerPattern::Goal:
            return "objetivo";
        case BuzzerPattern::Alarm:
            return "alarme";
    }
    return "?";
}

}  // namespace micromouse::domain
