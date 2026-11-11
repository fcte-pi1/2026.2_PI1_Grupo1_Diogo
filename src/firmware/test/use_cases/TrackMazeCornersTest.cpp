#include <gtest/gtest.h>

#include <iostream>
#include <string>

#include "domain/DipDecoder.hpp"
#include "domain/Maze.hpp"
#include "simulation/SimulatedRobot.hpp"
#include "use_cases/Navigator.hpp"

// A pista 4x4 de 09/11 e 10/11 (a da foto de cima), largando dos QUATRO cantos.
//
// Aqui a "verdade" fica no referencial da FOTO (linha 0 = linha 1 da foto, coluna 0 = A, norte =
// cima da foto) e o Navigator trabalha no referencial DELE (larga numa linha de baixo, virado para
// o norte, com o canto dado pela via 3 da DIP). Os dois não precisam coincidir: os sensores e os
// movimentos são relativos ao robô (frente, esquerda, direita, andar, virar).
//
// O que estes testes travam (10/11):
//  - o robô NÃO dá meia-volta no lugar: num beco, sai de ré (ele não cabe girando no corredor);
//  - de qualquer canto, com a DIP certa, ele chega ao canto oposto sem andar contra parede;
//  - com a via 3 errada, o mapa fica espelhado e o robô nunca chega: fica registrado que os
//    sensores viram passagem para fora do mapa.

namespace micromouse::use_cases {
namespace {

using domain::Direction;
using domain::MazeMap;
using domain::Position;
using domain::Wall;
using test::SimulatedRobot;

Position cell(int line, char column) { return {line - 1, column - 'A'}; }

std::string name(const Position& p) {
    return std::string(1, static_cast<char>('A' + p.column)) + std::to_string(p.row + 1);
}

MazeMap photoMaze() {
    MazeMap truth(4, 4);
    truth.initKnownPerimeter();
    auto wall = [&truth](int line, char column, Direction side) {
        truth.setWall(cell(line, column), side, Wall::Present);
    };
    // Parede entre as linhas 1 e 2 nas colunas A e B, descendo entre B e C na linha 2.
    wall(2, 'A', Direction::North);
    wall(2, 'B', Direction::North);
    wall(2, 'B', Direction::East);
    // Parede entre as linhas 1 e 2 na coluna D, descendo entre C e D na linha 2.
    wall(2, 'D', Direction::North);
    wall(2, 'C', Direction::East);
    // Parede entre as linhas 3 e 4 nas colunas B, C e D (a A fica aberta).
    wall(4, 'B', Direction::North);
    wall(4, 'C', Direction::North);
    wall(4, 'D', Direction::North);
    return truth;
}

class TrackRobot final : public ports::ISensorPort, public ports::IMotionPort {
public:
    TrackRobot(const MazeMap& truth, Position start, Direction heading)
        : robot_(truth, start, heading) {
        log = name(start);
    }
    [[nodiscard]] ports::WallsAhead sense() const override { return robot_.sense(); }
    void advanceCell() override {
        robot_.advanceCell();
        log += " " + name(robot_.position());
    }
    void reverseCell() override {
        robot_.reverseCell();
        log += " re:" + name(robot_.position());
    }
    void turnLeft() override { robot_.turnLeft(); log += " [E]"; }
    void turnRight() override { robot_.turnRight(); log += " [D]"; }
    void turnAround() override { robot_.turnAround(); log += " [MEIA-VOLTA]"; }
    [[nodiscard]] const SimulatedRobot& robot() const { return robot_; }

