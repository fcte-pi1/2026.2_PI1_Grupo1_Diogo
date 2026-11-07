#include <gtest/gtest.h>

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

// Robô simulado cujo sensor frontal falha nas primeiras leituras (NACK, medida atrasada).
class FlakyFrontRobot final : public ports::ISensorPort, public ports::IMotionPort {
private:
    SimulatedRobot robot_;
    mutable int failures_;

public:
    FlakyFrontRobot(const MazeMap& truth, Position start, Direction heading, int failures)
        : robot_(truth, start, heading), failures_(failures) {}
    [[nodiscard]] ports::WallsAhead sense() const override {
        ports::WallsAhead walls = robot_.sense();
        if (failures_ > 0) {
            --failures_;
            walls.front = true;  // falha conta como parede, mas não pode ir para o mapa
            walls.frontUnknown = true;
        }
        return walls;
    }
    void advanceCell() override { robot_.advanceCell(); }
    void turnLeft() override { robot_.turnLeft(); }
    void turnRight() override { robot_.turnRight(); }
    void turnAround() override { robot_.turnAround(); }
    [[nodiscard]] const SimulatedRobot& robot() const { return robot_; }
};

// Uma falha passageira do sensor não vira parede no mapa (que ficaria até o fim da corrida) e o
// robô não avança às cegas: espera a próxima leitura e segue (revisão do #438).
TEST(Navigator, TransientSensorFaultDoesNotRecordAWallNorAdvanceBlindly) {
    MazeMap known(4, 4);
    MazeMap truth(4, 4);
    truth.initKnownPerimeter();
    known.initKnownPerimeter();

    // 3 falhas: a primeira leitura da corrida é descartada pelo navegador, e as outras 2 caem nos
    // dois primeiros passos.
    FlakyFrontRobot robot(truth, {3, 0}, Direction::North, /*failures=*/3);
    Navigator navigator(known, robot, robot, {3, 0}, Direction::North, {{0, 0}});

    navigator.step();  // frente em falha: não grava parede e não anda
    EXPECT_EQ(known.getWall({3, 0}, Direction::North), Wall::Unknown);
    EXPECT_EQ(robot.robot().advances(), 0);
    navigator.step();  // falha de novo
    EXPECT_EQ(robot.robot().advances(), 0);
    navigator.step();  // sensor volta: lê "aberto" e avança
    EXPECT_EQ(known.getWall({3, 0}, Direction::North), Wall::Open);
    EXPECT_EQ(robot.robot().advances(), 1);
    EXPECT_FALSE(navigator.stuck());
}

// O frontal dá medida incerta o tempo todo (SigmaFail perto de uma parede escura, por exemplo), mas
// o sensor funciona: não há Erro pelo SensorHealthMonitor. Antes, o robô esperava uma leitura boa
// para sempre, parado, até o limite de passos. Agora, depois de algumas leituras, assume parede
// naquele lado e segue por outro caminho.
TEST(Navigator, PersistentUnknownSideIsTreatedAsWallAndRobotTakesAnotherWay) {
    MazeMap known(4, 4);
    MazeMap truth(4, 4);
    truth.initKnownPerimeter();
    known.initKnownPerimeter();

    FlakyFrontRobot robot(truth, {3, 0}, Direction::North, /*failures=*/1000000);
    Navigator navigator(known, robot, robot, {3, 0}, Direction::North, {{0, 3}});

    EXPECT_TRUE(navigator.run(100));
    EXPECT_FALSE(navigator.stuck());
    EXPECT_GT(robot.robot().advances(), 0);
}

// Se o único caminho é pelo lado que nunca se deixa ler, o navegador desiste com stuck() (a corrida
// vai ao Erro com o motivo e as leituras dos ToF), em vez de ficar parado até o limite de passos.
TEST(Navigator, GivesUpWhenTheOnlyWayIsASideThatNeverReads) {
    MazeMap known(4, 4);
    MazeMap truth(4, 4);
    truth.initKnownPerimeter();
    known.initKnownPerimeter();
    truth.setWall({3, 0}, Direction::East, Wall::Present);  // só o norte (a frente) está aberto

    FlakyFrontRobot robot(truth, {3, 0}, Direction::North, /*failures=*/1000000);
    Navigator navigator(known, robot, robot, {3, 0}, Direction::North, {{0, 0}});

    EXPECT_FALSE(navigator.run(20));
    EXPECT_TRUE(navigator.stuck());
    EXPECT_EQ(robot.robot().advances(), 0);
}

