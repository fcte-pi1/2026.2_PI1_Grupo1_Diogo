#include <gtest/gtest.h>

#include <iostream>
#include <string>
#include <vector>

#include "domain/Maze.hpp"
#include "simulation/SimulatedRobot.hpp"
#include "use_cases/Navigator.hpp"

// O labirinto 4x4 da pista de 09/11, como na foto de cima: colunas y = A..D da esquerda para a
// direita e linhas x = 1..4 de cima para baixo. O robô larga em (4, D), no canto inferior direito,
// com a DIP em 0 0 0 (partida pela esquerda): virado para a esquerda da foto, com a borda de baixo
// à sua esquerda. O objetivo é o canto oposto, (1, A).
//
// No referencial do firmware (linha 0 em cima, coluna 0 à esquerda, robô largando em (3, 0) virado
// para o norte), a foto está girada: o "norte" do robô é a esquerda da foto. Então:
//   linha do firmware  = índice da coluna da foto (A=0 .. D=3)
//   coluna do firmware = 4 - linha da foto
// e as direções: cima da foto = leste, baixo = oeste, esquerda = norte, direita = sul.

namespace micromouse::use_cases {
namespace {

using domain::Direction;
using domain::MazeMap;
using domain::Position;
using domain::Wall;
using test::SimulatedRobot;

Position fromPhoto(int x, char y) { return {y - 'A', 4 - x}; }

enum class PhotoSide { Up, Down, Left, Right };

Direction toFirmware(PhotoSide side) {
    switch (side) {
        case PhotoSide::Up:
            return Direction::East;
        case PhotoSide::Down:
            return Direction::West;
        case PhotoSide::Left:
            return Direction::North;
        case PhotoSide::Right:
            return Direction::South;
    }
    return Direction::North;
}

std::string toPhoto(const Position& p) {
    return "(" + std::to_string(4 - p.column) + "," + std::string(1, static_cast<char>('A' + p.row)) +
           ")";
}

MazeMap trackMaze() {
    MazeMap truth(4, 4);
    truth.initKnownPerimeter();
    auto wall = [&truth](int x, char y, PhotoSide side) {
        truth.setWall(fromPhoto(x, y), toFirmware(side), Wall::Present);
    };
    // Parede entre as linhas 1 e 2 nas colunas A e B, descendo entre B e C na linha 2.
    wall(2, 'A', PhotoSide::Up);
    wall(2, 'B', PhotoSide::Up);
    wall(2, 'B', PhotoSide::Right);
    // Parede entre as linhas 1 e 2 na coluna D, descendo entre C e D na linha 2.
    wall(2, 'D', PhotoSide::Up);
    wall(2, 'C', PhotoSide::Right);
    // Parede entre as linhas 3 e 4 nas colunas B, C e D (a A fica aberta).
    wall(4, 'B', PhotoSide::Up);
    wall(4, 'C', PhotoSide::Up);
    wall(4, 'D', PhotoSide::Up);
    return truth;
}

class RecordingRobot final : public ports::ISensorPort, public ports::IMotionPort {
public:
    RecordingRobot(const MazeMap& truth, Position start, Direction heading)
        : robot_(truth, start, heading) {
        path.push_back(toPhoto(start));
    }
    [[nodiscard]] ports::WallsAhead sense() const override { return robot_.sense(); }
    void advanceCell() override {
        robot_.advanceCell();
        path.push_back(toPhoto(robot_.position()));
    }
    void turnLeft() override { robot_.turnLeft(); moves.push_back('E'); }
    void turnRight() override { robot_.turnRight(); moves.push_back('D'); }
    void turnAround() override { robot_.turnAround(); moves.push_back('M'); }
    [[nodiscard]] const SimulatedRobot& robot() const { return robot_; }

    std::vector<std::string> path;
    std::string moves;

private:
    SimulatedRobot robot_;
};

TEST(TrackMaze0911, StartCellIsTheLShapedCorner) {
    const MazeMap truth = trackMaze();
    const Position start = fromPhoto(4, 'D');
    EXPECT_EQ(start, (Position{3, 0}));
    EXPECT_FALSE(truth.isBlocked(start, Direction::North));  // para (4, C)
    EXPECT_TRUE(truth.isBlocked(start, Direction::East));    // parede de cima, até (3, D)
    EXPECT_TRUE(truth.isBlocked(start, Direction::West));    // borda de baixo
    EXPECT_TRUE(truth.isBlocked(start, Direction::South));   // borda da direita
}

TEST(TrackMaze0911, NavigatorReachesTheOppositeCorner) {
    const MazeMap truth = trackMaze();
    MazeMap known(4, 4);
    const Position start = fromPhoto(4, 'D');
    const Position goal = fromPhoto(1, 'A');
    EXPECT_EQ(goal, (Position{0, 3}));
    RecordingRobot robot(truth, start, Direction::North);
    Navigator navigator(known, robot, robot, start, Direction::North, {goal});

    ASSERT_TRUE(navigator.run(4 * 4 * 4));
    std::string path;
    for (const std::string& cell : robot.path) path += cell + " ";
    // Caminho e manobras, para comparar com a corrida na pista (resumo.txt e log "curva").
    std::cout << "caminho (x,y): " << path << "\nmanobras: " << robot.moves << " ("
              << robot.robot().advances() << " celulas)\n";
    EXPECT_EQ(robot.path.back(), "(1,A)");
}

}  // namespace
}  // namespace micromouse::use_cases
