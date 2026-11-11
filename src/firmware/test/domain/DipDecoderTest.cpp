#include <gtest/gtest.h>

#include "domain/DipDecoder.hpp"
#include "domain/Maze.hpp"

namespace micromouse::domain {

namespace {

TEST(DipDecoder, SmallCornerDefault) {
    DipDecoder decoder;
    const MazeSetup setup = decoder.decode(false, false, false);
    EXPECT_EQ(setup.type, MazeType::Small4x4);
    EXPECT_EQ(setup.rows, 4);
    EXPECT_EQ(setup.columns, 4);
    EXPECT_EQ(setup.start, (Position{3, 0}));
    EXPECT_EQ(setup.goal, (Position{0, 3}));
}

TEST(DipDecoder, MediumByWidth) {
    DipDecoder decoder;
    const MazeSetup setup = decoder.decode(true, false, false);
    EXPECT_EQ(setup.type, MazeType::Medium8x4);
    EXPECT_EQ(setup.rows, 4);
    EXPECT_EQ(setup.columns, 8);
    EXPECT_EQ(setup.start, (Position{3, 0}));
    EXPECT_EQ(setup.goal, (Position{0, 7}));
}

TEST(DipDecoder, LargeByWidth) {
    DipDecoder decoder;
    const MazeSetup setup = decoder.decode(false, true, false);
    EXPECT_EQ(setup.type, MazeType::Large12x4);
    EXPECT_EQ(setup.rows, 4);
    EXPECT_EQ(setup.columns, 12);
    EXPECT_EQ(setup.start, (Position{3, 0}));
    EXPECT_EQ(setup.goal, (Position{0, 11}));
}

TEST(DipDecoder, RightCornerInvertsGoal) {
    DipDecoder decoder;
    const MazeSetup setup = decoder.decode(false, false, true);
    EXPECT_EQ(setup.start, (Position{3, 3}));
    EXPECT_EQ(setup.goal, (Position{0, 0}));
}

TEST(DipDecoder, ReservedCombinationThrows) {
    DipDecoder decoder;
    EXPECT_THROW((void)decoder.decode(true, true, false), std::invalid_argument);
    EXPECT_THROW((void)decoder.decode(true, true, true), std::invalid_argument);
}

TEST(DipDecoder, GoalIsAlwaysOppositeDiagonal) {
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

// Conferência do canto de largada: a borda fica à esquerda do robô com a via 3 aberta, e à direita
// com ela fechada. Sem parede desse lado, a DIP não corresponde ao canto.
TEST(DipDecoder, StartCornerCheckFollowsTheThirdSwitch) {
    const DipDecoder decoder;
    for (const bool dip1 : {false, true}) {
        const MazeSetup left = decoder.decode(dip1, false, false);
        const MazeSetup right = decoder.decode(dip1, false, true);
        EXPECT_TRUE(startBorderIsOnTheLeft(left));
        EXPECT_FALSE(startBorderIsOnTheLeft(right));
        // Beco de largada (parede dos dois lados): serve para as duas posições da via 3.
        EXPECT_EQ(checkStartCorner(left, true, false, true, false), StartCheck::Ok);
        EXPECT_EQ(checkStartCorner(right, true, false, true, false), StartCheck::Ok);
        // Parede só à direita: certo para a via 3 fechada, errado para a aberta.
        EXPECT_EQ(checkStartCorner(left, false, false, true, false), StartCheck::BorderSideOpen);
        EXPECT_EQ(checkStartCorner(right, false, false, true, false), StartCheck::Ok);
        // Parede só à esquerda: o contrário.
        EXPECT_EQ(checkStartCorner(left, true, false, false, false), StartCheck::Ok);
        EXPECT_EQ(checkStartCorner(right, true, false, false, false), StartCheck::BorderSideOpen);
        // Sensor do lado da borda sem leitura: não recusa a largada por isso.
        EXPECT_EQ(checkStartCorner(left, true, true, true, false), StartCheck::Ok);
    }
}

}  // namespace

}  // namespace micromouse::domain
