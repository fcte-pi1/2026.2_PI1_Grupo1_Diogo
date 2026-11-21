#include <gtest/gtest.h>

#include <vector>

#include "domain/Maze.hpp"
#include "ports/MotionPort.hpp"
#include "ports/SensorPort.hpp"
#include "simulation/SimulatedRobot.hpp"
#include "use_cases/Navigator.hpp"

namespace micromouse::use_cases {
namespace {

using domain::Direction;
using domain::MazeMap;
using domain::Position;
using domain::Wall;
using test::SimulatedRobot;

// A serpentina 4x4 das corridas de 20/11 (SERPENTINAS 5-29), reconstruída pelos logs: o caminho que o robô fez e as paredes que
// cada passo leu ("mapa NLSO" das linhas nav). Largada (l3,c0) virado ao norte, objetivo (l0,c3). Tudo o que os logs não mostram
// aberto é parede: o labirinto é um corredor só, com o beco de (l0,c0) no começo.
//   l0:  [c0 beco]   [c1] -> [c2]   [c3 objetivo]
//         |           ^       |       ^
//   l1:  [c0]        [c1]    [c2]    [c3]
//         |           ^       v       ^
//   l2:  [c0] ----> [c1]     [c2] -> [c3]
//         ^
//   l3:  [c0 largada]
MazeMap serpentine() {
    MazeMap truth(4, 4);
    truth.initKnownPerimeter();
    for (int row = 0; row < 4; ++row) {
        for (int column = 0; column < 4; ++column) {
            for (const Direction d : {Direction::North, Direction::East, Direction::South, Direction::West}) {
                truth.setWall({row, column}, d, Wall::Present);
            }
        }
    }
    auto open = [&truth](Position p, Direction d) { truth.setWall(p, d, Wall::Open); };
    open({3, 0}, Direction::North);
    open({2, 0}, Direction::North);
    open({1, 0}, Direction::North);  // o beco (l0,c0)
    open({2, 0}, Direction::East);
    open({2, 1}, Direction::North);
    open({1, 1}, Direction::North);
    open({0, 1}, Direction::East);
    open({0, 2}, Direction::South);
    open({1, 2}, Direction::South);
    open({2, 2}, Direction::East);
    open({2, 3}, Direction::North);
    open({1, 3}, Direction::North);
    return truth;
}

// Robô simulado que anda trechos sem parar e vira sem parar (como o firmware com reta e curva contínuas).
class FlowingRobot final : public ports::ISensorPort, public ports::IMotionPort {
public:
    FlowingRobot(const MazeMap& truth, Position start, Direction heading) : robot_(truth, start, heading) {}
    [[nodiscard]] ports::WallsAhead sense() const override { return robot_.sense(); }
    [[nodiscard]] ports::WallsAhead senseMoving(double) const override { return robot_.sense(); }
    void advanceCell() override { robot_.advanceCell(); }
    int advanceCells(int maxCells, ports::IStraightRunObserver& observer) override {
        int moved = 0;
        while (moved < maxCells) {
            robot_.advanceCell();
            ++moved;
            const ports::RunTurn turn = observer.turnIn(moved, 114.0);
            if (turn != ports::RunTurn::None) {
                turn == ports::RunTurn::Left ? robot_.turnLeft() : robot_.turnRight();
                robot_.advanceCell();
                ++continuousTurns;
                return moved;
            }
            if (moved >= maxCells || !observer.continuePast(moved, 59.15)) break;
        }
        return moved;
    }
    void reverseCell() override { robot_.reverseCell(); }
    void turnLeft() override { robot_.turnLeft(); ++stoppedTurns; }
    void turnRight() override { robot_.turnRight(); ++stoppedTurns; }
    void turnAround() override { robot_.turnAround(); }
    [[nodiscard]] const SimulatedRobot& robot() const { return robot_; }
    int continuousTurns{0};
    int stoppedTurns{0};

private:
    SimulatedRobot robot_;
};

TEST(SerpentineMaze, CellByCellTheNavigatorReachesTheGoalWithoutHittingWalls) {
    const MazeMap truth = serpentine();
    MazeMap known(4, 4);
    known.initKnownPerimeter();
    SimulatedRobot robot(truth, {3, 0}, Direction::North);
    Navigator navigator(known, robot, robot, {3, 0}, Direction::North, {{0, 3}});
    EXPECT_TRUE(navigator.run(60));
    EXPECT_EQ(robot.wallHits(), 0);
    EXPECT_EQ(robot.position(), (Position{0, 3}));
}

// Como nas corridas: reta e curva contínuas ligadas. O caminho é o mesmo dos logs (frente 3, ré do beco, curvas em S da serpentina)
// e termina no objetivo, sem bater.
TEST(SerpentineMaze, WithContinuousRunsAndTurnsTheRunMatchesTheLogsAndArrives) {
    const MazeMap truth = serpentine();
    MazeMap known(4, 4);
    known.initKnownPerimeter();
    FlowingRobot robot(truth, {3, 0}, Direction::North);
    Navigator navigator(known, robot, robot, {3, 0}, Direction::North, {{0, 3}});
    navigator.setContinuousRuns(true);
    navigator.setContinuousTurns(true);
    navigator.step();
    EXPECT_EQ(navigator.getPosition(), (Position{0, 0}));  // passo 1: frente 3 células até o beco
    EXPECT_EQ(navigator.lastStep().cells, 3);
    navigator.step();
    EXPECT_EQ(navigator.lastStep().action, StepAction::Reverse);  // passo 2: sai do beco de ré
    EXPECT_TRUE(navigator.run(40));
    EXPECT_EQ(robot.robot().wallHits(), 0);
    EXPECT_EQ(robot.robot().position(), (Position{0, 3}));
    EXPECT_GT(robot.continuousTurns, 0);  // a curva sem parar do passo 6 dos logs
}

}  // namespace
}  // namespace micromouse::use_cases
