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

// Reta contínua (20/11): o robô andava uma célula, parava, sentia e andava de novo; cada parada dava
// um tranco. Agora, num trecho reto, ele anda várias células num movimento só e decide, antes de cada
// centro de célula, se continua.

// Fase 2: corredor reto ainda não visto. Um passo só leva o robô da largada ao objetivo, 7 células.
TEST(ContinuousRun, AnUnseenStraightCorridorIsCrossedInOneStep) {
    MazeMap truth(4, 8);
    truth.initKnownPerimeter();
    MazeMap known(4, 8);
    known.initKnownPerimeter();
    SimulatedRobot robot(truth, {0, 0}, Direction::East);
    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{0, 7}});
    navigator.setContinuousRuns(true);
    navigator.step();
    EXPECT_EQ(navigator.getPosition(), (Position{0, 7}));
    EXPECT_EQ(navigator.lastStep().cells, 7);
    EXPECT_EQ(navigator.lastStep().action, StepAction::Forward);
    EXPECT_TRUE(navigator.reachedGoal());
    EXPECT_EQ(robot.advances(), 7);
    EXPECT_EQ(robot.wallHits(), 0);
}

// O caminho vira na 3a célula (parede à frente dela): o trecho para no centro dela, e o passo
// seguinte faz a curva.
TEST(ContinuousRun, TheRunStopsAtTheCellWhereThePathTurns) {
    MazeMap truth(4, 8);
    truth.initKnownPerimeter();
    truth.setWall({0, 3}, Direction::East, Wall::Present);
    MazeMap known(4, 8);
    known.initKnownPerimeter();
    SimulatedRobot robot(truth, {0, 0}, Direction::East);
    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{3, 3}});
    navigator.setContinuousRuns(true);
    navigator.step();
    EXPECT_EQ(navigator.getPosition(), (Position{0, 3}));
    EXPECT_EQ(navigator.lastStep().cells, 3);
    EXPECT_EQ(robot.wallHits(), 0);
    EXPECT_TRUE(navigator.run(20));
    EXPECT_EQ(robot.wallHits(), 0);
}

// Fase 1: na volta por um caminho já conhecido, o trecho reto também sai num movimento só.
TEST(ContinuousRun, AKnownStraightPathIsOneMove) {
    MazeMap truth(4, 8);
    truth.initKnownPerimeter();
    MazeMap known(4, 8);
    known.initKnownPerimeter();
    for (int column = 0; column < 7; ++column) {  // já mapeado: tudo aberto na linha 0
        known.setWall({0, column}, Direction::East, Wall::Open);
        known.setWall({0, column}, Direction::South, Wall::Present);
    }
    SimulatedRobot robot(truth, {0, 0}, Direction::East);
    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{0, 5}});
    navigator.setContinuousRuns(true);
    navigator.step();
    EXPECT_EQ(navigator.getPosition(), (Position{0, 5}));
    EXPECT_EQ(navigator.lastStep().cells, 5);
}

// Desligada (o padrão do Navigator), nada muda: uma célula por passo.
TEST(ContinuousRun, OffByDefaultKeepsOneCellPerStep) {
    MazeMap truth(4, 8);
    truth.initKnownPerimeter();
    MazeMap known(4, 8);
    known.initKnownPerimeter();
    SimulatedRobot robot(truth, {0, 0}, Direction::East);
    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{0, 7}});
    navigator.step();
    EXPECT_EQ(navigator.getPosition(), (Position{0, 1}));
    EXPECT_EQ(navigator.lastStep().cells, 1);
}

// Uma parede que o mapa já conhece limita o trecho: ele não é planejado além dela.
TEST(ContinuousRun, AKnownWallAheadLimitsTheRun) {
    MazeMap truth(4, 8);
    truth.initKnownPerimeter();
    truth.setWall({0, 2}, Direction::East, Wall::Present);
    MazeMap known(4, 8);
    known.initKnownPerimeter();
    known.setWall({0, 2}, Direction::East, Wall::Present);
    SimulatedRobot robot(truth, {0, 0}, Direction::East);
    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{3, 2}});
    navigator.setContinuousRuns(true);
    navigator.step();
    EXPECT_LE(navigator.lastStep().cells, 2);
    EXPECT_EQ(robot.wallHits(), 0);
}

// Um robô que anda de verdade sem parar: pergunta ao Navigator ANTES de cada centro, com o eixo 59 mm
// atrás dele (os ToF laterais sobre o centro). O Navigator tem de ler os sensores com esse recuo.
class MovingRobot final : public ports::ISensorPort, public ports::IMotionPort {
public:
    MovingRobot(const MazeMap& truth, Position start, Direction heading)
        : robot_(truth, start, heading) {}
    [[nodiscard]] ports::WallsAhead sense() const override { return robot_.sense(); }
    [[nodiscard]] ports::WallsAhead senseMoving(double axleBehindCenterMm) const override {
        axleOffsets.push_back(axleBehindCenterMm);
        return robot_.sense();  // a posição do simulado já é a célula que está chegando
    }
    void advanceCell() override { robot_.advanceCell(); ++singleMoves; }
    int advanceCells(int maxCells, ports::IStraightRunObserver& observer) override {
        ++runs;
        int moved = 0;
        while (moved < maxCells) {
            robot_.advanceCell();  // chega à célula seguinte (sem parar)
            ++moved;
            if (moved >= maxCells || !observer.continuePast(moved, 59.15)) break;
        }
        return moved;
    }
    void reverseCell() override { robot_.reverseCell(); }
    void turnLeft() override { robot_.turnLeft(); }
    void turnRight() override { robot_.turnRight(); }
    void turnAround() override { robot_.turnAround(); }
    [[nodiscard]] const SimulatedRobot& robot() const { return robot_; }

