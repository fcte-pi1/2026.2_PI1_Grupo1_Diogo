#include <gtest/gtest.h>

#include <algorithm>
#include <iostream>
#include <random>
#include <string>
#include <utility>
#include <vector>

#include "domain/DipDecoder.hpp"
#include "domain/Maze.hpp"
#include "simulation/SimulatedRobot.hpp"
#include "use_cases/Navigator.hpp"

// Exploração de labirintos DESCONHECIDOS (16/11). O robô é só de exploração: começa sabendo as
// bordas, descobre cada parede ao passar e resolve pela inundação. Estes testes não usam a pista
// 4x4 da equipe: rodam labirintos de 4x4, 8x4 e 12x4 desenhados à mão e gerados (com semente
// fixa), com becos e laços, largando dos dois cantos da linha de baixo. Em cada um:
//  - o robô chega ao canto oposto dentro do limite de passos da corrida (linhas x colunas x 4);
//  - nunca anda contra uma parede nem dá meia-volta no lugar;
//  - conta os passos (cada passo é uma parada de decisão no centro da célula) e as curvas, para
//    comparar antes e depois de mudanças na navegação.
// E um teste de labirintos em SEQUÊNCIA: o mapa nasce de novo a cada largada, e nada do labirinto
// anterior vale no seguinte.

