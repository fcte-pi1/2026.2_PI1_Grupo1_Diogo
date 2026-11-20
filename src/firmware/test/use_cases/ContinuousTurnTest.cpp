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

// Curva contínua (20/11): o trecho reto que chega a uma curva vira sem parar. Um robô que anda sem parar:
// chegando a cada célula pergunta primeiro se vira nela (turnIn, com o eixo ~114 mm antes do centro) e,
// se não, se passa dela (continuePast). Uma curva pedida é feita e o robô anda até a célula seguinte.
class TurningRobot final : public ports::ISensorPort, public ports::IMotionPort {
public:
    TurningRobot(const MazeMap& truth, Position start, Direction heading) : robot_(truth, start, heading) {}
    [[nodiscard]] ports::WallsAhead sense() const override { return robot_.sense(); }
    [[nodiscard]] ports::WallsAhead senseMoving(double axleBehindCenterMm) const override {
        offsets.push_back(axleBehindCenterMm);
        ports::WallsAhead walls = robot_.sense();
        if (blindSidesWhileMoving) {
            walls.leftUnknown = walls.rightUnknown = true;
            walls.left = walls.right = true;
        }
        return walls;
    }
    void advanceCell() override { robot_.advanceCell(); }
    int advanceCells(int maxCells, ports::IStraightRunObserver& observer) override {
        ++runs;
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

    mutable std::vector<double> offsets;
    bool blindSidesWhileMoving{false};
    int runs{0};
    int continuousTurns{0};
    int stoppedTurns{0};

private:
    SimulatedRobot robot_;
};

// Corredor da linha 0 fechado depois da coluna 3: o caminho até (3,3) desce pela coluna 3.
MazeMap cornerMaze() {
    MazeMap truth(4, 8);
    truth.initKnownPerimeter();
    truth.setWall({0, 3}, Direction::East, Wall::Present);
    return truth;
}

TEST(ContinuousTurn, TheRunTurnsIntoTheSideCorridorWithoutStopping) {
    const MazeMap truth = cornerMaze();
    MazeMap known(4, 8);
    known.initKnownPerimeter();
    TurningRobot robot(truth, {0, 0}, Direction::East);
    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{3, 3}});
    navigator.setContinuousRuns(true);
    navigator.setContinuousTurns(true);
    navigator.step();
    EXPECT_EQ(robot.continuousTurns, 1);
    EXPECT_EQ(navigator.lastStep().runTurn, StepAction::TurnRight);
    EXPECT_EQ(navigator.lastStep().cells, 4);  // 3 para a frente e a curva até (1,3)
    EXPECT_EQ(navigator.getPosition(), (Position{1, 3}));
    EXPECT_EQ(navigator.getHeading(), Direction::South);
    EXPECT_EQ(robot.robot().position(), navigator.getPosition());
    EXPECT_EQ(robot.robot().wallHits(), 0);
    EXPECT_DOUBLE_EQ(robot.offsets.front(), 114.0);
    EXPECT_TRUE(navigator.run(20));
    EXPECT_EQ(robot.robot().wallHits(), 0);
    EXPECT_EQ(robot.stoppedTurns, 0);
}

// Um lado que não foi visto andando (sensor em dúvida) não vira sem parar: o trecho para no centro e o
// passo seguinte faz a curva parada, como antes.
TEST(ContinuousTurn, AnUnseenSideStopsAtTheCenterAsBefore) {
    const MazeMap truth = cornerMaze();
    MazeMap known(4, 8);
    known.initKnownPerimeter();
    TurningRobot robot(truth, {0, 0}, Direction::East);
    robot.blindSidesWhileMoving = true;
    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{3, 3}});
    navigator.setContinuousRuns(true);
    navigator.setContinuousTurns(true);
    navigator.step();
    EXPECT_EQ(robot.continuousTurns, 0);
    EXPECT_EQ(navigator.lastStep().runTurn, StepAction::None);
    EXPECT_EQ(navigator.getPosition(), (Position{0, 3}));
    EXPECT_EQ(navigator.getHeading(), Direction::East);
    EXPECT_EQ(robot.robot().position(), navigator.getPosition());
}

// Desligada, o trecho para no centro da célula da curva (o comportamento da reta contínua).
TEST(ContinuousTurn, OffKeepsTheStopAtTheTurnCell) {
    const MazeMap truth = cornerMaze();
    MazeMap known(4, 8);
    known.initKnownPerimeter();
    TurningRobot robot(truth, {0, 0}, Direction::East);
    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{3, 3}});
    navigator.setContinuousRuns(true);
    navigator.step();
    EXPECT_EQ(robot.continuousTurns, 0);
    EXPECT_EQ(navigator.getPosition(), (Position{0, 3}));
}

// O objetivo na célula da curva: para nele, não vira.
TEST(ContinuousTurn, StopsAtTheGoalInsteadOfTurning) {
    const MazeMap truth = cornerMaze();
    MazeMap known(4, 8);
    known.initKnownPerimeter();
    TurningRobot robot(truth, {0, 0}, Direction::East);
    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{0, 3}});
    navigator.setContinuousRuns(true);
    navigator.setContinuousTurns(true);
    navigator.step();
    EXPECT_EQ(robot.continuousTurns, 0);
    EXPECT_EQ(navigator.getPosition(), (Position{0, 3}));
    EXPECT_TRUE(navigator.reachedGoal());
}

// Uma célula só até a curva (o trecho tem 1 célula): também vira sem parar.
TEST(ContinuousTurn, AOneCellRunAlsoTurns) {
    MazeMap truth(4, 8);
    truth.initKnownPerimeter();
    truth.setWall({0, 1}, Direction::East, Wall::Present);
    MazeMap known(4, 8);
    known.initKnownPerimeter();
    known.setWall({0, 1}, Direction::East, Wall::Present);  // já sabida: o trecho tem 1 célula
    TurningRobot robot(truth, {0, 0}, Direction::East);
    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{3, 1}});
    navigator.setContinuousRuns(true);
    navigator.setContinuousTurns(true);
    navigator.step();
    EXPECT_EQ(robot.continuousTurns, 1);
    EXPECT_EQ(navigator.getPosition(), (Position{1, 1}));
    EXPECT_EQ(robot.robot().wallHits(), 0);
}

}  // namespace
}  // namespace micromouse::use_cases
