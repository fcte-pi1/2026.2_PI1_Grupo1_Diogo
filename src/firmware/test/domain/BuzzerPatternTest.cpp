#include <gtest/gtest.h>

#include <cstring>

#include "domain/BuzzerPattern.hpp"

namespace micromouse::domain {

namespace {

int countBeeps(const std::vector<Tone>& tones, uint16_t frequencyHz) {
    int beeps = 0;
    for (const Tone& tone : tones) {
        if (tone.frequencyHz == frequencyHz) {
            ++beeps;
        }
    }
    return beeps;
}

}  // namespace

// RF-32: dois bips agudos de 2,5 kHz, de 80 ms, com 80 ms de pausa.
TEST(BuzzerPattern, ReadyIsTwoBeepsAt2500Hz) {
    const std::vector<Tone> tones = patternTones(BuzzerPattern::Ready);
    ASSERT_EQ(tones.size(), 3u);
    EXPECT_EQ(countBeeps(tones, 2500), 2);
    EXPECT_EQ(tones[0].durationMs, 80);
    EXPECT_EQ(tones[1].frequencyHz, 0);  // pausa entre os bips
    EXPECT_EQ(tones[1].durationMs, 80);
    EXPECT_EQ(patternDurationMs(BuzzerPattern::Ready), 240u);
}

// RF-8: três tons que sobem, 2,0 a 2,8 a 3,8 kHz.
TEST(BuzzerPattern, GoalAscends) {
    const std::vector<Tone> tones = patternTones(BuzzerPattern::Goal);
    ASSERT_EQ(tones.size(), 3u);
    EXPECT_EQ(tones[0].frequencyHz, 2000);
    EXPECT_EQ(tones[1].frequencyHz, 2800);
    EXPECT_EQ(tones[2].frequencyHz, 3800);
    EXPECT_LT(tones[0].frequencyHz, tones[1].frequencyHz);
    EXPECT_LT(tones[1].frequencyHz, tones[2].frequencyHz);
    EXPECT_EQ(patternDurationMs(BuzzerPattern::Goal), 450u);
}

// RF-9 e RF-55: três bips graves de 1,5 kHz, e o último não deixa pausa pendurada no fim.
TEST(BuzzerPattern, AlarmIsThreeLowBeeps) {
    const std::vector<Tone> tones = patternTones(BuzzerPattern::Alarm);
    EXPECT_EQ(countBeeps(tones, 1500), 3);
    EXPECT_NE(tones.back().frequencyHz, 0);
    EXPECT_EQ(patternDurationMs(BuzzerPattern::Alarm), 750u);
}

// O alarme é grave, o pronto é agudo e o objetivo passa pelos dois: dá para distinguir de ouvido.
TEST(BuzzerPattern, PatternsAreAudiblyDistinct) {
    const uint16_t alarm = patternTones(BuzzerPattern::Alarm).front().frequencyHz;
    const uint16_t ready = patternTones(BuzzerPattern::Ready).front().frequencyHz;
    EXPECT_LT(alarm, ready);
    EXPECT_LT(patternTones(BuzzerPattern::Goal).front().frequencyHz, ready);
}

// Faixa útil de um buzzer piezoelétrico passivo, e nenhum trecho de duração zero.
TEST(BuzzerPattern, TonesAreInRangeAndNonEmpty) {
    for (const BuzzerPattern pattern :
         {BuzzerPattern::Ready, BuzzerPattern::Goal, BuzzerPattern::Alarm}) {
        for (const Tone& tone : patternTones(pattern)) {
            EXPECT_GT(tone.durationMs, 0) << patternName(pattern);
            if (tone.frequencyHz != 0) {
                EXPECT_GE(tone.frequencyHz, 500) << patternName(pattern);
                EXPECT_LE(tone.frequencyHz, 5000) << patternName(pattern);
            }
        }
    }
}

// O padrão tem que terminar em segundos baixos: o robô fica parado enquanto toca.
TEST(BuzzerPattern, EveryPatternIsShort) {
    for (const BuzzerPattern pattern :
         {BuzzerPattern::Ready, BuzzerPattern::Goal, BuzzerPattern::Alarm}) {
        EXPECT_LT(patternDurationMs(pattern), 1000u) << patternName(pattern);
    }
}

TEST(BuzzerPattern, NamesMatchDiagnosticCommands) {
    EXPECT_STREQ(patternName(BuzzerPattern::Ready), "pronto");
    EXPECT_STREQ(patternName(BuzzerPattern::Goal), "objetivo");
    EXPECT_STREQ(patternName(BuzzerPattern::Alarm), "alarme");
}

}  // namespace micromouse::domain
