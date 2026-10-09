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

}  // namespace

}  // namespace micromouse::domain
