#include <gtest/gtest.h>

#include "domain/Maze.hpp"

namespace micromouse::domain {
namespace {

TEST(MazeMap, StoresDimensionsOnConstruction) {
    MazeMap small(4, 4);
    EXPECT_EQ(small.rows(), 4);
    EXPECT_EQ(small.columns(), 4);

    MazeMap medium(4, 8);
    EXPECT_EQ(medium.rows(), 4);
    EXPECT_EQ(medium.columns(), 8);
}

TEST(MazeMap, _){};

}  // namespace
}  // namespace micromouse::domain
