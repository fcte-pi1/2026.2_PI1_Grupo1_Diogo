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

// Estado inicial: posição, direção e objetivo ainda não alcançado.
TEST(Navigator, InitializesPoseAndGoal) {
    // Prepara mapa e robô na origem olhando para leste.
    MazeMap known(4, 8);
    MazeMap truth(4, 8);

    truth.initKnownPerimeter();

    SimulatedRobot robot(truth, {0, 0}, Direction::East);
    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{3, 7}});

    // Pose inicial preservada e objetivo ainda não alcançado.
    EXPECT_EQ(navigator.getPosition(), (Position{0, 0}));
    EXPECT_EQ(navigator.getHeading(), Direction::East);
    EXPECT_FALSE(navigator.reachedGoal());
}

// Um passo registra no mapa as paredes detectadas pelos sensores.
TEST(Navigator, StepRecordsSensedWalls) {
    // Cenário real com uma parede à frente do robô.
    MazeMap known(4, 8);  // mapa conhecido inicialmente sem paredes internas
    MazeMap truth(4, 8);  // mapa real com paredes internas

    truth.initKnownPerimeter();

    truth.setWall({0, 0}, Direction::East, Wall::Present);  // parede à frente do robô
    SimulatedRobot robot(truth, {0, 0}, Direction::East);   // robô na origem olhando para leste

    // Um passo faz o robô sentir e anotar as paredes no mapa conhecido.
    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{3, 7}});
    navigator.step();

    EXPECT_TRUE(known.isBlocked({0, 0}, Direction::East));    // frente = parede
    EXPECT_TRUE(known.isBlocked({0, 0}, Direction::North));   // left = borda
    EXPECT_FALSE(known.isBlocked({0, 0}, Direction::South));  // right = aberto
}

// Já alinhado ao destino: avança sem girar.
TEST(Navigator, MovesStraightWithoutTurningWhenAligned) {
    // Robô já apontando para leste, mesma direção do objetivo.
    MazeMap known(4, 8);
    MazeMap truth(4, 8);

    truth.initKnownPerimeter();

    // Robô na origem olhando para leste, objetivo à direita.
    SimulatedRobot robot(truth, {0, 0}, Direction::East);
    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{3, 7}});

    // Um passo faz o robô avançar uma célula sem girar.
    navigator.step();

    // Avançou uma célula sem nenhum giro.
    EXPECT_EQ(navigator.getPosition(), (Position{0, 1}));  // Robô agora na posição (0, 1)
    EXPECT_EQ(navigator.getHeading(), Direction::East);    // Robô ainda olhando para leste
    EXPECT_EQ(robot.advances(), 1);                        // Avançou uma célula
    EXPECT_EQ(robot.turns(), 0);                           // Nenhum giro
}

// Desalinhado: gira para a direção certa e então avança.
TEST(Navigator, TurnsWhenNeedsToChangeDirection) {
    // Robô olhando para norte, mas precisa ir para leste.
    MazeMap known(4, 8);
    MazeMap truth(4, 8);

    truth.initKnownPerimeter();

    // Robô na origem olhando para norte, objetivo à direita.
    SimulatedRobot robot(truth, {0, 0}, Direction::North);

    // Objetivo à direita do robô.
    Navigator navigator(known, robot, robot, {0, 0}, Direction::North, {{3, 7}});

    // Um passo faz o robô girar para a direita e avançar uma célula.
    navigator.step();

    // Girou uma vez à direita e então avançou uma célula.
    EXPECT_EQ(navigator.getHeading(), Direction::East);    // Robô agora olhando para leste.
    EXPECT_EQ(robot.rights(), 1);                          // Girou uma vez à direita.
    EXPECT_EQ(robot.advances(), 1);                        // Avançou uma célula.
    EXPECT_EQ(navigator.getPosition(), (Position{0, 1}));  // Robô agora na posição (0, 1).
}

// Labirinto sem obstáculos: chega ao objetivo pelo caminho mínimo.
TEST(Navigator, ReachesGoalInOpenMaze) {
    // Labirinto só com perímetro, sem paredes internas.
    MazeMap known(4, 8);
    MazeMap truth(4, 8);

    truth.initKnownPerimeter();

    // Robô na origem olhando para norte, objetivo no canto oposto.
    SimulatedRobot robot(truth, {0, 0}, Direction::North);
    Navigator navigator(known, robot, robot, {0, 0}, Direction::North, {{3, 7}});

    // Executa a navegação até o objetivo, com limite de 200 passos.
    const bool success = navigator.run(200);

    // Chegou ao objetivo gastando apenas o caminho mínimo.
    EXPECT_TRUE(success);
    EXPECT_TRUE(navigator.reachedGoal());
    EXPECT_EQ(navigator.getPosition(), (Position{3, 7}));
    EXPECT_EQ(robot.advances(), 10);  // caminho mínimo = 3 + 7 = 10 movimentos
}

// Ao descobrir uma parede no caminho, recalcula a rota e desvia.
TEST(Navigator, ReroutesWhenDiscoveringWall) {
    // Parede bloqueia a rota direta até o objetivo.
    MazeMap known(4, 4);
    MazeMap truth(4, 4);

    truth.initKnownPerimeter();

    // Adiciona uma parede à frente do robô, bloqueando o caminho direto.
    truth.setWall({0, 1}, Direction::East, Wall::Present);
    // Robô na origem olhando para leste, objetivo à direita.
    SimulatedRobot robot(truth, {0, 0}, Direction::East);
    // Objetivo à direita do robô, mas há uma parede bloqueando o caminho direto.
    Navigator navigator(known, robot, robot, {0, 0}, Direction::East, {{0, 3}});

    // Executa a navegação até o objetivo, com limite de 200 passos.
    const bool success = navigator.run(200);

    // Chega ao objetivo pelo desvio, gastando mais que o caminho reto.
    EXPECT_TRUE(success);
    EXPECT_EQ(navigator.getPosition(), (Position{0, 3}));
    EXPECT_TRUE(known.isBlocked({0, 1}, Direction::East));
    EXPECT_GT(robot.advances(), 3);
}

}  // namespace
}  // namespace micromouse::use_cases