// Robô simulado cuja PRIMEIRA leitura vem com lixo: os ToF ficaram medindo sem ninguém ler desde o
// boot, e a primeira medida depois disso não vale (07/11: a primeira linha do `tof` saía com 0, 6,
// 22 ou 9999; 04/11: o frontal "via" parede na largada). Conta quantas vezes ele avançou contra
// uma parede de verdade.
class GarbageFirstReadingRobot final : public ports::ISensorPort, public ports::IMotionPort {
private:
    const MazeMap& truth_;
    SimulatedRobot robot_;
    mutable bool first_{true};
    int collisions_{0};

public:
    GarbageFirstReadingRobot(const MazeMap& truth, Position start, Direction heading)
        : truth_(truth), robot_(truth, start, heading) {}
    [[nodiscard]] ports::WallsAhead sense() const override {
        if (first_) {
            first_ = false;
            return {};  // "nada ao alcance" nos três lados
        }
        return robot_.sense();
    }
    void advanceCell() override {
        if (truth_.isBlocked(robot_.position(), robot_.heading())) ++collisions_;
        robot_.advanceCell();
    }
    void turnLeft() override { robot_.turnLeft(); }
    void turnRight() override { robot_.turnRight(); }
    void turnAround() override { robot_.turnAround(); }
    [[nodiscard]] int collisions() const { return collisions_; }
};

// A primeira leitura da corrida é descartada: com lixo dizendo "livre", o robô avançaria contra a
// parede da largada.
TEST(Navigator, DiscardsTheFirstReadingOfTheRun) {
    MazeMap known(4, 4);
    MazeMap truth(4, 4);
    truth.initKnownPerimeter();
    known.initKnownPerimeter();
    truth.setWall({3, 0}, Direction::North, Wall::Present);  // parede logo à frente da largada

    GarbageFirstReadingRobot robot(truth, {3, 0}, Direction::North);
    Navigator navigator(known, robot, robot, {3, 0}, Direction::North, {{0, 0}});

    EXPECT_TRUE(navigator.run(50));
    EXPECT_EQ(robot.collisions(), 0);
}

// Paredes lidas errado (guardadas no mapa) fecham todos os caminhos: o navegador esquece o que
// leu, sente de novo e segue, em vez de ficar parado na célula (teste de 04/11).
TEST(Navigator, ForgetsWrongWallsWhenNoPathIsLeft) {
    MazeMap known(4, 4);
    MazeMap truth(4, 4);
    truth.initKnownPerimeter();
    known.initKnownPerimeter();
    // Leituras antigas e erradas: a célula (0,1) fechada por todos os lados.
    known.setWall({0, 1}, Direction::West, Wall::Present);
    known.setWall({0, 1}, Direction::East, Wall::Present);
    known.setWall({0, 1}, Direction::South, Wall::Present);

    SimulatedRobot robot(truth, {3, 0}, Direction::North);
    Navigator navigator(known, robot, robot, {3, 0}, Direction::North, {{0, 1}});

    EXPECT_TRUE(navigator.run(50));
    EXPECT_FALSE(navigator.stuck());
    EXPECT_EQ(navigator.getPosition(), (Position{0, 1}));
}

// Se nem lendo de novo há caminho (o sensor insiste em paredes que fecham o robô), o navegador
// desiste: não se mexe e avisa, em vez de gastar o limite de passos parado.
TEST(Navigator, GivesUpWhenSensorsCloseEveryPath) {
    MazeMap known(4, 4);
    MazeMap truth(4, 4);
    truth.initKnownPerimeter();
    // A largada (3,0) cercada: frente (norte) e direita (leste) com parede; oeste e sul são borda.
    truth.setWall({3, 0}, Direction::North, Wall::Present);
    truth.setWall({3, 0}, Direction::East, Wall::Present);

    SimulatedRobot robot(truth, {3, 0}, Direction::North);
    Navigator navigator(known, robot, robot, {3, 0}, Direction::North, {{0, 3}});

    EXPECT_FALSE(navigator.run(50));
    EXPECT_TRUE(navigator.stuck());
    EXPECT_EQ(robot.advances(), 0);
    EXPECT_EQ(robot.turns(), 0);
}

}  // namespace
}  // namespace micromouse::use_cases