    std::string log;

private:
    SimulatedRobot robot_;
};

struct Outcome {
    bool reached;
    Position finalCell;
    int halfTurns;
    int reverses;
    int wallHits;
    int outsideOpenings;
    std::string log;
};

// `dip3` como na placa: false = partida pela esquerda, true = pela direita (domain::DipDecoder).
Outcome runFrom(Position physicalStart, Direction physicalHeading, bool dip3) {
    const MazeMap truth = photoMaze();
    const domain::MazeSetup setup = domain::DipDecoder().decode(false, false, dip3);
    MazeMap known(setup.rows, setup.columns);
    known.initKnownPerimeter();
    TrackRobot robot(truth, physicalStart, physicalHeading);
    Navigator navigator(known, robot, robot, setup.start, Direction::North, {setup.goal});
    const bool reached = navigator.run(setup.rows * setup.columns * 4);
    std::cout << "largada " << name(physicalStart) << " dip3=" << dip3 << ": " << robot.log
              << (reached ? "  => chegou" : "  => NAO chegou") << "\n";
    return {reached,
            robot.robot().position(),
            robot.robot().halfTurns(),
            robot.robot().reverses(),
            robot.robot().wallHits(),
            navigator.outsideOpenings(),
            robot.log};
}

// O caso 2 de 10/11: larga em D4 virado para C4 (borda à esquerda do robô: DIP 0 0 0).
TEST(TrackMazeCorners, FromD4ReachesA1) {
    const Outcome run = runFrom(cell(4, 'D'), Direction::West, false);
    EXPECT_TRUE(run.reached);
    EXPECT_EQ(run.finalCell, cell(1, 'A'));
    EXPECT_EQ(run.halfTurns, 0);
    EXPECT_EQ(run.wallHits, 0);
    EXPECT_EQ(run.outsideOpenings, 0);
}

// O caso 1 de 10/11: larga em D1 virado para C1 (borda à DIREITA do robô: via 3 fechada). O
// caminho passa pelo beco A1. Antes, a saída era uma meia-volta no lugar, e o robô travava nela.
TEST(TrackMazeCorners, FromD1BacksOutOfTheA1DeadEndAndReachesA4) {
    const Outcome run = runFrom(cell(1, 'D'), Direction::West, true);
    EXPECT_TRUE(run.reached);
    EXPECT_EQ(run.finalCell, cell(4, 'A'));
    EXPECT_EQ(run.halfTurns, 0);  // nada de girar 180 graus no lugar
    EXPECT_EQ(run.reverses, 2);   // de ré de A1 até C1, onde vira para C2
    EXPECT_EQ(run.wallHits, 0);
    EXPECT_NE(run.log.find("A1 re:B1 re:C1 [E] C2"), std::string::npos) << run.log;
}

TEST(TrackMazeCorners, FromA1ReachesD4) {
    const Outcome run = runFrom(cell(1, 'A'), Direction::East, false);
    EXPECT_TRUE(run.reached);
    EXPECT_EQ(run.finalCell, cell(4, 'D'));
    EXPECT_EQ(run.halfTurns, 0);
    EXPECT_EQ(run.wallHits, 0);
}

// A4 não é beco: o robô pode largar virado para A3 (DIP 0 0 0) ou para B4 (via 3 fechada).
TEST(TrackMazeCorners, FromA4ReachesD1EitherWay) {
    for (const bool towardB4 : {false, true}) {
        const Outcome run = runFrom(cell(4, 'A'), towardB4 ? Direction::East : Direction::North,
                                    towardB4);
        EXPECT_TRUE(run.reached);
        EXPECT_EQ(run.finalCell, cell(1, 'D'));
        EXPECT_EQ(run.halfTurns, 0);
        EXPECT_EQ(run.wallHits, 0);
    }
}

// Via 3 errada para o canto (D1 com DIP 0 0 0): o mapa fica espelhado, o objetivo cai fora da pista
// e o robô nunca chega. Não bate nem gira no lugar, e o motivo fica registrado: em C1, o sensor
// esquerdo vê a passagem para C2 num lado que, no mapa, é a borda.
TEST(TrackMazeCorners, WrongCornerDipNeverArrivesButIsReported) {
    const Outcome run = runFrom(cell(1, 'D'), Direction::West, false);
    EXPECT_FALSE(run.reached);
    EXPECT_EQ(run.halfTurns, 0);
    EXPECT_EQ(run.wallHits, 0);
    EXPECT_GT(run.outsideOpenings, 0);
}

}  // namespace
}  // namespace micromouse::use_cases
