#include <gtest/gtest.h>

#include <random>
#include <vector>

#include "domain/DipDecoder.hpp"
#include "domain/Maze.hpp"
#include "domain/ReportFrame.hpp"
#include "protocol/ProtocolV1.hpp"
#include "simulation/SimulatedRobot.hpp"
#include "use_cases/Navigator.hpp"

// Labirinto "deitado" (mais colunas que linhas: 8x4, 12x4) e "em pé" (mais linhas que colunas: 4x8,
// 4x12). Os nomes são colunas x linhas, como no firmware e no protocolo: 8x4 = 4 linhas, 8 colunas.

namespace micromouse::domain {
namespace {

struct Shape {
    MazeType type;
    int rows;
    int columns;
    const char* name;
};
constexpr Shape kShapes[] = {{MazeType::Small4x4, 4, 4, "4x4"},   {MazeType::Medium8x4, 4, 8, "8x4"},
                             {MazeType::Large12x4, 4, 12, "12x4"}, {MazeType::Tall4x8, 8, 4, "4x8"},
                             {MazeType::Tall4x12, 12, 4, "4x12"}};

TEST(Orientation, EveryTypeHasItsDimensionsAndOppositeCornersForStartAndGoal) {
    for (const Shape& shape : kShapes) {
        for (const bool right : {false, true}) {
            const MazeSetup setup = makeMazeSetup(shape.type, right);
            EXPECT_EQ(setup.rows, shape.rows) << shape.name;
            EXPECT_EQ(setup.columns, shape.columns) << shape.name;
            // Largada num canto de baixo; objetivo no canto oposto (em cima, do outro lado).
            EXPECT_EQ(setup.start.row, shape.rows - 1) << shape.name;
            EXPECT_EQ(setup.start.column, right ? shape.columns - 1 : 0) << shape.name;
            EXPECT_EQ(setup.goal.row, 0) << shape.name;
            EXPECT_EQ(setup.goal.column, right ? 0 : shape.columns - 1) << shape.name;
            EXPECT_EQ(startBorderIsOnTheLeft(setup), !right) << shape.name;
        }
    }
}

// Os tipos de antes continuam saindo do DIP, e a combinação proibida (#393) continua proibida.
TEST(Orientation, TheDipStillDecodesTheOriginalTypesAndKeepsTheForbiddenCombination) {
    DipDecoder decoder;
    for (const bool right : {false, true}) {
        EXPECT_EQ(decoder.decode(false, false, right).type, MazeType::Small4x4);
        EXPECT_EQ(decoder.decode(true, false, right).type, MazeType::Medium8x4);
        EXPECT_EQ(decoder.decode(false, true, right).type, MazeType::Large12x4);
        EXPECT_EQ(decoder.decode(true, false, right).goal.column, right ? 0 : 7);
    }
    EXPECT_THROW((void)decoder.decode(true, true, false), std::invalid_argument);
}

TEST(Orientation, TheBleCommandNamesEveryTypeInColumnsByRows) {
    for (const Shape& shape : kShapes) {
        const std::optional<MazeType> parsed = parseMazeType(shape.name);
        ASSERT_TRUE(parsed.has_value()) << shape.name;
        EXPECT_EQ(*parsed, shape.type);
    }
    EXPECT_FALSE(parseMazeType("").has_value());
    EXPECT_FALSE(parseMazeType("5x5").has_value());
    EXPECT_FALSE(parseMazeType("4 x 8").has_value());
    EXPECT_FALSE(parseMazeType("8x4x").has_value());
}

// O protocolo (e o painel) só conhecem 4x4, 8x4 e 12x4 (decisão de 19/11: sem mudar o contrato).
// O labirinto em pé é relatado como o deitado correspondente, com o mapa girado.
TEST(Orientation, ThePortraitTypesAreReportedAsTheLandscapeOnes) {
    EXPECT_EQ(protocol::mazeToString(MazeType::Tall4x8), "8x4");
    EXPECT_EQ(protocol::mazeToString(MazeType::Tall4x12), "12x4");
    EXPECT_EQ(protocol::mazeToString(MazeType::Medium8x4), "8x4");
    EXPECT_EQ(protocol::mazeToString(MazeType::Small4x4), "4x4");
}

TEST(ReportFrame, LandscapeAndSquareMazesAreReportedAsTheyAre) {
    for (const MazeType type : {MazeType::Small4x4, MazeType::Medium8x4, MazeType::Large12x4}) {
        const MazeSetup setup = makeMazeSetup(type, false);
        const ReportFrame frame(setup);
        EXPECT_FALSE(frame.rotated());
        EXPECT_EQ(frame.position({1, 2}), (Position{1, 2}));
        EXPECT_EQ(frame.direction(Direction::West), Direction::West);
        EXPECT_EQ(frame.type(), type);
    }
}

// Em pé: a largada e o objetivo caem nos cantos certos do labirinto deitado relatado (largada embaixo,
// objetivo em cima), e o giro é uma ROTAÇÃO (o mapa não sai espelhado).
TEST(ReportFrame, APortraitMazeIsRotatedIntoTheLandscapeOneWithTheStartAtTheBottom) {
    for (const MazeType type : {MazeType::Tall4x8, MazeType::Tall4x12}) {
        for (const bool right : {false, true}) {
            const MazeSetup setup = makeMazeSetup(type, right);
            const ReportFrame frame(setup);
            ASSERT_TRUE(frame.rotated());
            const int landscapeRows = setup.columns;
            const int landscapeColumns = setup.rows;
            const Position start = frame.position(setup.start);
            const Position goal = frame.position(setup.goal);
            EXPECT_EQ(start.row, landscapeRows - 1);
            EXPECT_EQ(goal.row, 0);
            EXPECT_TRUE(start.column == 0 || start.column == landscapeColumns - 1);
            EXPECT_EQ(goal.column, landscapeColumns - 1 - start.column);
            EXPECT_EQ(frame.type(), landscapeColumns == 8 ? MazeType::Medium8x4 : MazeType::Large12x4);
        }
    }
}

// A rotação preserva vizinhança (andar na direção d leva à vizinha na direção relatada), distâncias
// e a chirality (quatro viradas à direita seguidas continuam sendo à direita).
TEST(ReportFrame, RotationKeepsAdjacencyAndHandedness) {
    for (const MazeType type : {MazeType::Tall4x8, MazeType::Tall4x12}) {
        for (const bool right : {false, true}) {
            const MazeSetup setup = makeMazeSetup(type, right);
            const ReportFrame frame(setup);
            for (int r = 0; r < setup.rows; ++r) {
                for (int c = 0; c < setup.columns; ++c) {
                    const Position p{r, c};
                    const Position mapped = frame.position(p);
                    EXPECT_GE(mapped.row, 0);
                    EXPECT_LT(mapped.row, setup.columns);
                    EXPECT_GE(mapped.column, 0);
                    EXPECT_LT(mapped.column, setup.rows);
                    for (const Direction d : {Direction::North, Direction::East, Direction::South,
                                              Direction::West}) {
                        const Position q{r + rowDelta(d), c + colDelta(d)};
                        if (q.row < 0 || q.row >= setup.rows || q.column < 0 || q.column >= setup.columns) {
                            continue;
                        }
                        const Direction md = frame.direction(d);
                        const Position expected{mapped.row + rowDelta(md), mapped.column + colDelta(md)};
                        EXPECT_EQ(frame.position(q), expected);
                        // Virar à direita no mapa do robô é virar à direita no relatado.
                        EXPECT_EQ(frame.direction(turnRight(d)), turnRight(md));
                    }
                }
            }
        }
    }
}

// Quatro paredes de uma célula (N, L, S, O) giram junto com o mapa.
TEST(ReportFrame, CellWallsFollowTheRotation) {
    const MazeSetup setup = makeMazeSetup(MazeType::Tall4x8, false);
    const ReportFrame frame(setup);
    const ReportFrame::Walls walls = frame.walls(true, false, false, false);  // só a parede ao norte
    const Direction north = frame.direction(Direction::North);
    EXPECT_EQ(walls.north, north == Direction::North);
    EXPECT_EQ(walls.east, north == Direction::East);
    EXPECT_EQ(walls.south, north == Direction::South);
    EXPECT_EQ(walls.west, north == Direction::West);
}

// ---- O robô resolve todas as formas, dos dois cantos, sem bater (item 6) ----

MazeMap generate(int rows, int columns, unsigned seed, Position start) {
    MazeMap maze(rows, columns);
    maze.initKnownPerimeter();
    for (int r = 0; r < rows; ++r) {
        for (int c = 0; c < columns; ++c) {
            for (const Direction d : {Direction::North, Direction::East, Direction::South,
                                      Direction::West}) {
                maze.setWall({r, c}, d, Wall::Present);
            }
        }
    }
    std::mt19937 random(seed);
    std::vector<bool> visited(static_cast<std::size_t>(rows * columns), false);
    std::vector<Position> stack{start};
    visited[static_cast<std::size_t>(start.row * columns + start.column)] = true;
    while (!stack.empty()) {
        const Position here = stack.back();
        std::vector<Direction> options;
        for (const Direction d : {Direction::North, Direction::East, Direction::South,
                                  Direction::West}) {
            const Position next{here.row + rowDelta(d), here.column + colDelta(d)};
            if (maze.contains(next) &&
                !visited[static_cast<std::size_t>(next.row * columns + next.column)]) {
                options.push_back(d);
            }
        }
        if (options.empty()) {
            stack.pop_back();
            continue;
        }
        const Direction d = options[random() % options.size()];
        const Position next{here.row + rowDelta(d), here.column + colDelta(d)};
        maze.setWall(here, d, Wall::Open);
        visited[static_cast<std::size_t>(next.row * columns + next.column)] = true;
        stack.push_back(next);
    }
    // Alguns laços: abre paredes internas ao acaso.
    for (int opened = 0, tries = 0; opened < rows + columns && tries < 500; ++tries) {
        const Position here{static_cast<int>(random() % static_cast<unsigned>(rows)),
                            static_cast<int>(random() % static_cast<unsigned>(columns))};
        const Direction d = (random() % 2 == 0) ? Direction::East : Direction::South;
        const Position next{here.row + rowDelta(d), here.column + colDelta(d)};
        if (maze.contains(next) && maze.isBlocked(here, d)) {
            maze.setWall(here, d, Wall::Open);
            ++opened;
        }
    }
    return maze;
}

TEST(Orientation, TheRobotSolvesEveryShapeFromBothCornersWithoutHittingAWall) {
    for (const Shape& shape : kShapes) {
        for (const bool right : {false, true}) {
            for (unsigned seed = 1; seed <= 12; ++seed) {
                const MazeSetup setup = makeMazeSetup(shape.type, right);
                const MazeMap truth = generate(setup.rows, setup.columns, seed * 17U + 3U, setup.start);
                MazeMap known(setup.rows, setup.columns);
                known.initKnownPerimeter();
                test::SimulatedRobot robot(truth, setup.start, Direction::North);
                use_cases::Navigator navigator(known, robot, robot, setup.start, Direction::North,
                                               {setup.goal});
                // O canto de largada confere com o que o sensor vê: a borda fica do lado da DIP.
                const ports::WallsAhead first = robot.sense();
                EXPECT_EQ(checkStartCorner(setup, first.left, false, first.right, false),
                          StartCheck::Ok)
                    << shape.name << " seed " << seed;
                int guard = setup.rows * setup.columns * 4;
                while (!navigator.reachedGoal() && guard-- > 0 && !navigator.stuck()) {
                    navigator.step();
                }
                EXPECT_TRUE(navigator.reachedGoal()) << shape.name << (right ? " dir" : " esq") << " seed " << seed;
                EXPECT_EQ(robot.wallHits(), 0) << shape.name << " seed " << seed;
                EXPECT_EQ(robot.halfTurns(), 0) << shape.name << " seed " << seed;
                EXPECT_EQ(robot.position(), setup.goal) << shape.name;
            }
        }
    }
}

}  // namespace
}  // namespace micromouse::domain
