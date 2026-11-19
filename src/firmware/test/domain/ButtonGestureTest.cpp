#include <gtest/gtest.h>

#include "domain/ButtonGesture.hpp"

namespace micromouse::domain {
namespace {

// Roda o gesto com o botão apertado de `pressAtMs` a `releaseAtMs`, lendo a cada 10 ms, e devolve os
// eventos na ordem.
struct Events {
    int shortPresses{0};
    int longPresses{0};
    int firstLongAtMs{-1};
    int firstShortAtMs{-1};
};

Events run(ButtonGesture& gesture, int pressAtMs, int releaseAtMs, int untilMs) {
    Events events;
    for (int t = 0; t <= untilMs; t += 10) {
        const bool pressed = t >= pressAtMs && t < releaseAtMs;
        const ButtonEvent event = gesture.update(pressed, static_cast<uint32_t>(t));
        if (event == ButtonEvent::ShortPress) {
            if (events.shortPresses++ == 0) events.firstShortAtMs = t;
        }
        if (event == ButtonEvent::LongPress) {
            if (events.longPresses++ == 0) events.firstLongAtMs = t;
        }
    }
    return events;
}

// Toque curto: larga ao SOLTAR (antes largava ao apertar, o que não deixa distinguir o toque longo).
TEST(ButtonGesture, AShortPressIsReportedOnReleaseOnly) {
    ButtonGesture gesture;
    const Events e = run(gesture, 100, 400, 1000);
    EXPECT_EQ(e.shortPresses, 1);
    EXPECT_EQ(e.longPresses, 0);
    EXPECT_GE(e.firstShortAtMs, 400);  // só depois de soltar
    EXPECT_LE(e.firstShortAtMs, 420);
}

// Toque longo: um evento ao completar o tempo, ainda com o botão apertado, e nada ao soltar.
TEST(ButtonGesture, ALongPressIsReportedOnceWhileHeldAndNotAsAShortPress) {
    ButtonGesture gesture;
    const Events e = run(gesture, 100, 3000, 4000);
    EXPECT_EQ(e.longPresses, 1);
    EXPECT_EQ(e.shortPresses, 0);
    EXPECT_GE(e.firstLongAtMs, 100 + static_cast<int>(kLongPressMs));
    EXPECT_LE(e.firstLongAtMs, 100 + static_cast<int>(kLongPressMs) + 20);
    EXPECT_LT(e.firstLongAtMs, 3000);  // antes de soltar
}

// O limite entre curto e longo: logo abaixo é curto, no limite é longo.
TEST(ButtonGesture, TheBoundaryBetweenShortAndLong) {
    ButtonGesture shortG;
    EXPECT_EQ(run(shortG, 0, static_cast<int>(kLongPressMs) - 50, 2000).shortPresses, 1);
    ButtonGesture longG;
    const Events e = run(longG, 0, static_cast<int>(kLongPressMs) + 200, 2000);
    EXPECT_EQ(e.longPresses, 1);
    EXPECT_EQ(e.shortPresses, 0);
}

// Contato que quica (menos de 30 ms) não vale.
TEST(ButtonGesture, ABounceShorterThanTheDebounceIsIgnored) {
    ButtonGesture gesture;
    const Events e = run(gesture, 100, 120, 1000);
    EXPECT_EQ(e.shortPresses, 0);
    EXPECT_EQ(e.longPresses, 0);
}

// Dois toques longos seguidos: dois eventos (um por toque), nunca um por leitura.
TEST(ButtonGesture, TwoLongPressesGiveTwoEvents) {
    ButtonGesture gesture;
    Events total;
    for (const int start : {0, 3000}) {
        for (int t = start; t < start + 2500; t += 10) {
            const bool pressed = t < start + 2000;
            const ButtonEvent event = gesture.update(pressed, static_cast<uint32_t>(t));
            if (event == ButtonEvent::LongPress) ++total.longPresses;
            if (event == ButtonEvent::ShortPress) ++total.shortPresses;
        }
    }
    EXPECT_EQ(total.longPresses, 2);
    EXPECT_EQ(total.shortPresses, 0);
}

// Botão que já estava apertado ao ligar (ou da sessão anterior): só conta depois de soltar e apertar.
TEST(ButtonGesture, AButtonHeldFromTheStartNeedsAReleaseFirst) {
    ButtonGesture gesture(/*startPressed=*/true);
    const Events held = run(gesture, 0, 5000, 5100);
    EXPECT_EQ(held.longPresses, 0);
    EXPECT_EQ(held.shortPresses, 0);
}

}  // namespace
}  // namespace micromouse::domain
