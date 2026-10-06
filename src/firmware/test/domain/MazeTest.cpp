#include <gtest/gtest.h>

#include "domain/Maze.hpp"

namespace micromouse::domain {
namespace {

TEST(MazeMap, StoresDimensionsOnConstruction) {
    MazeMap small(4, 4);
    EXPECT_EQ(small.getRows(), 4);
    EXPECT_EQ(small.getColumns(), 4);

    MazeMap medium(4, 8);
    EXPECT_EQ(medium.getRows(), 4);
    EXPECT_EQ(medium.getColumns(), 8);
}

TEST(MazeMap, InternalWallsAreUnknownInitially) {
    MazeMap medium(4, 8);
    EXPECT_EQ(medium.getWall({1, 1}, Direction::North), Wall::Unknown);
    EXPECT_EQ(medium.getWall({1, 1}, Direction::East), Wall::Unknown);
    EXPECT_EQ(medium.getWall({1, 1}, Direction::South), Wall::Unknown);
    EXPECT_EQ(medium.getWall({1, 1}, Direction::West), Wall::Unknown);
};

TEST(MazeMap, _){};

}  // namespace
}  // namespace micromouse::domain
