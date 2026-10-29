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

// As frequências seguem a calibração do hardware na ressonância do transdutor, com pico em
// 1200 Hz (docs/7.3, item 3.9).
// RF-32: dois bips de 1,3 kHz, de 160 ms, com 80 ms de pausa.
TEST(BuzzerPattern, ReadyIsTwoBeepsAt1300Hz) {
    const std::vector<Tone> tones = patternTones(BuzzerPattern::Ready);
    ASSERT_EQ(tones.size(), 3u);
    EXPECT_EQ(countBeeps(tones, 1300), 2);
    EXPECT_EQ(tones[0].durationMs, 160);
    EXPECT_EQ(tones[1].frequencyHz, 0);  // pausa entre os bips
    EXPECT_EQ(tones[1].durationMs, 80);
    EXPECT_EQ(patternDurationMs(BuzzerPattern::Ready), 400u);
}

// RF-8: três tons que sobem, 1,2 a 1,35 a 1,5 kHz.
TEST(BuzzerPattern, GoalAscends) {
    const std::vector<Tone> tones = patternTones(BuzzerPattern::Goal);
    ASSERT_EQ(tones.size(), 3u);
    EXPECT_EQ(tones[0].frequencyHz, 1200);
    EXPECT_EQ(tones[1].frequencyHz, 1350);
    EXPECT_EQ(tones[2].frequencyHz, 1500);
    EXPECT_LT(tones[0].frequencyHz, tones[1].frequencyHz);
    EXPECT_LT(tones[1].frequencyHz, tones[2].frequencyHz);
    EXPECT_EQ(patternDurationMs(BuzzerPattern::Goal), 450u);
}

// RF-9 e RF-55: três bips de 1,8 kHz, e o último não deixa pausa pendurada no fim.
TEST(BuzzerPattern, AlarmIsThreeBeepsAt1800Hz) {
    const std::vector<Tone> tones = patternTones(BuzzerPattern::Alarm);
    EXPECT_EQ(countBeeps(tones, 1800), 3);
    EXPECT_NE(tones.back().frequencyHz, 0);
    EXPECT_EQ(patternDurationMs(BuzzerPattern::Alarm), 750u);
}

// Os três padrões se distinguem de ouvido: o alarme é o mais agudo, o objetivo é o único que muda
// de tom, e o pronto e o alarme diferem na duração do bip e no número de bips.
TEST(BuzzerPattern, PatternsAreAudiblyDistinct) {
    const std::vector<Tone> ready = patternTones(BuzzerPattern::Ready);
    const std::vector<Tone> goal = patternTones(BuzzerPattern::Goal);
    const std::vector<Tone> alarm = patternTones(BuzzerPattern::Alarm);
    EXPECT_GT(alarm.front().frequencyHz, ready.front().frequencyHz);
    EXPECT_NE(goal[0].frequencyHz, goal[1].frequencyHz);
    EXPECT_NE(countBeeps(ready, 1300), countBeeps(alarm, 1800));
    EXPECT_NE(ready.front().durationMs, alarm.front().durationMs);
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