    mutable std::vector<double> axleOffsets;
    int runs{0};
    int singleMoves{0};

private:
    SimulatedRobot robot_;
};

TEST(ContinuousRun, TheNavigatorSensesWhileMovingWithTheAxleOffsetTheMotionGives) {
    MazeMap truth(4, 8);
    truth.initKnownPerimeter();
    MazeMap known(4, 8);
    known.initKnownPerimeter();
    MovingRobot robot(truth, {0, 0}, Direction::East);
    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{0, 4}});
    navigator.setContinuousRuns(true);
    navigator.step();
    EXPECT_EQ(robot.runs, 1);
    EXPECT_EQ(robot.singleMoves, 0);
    EXPECT_EQ(navigator.getPosition(), (Position{0, 4}));
    ASSERT_FALSE(robot.axleOffsets.empty());
    for (const double offset : robot.axleOffsets) {
        EXPECT_DOUBLE_EQ(offset, 59.15);
    }
    // As paredes vistas andando ficaram no mapa (a borda norte das células 1 a 3 é parede e a sul, aberta).
    EXPECT_EQ(known.getWall({0, 2}, Direction::South), Wall::Open);
}

// O limite de células por trecho segura um movimento muito longo (8 por padrão).
TEST(ContinuousRun, ARunIsCappedAtTheConfiguredLength) {
    MazeMap truth(4, 16);
    truth.initKnownPerimeter();
    MazeMap known(4, 16);
    known.initKnownPerimeter();
    SimulatedRobot robot(truth, {0, 0}, Direction::East);
    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{0, 15}});
    navigator.setContinuousRuns(true, 4);
    navigator.step();
    EXPECT_EQ(navigator.lastStep().cells, 4);
}


// Ré contínua (20/11): saindo de um beco por um corredor reto já percorrido, a ré também sai num movimento só.
// Corredor da linha 0 fechado no fim (beco, coluna 4); a saída é pela coluna 0, para baixo. Largada no meio do corredor
// virada para o beco, com o objetivo no canto oposto (0,7), do outro lado do beco.
MazeMap deadEndCorridor() {
    MazeMap truth(4, 8);
    truth.initKnownPerimeter();
    for (int column = 1; column < 5; ++column) {
        truth.setWall({0, column}, Direction::South, Wall::Present);  // paredes de baixo do corredor
    }
    truth.setWall({0, 4}, Direction::East, Wall::Present);  // o beco
    return truth;
}

class ReverseRecorder final : public ports::ISensorPort, public ports::IMotionPort {
public:
    ReverseRecorder(const MazeMap& truth, Position start, Direction heading) : robot_(truth, start, heading) {}
    [[nodiscard]] ports::WallsAhead sense() const override { return robot_.sense(); }
    void advanceCell() override { robot_.advanceCell(); }
    void reverseCell() override { robot_.reverseCell(); ++singleReverses; }
    int reverseCells(int maxCells) override {
        runs.push_back(maxCells);
        for (int i = 0; i < maxCells; ++i) robot_.reverseCell();
        return maxCells;
    }
    void turnLeft() override { robot_.turnLeft(); }
    void turnRight() override { robot_.turnRight(); }
    void turnAround() override { robot_.turnAround(); }
    [[nodiscard]] const SimulatedRobot& robot() const { return robot_; }
    std::vector<int> runs;
    int singleReverses{0};

private:
    SimulatedRobot robot_;
};

TEST(ContinuousRun, LeavingADeadEndBackwardsIsOneMove) {
    const MazeMap truth = deadEndCorridor();
    MazeMap known(4, 8);
    known.initKnownPerimeter();
    ReverseRecorder robot(truth, {0, 2}, Direction::East);
    Navigator navigator(known, robot, robot, {0, 2}, Direction::East, {{0, 7}});
    navigator.setContinuousRuns(true);
    EXPECT_TRUE(navigator.run(60));
    EXPECT_EQ(robot.robot().wallHits(), 0);
    EXPECT_EQ(robot.robot().halfTurns(), 0);
    EXPECT_GE(robot.robot().reverses(), 2);  // saiu de ré do beco
    // As rés seguidas saíram em movimentos de várias células, e não uma a uma.
    bool multi = false;
    for (const int n : robot.runs) multi = multi || n >= 2;
    EXPECT_TRUE(multi) << "nenhuma ré de várias células";
}

TEST(ContinuousRun, ReverseOffByDefaultStaysOneCellAtATime) {
    const MazeMap truth = deadEndCorridor();
    MazeMap known(4, 8);
    known.initKnownPerimeter();
    ReverseRecorder robot(truth, {0, 2}, Direction::East);
    Navigator navigator(known, robot, robot, {0, 2}, Direction::East, {{0, 7}});
    EXPECT_TRUE(navigator.run(60));
    EXPECT_TRUE(robot.runs.empty());
    EXPECT_GE(robot.singleReverses, 2);
}

}  // namespace
}  // namespace micromouse::use_cases