namespace micromouse::use_cases {
namespace {

using domain::Direction;
using domain::MazeMap;
using domain::MazeSetup;
using domain::Position;
using domain::Wall;
using test::SimulatedRobot;

// Labirinto em texto, no referencial do Navigator (linha 0 em cima). Cada célula tem 3 colunas:
//   +--+--+     linha par: paredes horizontais ("--" = parede, "  " = aberto)
//   |     |     linha ímpar: paredes verticais ("|" = parede, " " = aberto)
//   +--+--+
MazeMap parseMaze(const std::vector<std::string>& art) {
    const int rows = static_cast<int>(art.size() / 2);
    const int columns = static_cast<int>((art.front().size() - 1) / 3);
    MazeMap maze(rows, columns);
    maze.initKnownPerimeter();
    for (int row = 0; row < rows; ++row) {
        for (int column = 0; column < columns; ++column) {
            const std::size_t x = static_cast<std::size_t>(column) * 3;
            const std::string& above = art[static_cast<std::size_t>(row) * 2];
            const std::string& middle = art[static_cast<std::size_t>(row) * 2 + 1];
            maze.setWall({row, column}, Direction::North,
                         above[x + 1] == '-' ? Wall::Present : Wall::Open);
            maze.setWall({row, column}, Direction::West,
                         middle[x] == '|' ? Wall::Present : Wall::Open);
        }
    }
    return maze;
}

// Labirinto gerado: uma árvore (todas as células ligadas, com becos) e depois `extraOpenings`
// paredes internas abertas ao acaso (laços). A mesma semente dá sempre o mesmo labirinto.
MazeMap generateMaze(int rows, int columns, unsigned seed, int extraOpenings) {
    MazeMap maze(rows, columns);
    maze.initKnownPerimeter();
    for (int row = 0; row < rows; ++row) {
        for (int column = 0; column < columns; ++column) {
            for (const Direction side : {Direction::North, Direction::East, Direction::South,
                                         Direction::West}) {
                maze.setWall({row, column}, side, Wall::Present);
            }
        }
    }
    std::mt19937 random(seed);
    std::vector<bool> visited(static_cast<std::size_t>(rows * columns), false);
    std::vector<Position> stack{{rows - 1, 0}};
    visited[static_cast<std::size_t>((rows - 1) * columns)] = true;
    while (!stack.empty()) {
        const Position here = stack.back();
        std::vector<Direction> options;
        for (const Direction side : {Direction::North, Direction::East, Direction::South,
                                     Direction::West}) {
            const Position next{here.row + domain::rowDelta(side),
                                here.column + domain::colDelta(side)};
            if (maze.contains(next) &&
                !visited[static_cast<std::size_t>(next.row * columns + next.column)]) {
                options.push_back(side);
            }
        }
        if (options.empty()) {
            stack.pop_back();
            continue;
        }
        const Direction side = options[random() % options.size()];
        const Position next{here.row + domain::rowDelta(side), here.column + domain::colDelta(side)};
        maze.setWall(here, side, Wall::Open);
        visited[static_cast<std::size_t>(next.row * columns + next.column)] = true;
        stack.push_back(next);
    }
    for (int opened = 0, tries = 0; opened < extraOpenings && tries < 1000; ++tries) {
        const Position here{static_cast<int>(random() % static_cast<unsigned>(rows)),
                            static_cast<int>(random() % static_cast<unsigned>(columns))};
        const Direction side = (random() % 2 == 0) ? Direction::East : Direction::South;
        const Position next{here.row + domain::rowDelta(side), here.column + domain::colDelta(side)};
        if (maze.contains(next) && maze.isBlocked(here, side)) {
            maze.setWall(here, side, Wall::Open);
            ++opened;
        }
    }
    return maze;
}

int unknownInnerWalls(const MazeMap& maze) {
    int unknown = 0;
    for (int row = 0; row < maze.getRows(); ++row) {
        for (int column = 0; column < maze.getColumns(); ++column) {
            if (column + 1 < maze.getColumns() &&
                maze.getWall({row, column}, Direction::East) == Wall::Unknown) {
                ++unknown;
            }
            if (row + 1 < maze.getRows() &&
                maze.getWall({row, column}, Direction::South) == Wall::Unknown) {
                ++unknown;
            }
        }
    }
    return unknown;
}

int innerWalls(const MazeMap& maze) {
    return (maze.getColumns() - 1) * maze.getRows() + (maze.getRows() - 1) * maze.getColumns();
}

struct Outcome {
    bool reached{false};
    int steps{0};  // cada passo sente a célula parado: é uma parada de decisão
    int turns{0};
    int reverses{0};
    int halfTurns{0};
    int wallHits{0};
    int outsideOpenings{0};
    Position finalCell{};
};

// Uma largada como a do firmware (src/main.cpp): mapa NOVO só com as bordas, Navigator novo,
// virado para o norte, objetivo no canto oposto, limite de linhas x colunas x 4 passos.
Outcome explore(const MazeMap& truth, const MazeSetup& setup, MazeMap& known) {
    SimulatedRobot robot(truth, setup.start, Direction::North);
    Navigator navigator(known, robot, robot, setup.start, Direction::North, {setup.goal});
    Outcome outcome;
    int guard = setup.rows * setup.columns * 4;
    while (!navigator.reachedGoal() && !navigator.stuck() && guard-- > 0) {
        navigator.step();
        ++outcome.steps;
    }
    outcome.reached = navigator.reachedGoal();
    outcome.turns = robot.turns();
    outcome.reverses = robot.reverses();
    outcome.halfTurns = robot.halfTurns();
    outcome.wallHits = robot.wallHits();
    outcome.outsideOpenings = navigator.outsideOpenings();
    outcome.finalCell = robot.position();
    return outcome;
}

Outcome explore(const MazeMap& truth, const MazeSetup& setup) {
    MazeMap known(setup.rows, setup.columns);
    known.initKnownPerimeter();
    return explore(truth, setup, known);
}

MazeSetup setupFor(const MazeMap& truth, bool startOnTheRight) {
    const bool dip1 = truth.getColumns() == 8;
    const bool dip2 = truth.getColumns() == 12;
    return domain::DipDecoder().decode(dip1, dip2, startOnTheRight);
}

void expectClean(const Outcome& run, const MazeSetup& setup, const std::string& what) {
    EXPECT_TRUE(run.reached) << what;
    EXPECT_EQ(run.finalCell, setup.goal) << what;
    EXPECT_EQ(run.wallHits, 0) << what;
    EXPECT_EQ(run.halfTurns, 0) << what;
    EXPECT_EQ(run.outsideOpenings, 0) << what;
}

const std::vector<std::string> kHand4x4 = {
    "+--+--+--+--+",
    "|        |  |",
    "+  +--+  +  +",
    "|  |     |  |",
    "+  +  +--+  +",
    "|  |        |",
    "+  +--+--+  +",
    "|           |",
    "+--+--+--+--+",
};

// 8x4 com um beco comprido (a linha de cima à esquerda) e um laço no meio.
const std::vector<std::string> kHand8x4 = {
    "+--+--+--+--+--+--+--+--+",
    "|           |           |",
    "+--+--+--+  +  +--+--+  +",
    "|        |     |     |  |",
    "+  +--+  +--+  +  +  +  +",
    "|  |              |     |",
    "+  +  +--+--+--+--+--+  +",
    "|     |                 |",
    "+--+--+--+--+--+--+--+--+",
};

// 12x4 em ziguezague, com becos nos dois extremos e dois laços.
const std::vector<std::string> kHand12x4 = {
    "+--+--+--+--+--+--+--+--+--+--+--+--+",
    "|     |        |           |        |",
    "+  +  +  +--+  +  +--+--+  +  +--+  +",
    "|  |     |     |     |        |     |",
    "+  +--+--+  +--+--+  +  +--+--+  +--+",
    "|        |           |     |        |",
    "+--+--+  +  +--+--+--+--+  +  +--+  +",
    "|           |              |     |  |",
    "+--+--+--+--+--+--+--+--+--+--+--+--+",
};

TEST(Exploration, HandDrawnMazesOfTheThreeSizesFromBothCorners) {
    const std::vector<std::pair<std::string, MazeMap>> mazes = {
        {"4x4 a mao", parseMaze(kHand4x4)},
        {"8x4 a mao", parseMaze(kHand8x4)},
        {"12x4 a mao", parseMaze(kHand12x4)},
    };
    for (const auto& [name, truth] : mazes) {
        for (const bool right : {false, true}) {
            const MazeSetup setup = setupFor(truth, right);
            const Outcome run = explore(truth, setup);
            const std::string what = name + (right ? ", largada a direita" : ", largada a esquerda");
            expectClean(run, setup, what);
            std::cout << "[exploracao] " << what << ": " << run.steps << " passos (paradas), "
                      << run.turns << " curvas, " << run.reverses << " res\n";
        }
    }
}

TEST(Exploration, GeneratedMazesWithDeadEndsAndLoops) {
    struct Size {
        int rows;
        int columns;
    };
    int runs = 0;
    long steps = 0;
    long turns = 0;
    long reverses = 0;
    for (const Size size : {Size{4, 4}, Size{4, 8}, Size{4, 12}}) {
        for (unsigned seed = 1; seed <= 40; ++seed) {
            // Semente ímpar: só a árvore (muitos becos). Par: com laços.
            const int loops = seed % 2 == 0 ? size.columns / 2 : 0;
            const MazeMap truth = generateMaze(size.rows, size.columns, seed, loops);
            for (const bool right : {false, true}) {
                const MazeSetup setup = setupFor(truth, right);
                const Outcome run = explore(truth, setup);
                expectClean(run, setup,
                            std::to_string(size.columns) + "x4 semente " + std::to_string(seed) +
                                (right ? " direita" : " esquerda"));
                ++runs;
                steps += run.steps;
                turns += run.turns;
                reverses += run.reverses;
            }
        }
    }
    std::cout << "[exploracao] " << runs << " labirintos gerados: " << steps
              << " passos (paradas), " << turns << " curvas, " << reverses << " res no total\n";
}

// Labirintos em sequência, como no firmware: cada largada cria um mapa novo só com as bordas.
TEST(Exploration, EachStartBeginsWithOnlyThePerimeterKnown) {
    const MazeMap first = parseMaze(kHand4x4);
    const MazeMap second = generateMaze(4, 4, 7, 2);
    const MazeSetup setup = setupFor(first, false);

    MazeMap knownFirst(setup.rows, setup.columns);
    knownFirst.initKnownPerimeter();
    ASSERT_EQ(unknownInnerWalls(knownFirst), innerWalls(knownFirst));
    const Outcome runFirst = explore(first, setup, knownFirst);
    expectClean(runFirst, setup, "primeiro labirinto");
    EXPECT_LT(unknownInnerWalls(knownFirst), innerWalls(knownFirst));  // aprendeu paredes

    // Largada seguinte, labirinto diferente: mapa novo, nada do anterior.
    MazeMap knownSecond(setup.rows, setup.columns);
    knownSecond.initKnownPerimeter();
    EXPECT_EQ(unknownInnerWalls(knownSecond), innerWalls(knownSecond));
    const Outcome runSecond = explore(second, setup, knownSecond);
    expectClean(runSecond, setup, "segundo labirinto");

    // O mesmo segundo labirinto, explorado sem nenhum anterior, dá exatamente o mesmo trajeto.
    const Outcome alone = explore(second, setup);
    EXPECT_EQ(runSecond.steps, alone.steps);
    EXPECT_EQ(runSecond.turns, alone.turns);
    EXPECT_EQ(runSecond.reverses, alone.reverses);
}

// O que acontece se o mapa NÃO for zerado (para o teste acima ter sentido): com as paredes do
// labirinto anterior valendo, em pelo menos um dos labirintos seguintes o robô anda por um
// caminho diferente do que faria com o mapa novo, ou nem chega.
TEST(Exploration, AStaleMapChangesTheRouteWhichIsWhyItMustBeReset) {
    const MazeMap first = parseMaze(kHand4x4);
    const MazeSetup setup = setupFor(first, false);
    int different = 0;
    for (unsigned seed = 1; seed <= 20; ++seed) {
        const MazeMap second = generateMaze(4, 4, seed, 2);
        MazeMap known(setup.rows, setup.columns);
        known.initKnownPerimeter();
        (void)explore(first, setup, known);
        const Outcome stale = explore(second, setup, known);  // mapa velho, labirinto novo
        const Outcome fresh = explore(second, setup);
        EXPECT_TRUE(fresh.reached) << seed;
        if (!stale.reached || stale.steps != fresh.steps || stale.turns != fresh.turns) {
            ++different;
        }
    }
    EXPECT_GT(different, 0);
}

}  // namespace
}  // namespace micromouse::use_cases
