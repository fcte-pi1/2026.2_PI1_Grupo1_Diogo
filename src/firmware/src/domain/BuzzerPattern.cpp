#include "domain/BuzzerPattern.hpp"

namespace micromouse::domain {

std::vector<Tone> patternTones(BuzzerPattern pattern) {
    switch (pattern) {
        case BuzzerPattern::Ready:
            return {{2500, 80}, {0, 80}, {2500, 80}};
        case BuzzerPattern::Goal:
            return {{2000, 100}, {2800, 100}, {3800, 250}};
        case BuzzerPattern::Alarm:
            return {{1500, 150}, {0, 150}, {1500, 150}, {0, 150}, {1500, 150}};
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
