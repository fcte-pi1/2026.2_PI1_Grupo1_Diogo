#include <gtest/gtest.h>

#include "domain/Maze.hpp"
#include "simulation/SimulatedRobot.hpp"
#include "use_cases/Navigator.hpp"

namespace micromouse::use_cases {
namespace {

using domain::Direction;
using domain::MazeMap;
using domain::Position;
using domain::Wall;
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

TEST(Navigator, PassoRegistraParedesSentidas) {
    MazeMap known(4, 8);
    MazeMap truth(4, 8);

    truth.initKnownPerimeter();
    truth.setWall({0, 0}, Direction::East, Wall::Present);  // parede à frente

    SimulatedRobot robot(truth, {0, 0}, Direction::East);

    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{3, 7}});
    navigator.step();

    EXPECT_TRUE(known.isBlocked({0, 0}, Direction::East));    // frente = parede
    EXPECT_TRUE(known.isBlocked({0, 0}, Direction::North));   // left = borda
    EXPECT_FALSE(known.isBlocked({0, 0}, Direction::South));  // right = aberto
}

TEST(Navigator, AvancaRetoSemGiroQuandoAlinhado) {
    MazeMap known(4, 8);
    MazeMap truth(4, 8);
    truth.initKnownPerimeter();
    SimulatedRobot robot(truth, {0, 0}, Direction::East);

    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{3, 7}});
    navigator.step();

    EXPECT_EQ(navigator.getPosition(), (Position{0, 1}));
    EXPECT_EQ(navigator.getHeading(), Direction::East);
    EXPECT_EQ(robot.advances(), 1);
    EXPECT_EQ(robot.turns(), 0);
}

TEST(Navigator, GiraQuandoPrecisaMudarDeSentido) {
    MazeMap known(4, 8);
    MazeMap truth(4, 8);
    truth.initKnownPerimeter();
    SimulatedRobot robot(truth, {0, 0}, Direction::North);

    Navigator navigator(known, robot, robot, {0, 0}, Direction::North, {{3, 7}});
    navigator.step();

    EXPECT_EQ(navigator.getHeading(), Direction::East);
    EXPECT_EQ(robot.rights(), 1);
    EXPECT_EQ(robot.advances(), 1);
    EXPECT_EQ(navigator.getPosition(), (Position{0, 1}));
}

TEST(Navigator, AlcancaObjetivoEmLabirintoAberto) {
    MazeMap known(4, 8);
    MazeMap truth(4, 8);
    truth.initKnownPerimeter();
    SimulatedRobot robot(truth, {0, 0}, Direction::North);

    Navigator navigator(known, robot, robot, {0, 0}, Direction::North, {{3, 7}});
    const bool success = navigator.run(200);

    EXPECT_TRUE(success);
    EXPECT_TRUE(navigator.reachedGoal());
    EXPECT_EQ(navigator.getPosition(), (Position{3, 7}));
    EXPECT_EQ(robot.advances(), 10);  // caminho mínimo = 3 + 7 = 10 movimentos
}

TEST(Navigator, _) {}

}  // namespace
}  // namespace micromouse::use_cases
