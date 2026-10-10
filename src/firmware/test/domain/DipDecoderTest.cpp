#include <gtest/gtest.h>

#include "domain/DipDecoder.hpp"
#include "domain/Maze.hpp"

namespace micromouse::domain {

namespace {

TEST(DipDecoder, PequenoCantoPadrao) {
    DipDecoder decoder;
    const MazeSetup setup = decoder.decode(false, false, false);
    EXPECT_EQ(setup.type, MazeType::Small4x4);
    EXPECT_EQ(setup.rows, 4);
    EXPECT_EQ(setup.columns, 4);
    EXPECT_EQ(setup.start, (Position{3, 0}));
    EXPECT_EQ(setup.goal, (Position{0, 3}));
}

TEST(DipDecoder, MedioPelaLargura) {
    DipDecoder decoder;
    const MazeSetup setup = decoder.decode(true, false, false);
    EXPECT_EQ(setup.type, MazeType::Medium8x4);
    EXPECT_EQ(setup.rows, 4);
    EXPECT_EQ(setup.columns, 8);
    EXPECT_EQ(setup.start, (Position{3, 0}));
    EXPECT_EQ(setup.goal, (Position{0, 7}));
}

TEST(DipDecoder, GrandePelaLargura) {
    DipDecoder decoder;
    const MazeSetup setup = decoder.decode(false, true, false);
    EXPECT_EQ(setup.type, MazeType::Large12x4);
    EXPECT_EQ(setup.rows, 4);
    EXPECT_EQ(setup.columns, 12);
    EXPECT_EQ(setup.start, (Position{3, 0}));
    EXPECT_EQ(setup.goal, (Position{0, 11}));
}

TEST(DipDecoder, CantoDireitoInverteObjetivo) {
    DipDecoder decoder;
    const MazeSetup setup = decoder.decode(false, false, true);
    EXPECT_EQ(setup.start, (Position{3, 3}));
    EXPECT_EQ(setup.goal, (Position{0, 0}));
}

TEST(DipDecoder, CombinacaoReservadaLanca) {
    DipDecoder decoder;
    EXPECT_THROW((void)decoder.decode(true, true, false), std::invalid_argument);
    EXPECT_THROW((void)decoder.decode(true, true, true), std::invalid_argument);
}

TEST(DipDecoder, ObjetivoEhSempreDiagonalOposto) {
    DipDecoder decoder;
    for (bool dip1 : {false, true}) {
        for (bool dip2 : {false, true}) {
            if (dip1 && dip2) {
                continue;  // Skip reserved combination
            }
            for (bool dip3 : {false, true}) {
                const MazeSetup setup = decoder.decode(dip1, dip2, dip3);
                EXPECT_EQ(setup.goal.row, setup.rows - 1 - setup.start.row);
                EXPECT_EQ(setup.goal.column, setup.columns - 1 - setup.start.column);
            }
        }
    }
}

}  // namespace

}  // namespace micromouse::domain
