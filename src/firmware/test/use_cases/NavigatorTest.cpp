#include <gtest/gtest.h>

#include "domain/Maze.hpp"
#include "simulation/SimulatedRobot.hpp"
#include "use_cases/Navigator.hpp"

namespace micromouse::use_cases {
namespace {

using domain::Direction;
using domain::MazeMap;
using domain::Position;
using test::SimulatedRobot;

TEST(Navigator, InicializaPoseEObjetivo) {
    MazeMap known(4, 8);
    MazeMap truth(4, 8);

    truth.initKnownPerimeter();

    SimulatedRobot robot(truth, {0, 0}, Direction::East);

    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{3, 7}});

    EXPECT_EQ(navigator.getPosition(), (Position{0, 0}));
    EXPECT_EQ(navigator.getHeading(), Direction::East);
    EXPECT_FALSE(navigator.reachedGoal());
}

}  // namespace
}  // namespace micromouse::use_cases
