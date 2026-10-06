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

TEST(MazeMap, RejectsNonPositiveDimensions) {
    EXPECT_THROW(MazeMap(0, 4), std::invalid_argument);
    EXPECT_THROW(MazeMap(4, 0), std::invalid_argument);
    EXPECT_THROW(MazeMap(-1, 4), std::invalid_argument);
    EXPECT_THROW(MazeMap(4, -1), std::invalid_argument);
};

TEST(MazeMap, SetWallIsConsistentOnBothSides) {
    MazeMap medium(4, 8);

    medium.setWall({1, 1}, Direction::North, Wall::Present);
    EXPECT_EQ(medium.getWall({1, 1}, Direction::North), Wall::Present);
    EXPECT_EQ(medium.getWall({0, 1}, Direction::South), Wall::Present);

    medium.setWall({1, 1}, Direction::East, Wall::Open);
    EXPECT_EQ(medium.getWall({1, 1}, Direction::East), Wall::Open);
    EXPECT_EQ(medium.getWall({1, 2}, Direction::West), Wall::Open);

    medium.setWall({1, 1}, Direction::South, Wall::Present);
    EXPECT_EQ(medium.getWall({1, 1}, Direction::South), Wall::Present);
    EXPECT_EQ(medium.getWall({2, 1}, Direction::North), Wall::Present);

    medium.setWall({1, 1}, Direction::West, Wall::Open);
    EXPECT_EQ(medium.getWall({1, 1}, Direction::West), Wall::Open);
    EXPECT_EQ(medium.getWall({1, 0}, Direction::East), Wall::Open);
};

TEST(MazeMap, _){};

}  // namespace
}  // namespace micromouse::domain
