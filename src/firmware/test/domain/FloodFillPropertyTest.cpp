#include <gtest/gtest.h>

#include <array>
#include <cstdint>
#include <optional>
#include <queue>
#include <vector>

#include "domain/FloodFill.hpp"
#include "domain/Maze.hpp"

// Testes de propriedade do Flood Fill (19/11): o resultado é comparado com um BFS INDEPENDENTE, escrito
// sem usar MazeMap nem FloodFill, em labirintos aleatórios (gerador determinístico) de 4x4, 4x8, 8x4,
// 4x12 e 12x4 (linhas x colunas).

namespace micromouse::domain {
namespace {

constexpr int kUnreachableRef = -1;

class Rng {
public:
    explicit Rng(std::uint32_t seed) : state_(seed * 2654435761U + 1U) {}
    std::uint32_t next() {
        state_ ^= state_ << 13;
        state_ ^= state_ >> 17;
        state_ ^= state_ << 5;
        return state_;
    }
    int below(int n) { return static_cast<int>(next() % static_cast<std::uint32_t>(n)); }

private:
    std::uint32_t state_;
};

// Referência: paredes em duas tabelas simples. vertical[r][c] é a borda ESQUERDA da célula (r,c)
// (c = columns é a borda direita); horizontal[r][c] é a borda de CIMA (r = rows é a de baixo).
struct Reference {
    int rows;
    int cols;
    std::vector<Wall> vertical;    // rows x (cols+1)
    std::vector<Wall> horizontal;  // (rows+1) x cols

    Reference(int r, int c)
        : rows(r), cols(c), vertical(static_cast<std::size_t>(r * (c + 1)), Wall::Open),
          horizontal(static_cast<std::size_t>((r + 1) * c), Wall::Open) {
        for (int i = 0; i < r; ++i) {
            v(i, 0) = Wall::Present;
            v(i, c) = Wall::Present;
        }
        for (int j = 0; j < c; ++j) {
            h(0, j) = Wall::Present;
            h(r, j) = Wall::Present;
        }
    }
    Wall& v(int r, int c) { return vertical[static_cast<std::size_t>(r * (cols + 1) + c)]; }
    Wall& h(int r, int c) { return horizontal[static_cast<std::size_t>(r * cols + c)]; }
    [[nodiscard]] Wall v(int r, int c) const {
        return vertical[static_cast<std::size_t>(r * (cols + 1) + c)];
    }
    [[nodiscard]] Wall h(int r, int c) const {
        return horizontal[static_cast<std::size_t>(r * cols + c)];
    }

    // A passagem de (r,c) na direção d está bloqueada? (Desconhecida conta como aberta.)
    [[nodiscard]] bool blocked(int r, int c, Direction d) const {
        switch (d) {
            case Direction::North: return h(r, c) == Wall::Present;
            case Direction::South: return h(r + 1, c) == Wall::Present;
            case Direction::West: return v(r, c) == Wall::Present;
            case Direction::East: return v(r, c + 1) == Wall::Present;
        }
        return true;
    }

    // BFS a partir dos objetivos; kUnreachableRef onde não chega.
    [[nodiscard]] std::vector<int> bfs(const std::vector<Position>& goals) const {
        std::vector<int> dist(static_cast<std::size_t>(rows * cols), kUnreachableRef);
        std::queue<std::pair<int, int>> frontier;
        for (const Position& g : goals) {
            dist[static_cast<std::size_t>(g.row * cols + g.column)] = 0;
            frontier.push({g.row, g.column});
        }
        constexpr std::array<Direction, 4> kDirs = {Direction::North, Direction::East,
                                                    Direction::South, Direction::West};
        while (!frontier.empty()) {
            const auto [r, c] = frontier.front();
            frontier.pop();
            for (const Direction d : kDirs) {
                if (blocked(r, c, d)) continue;
                const int nr = r + rowDelta(d);
                const int nc = c + colDelta(d);
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
                auto& cell = dist[static_cast<std::size_t>(nr * cols + nc)];
                if (cell != kUnreachableRef) continue;
                cell = dist[static_cast<std::size_t>(r * cols + c)] + 1;
                frontier.push({nr, nc});
            }
        }
        return dist;
    }
};

// Aplica uma parede nas duas estruturas, a partir de um lado qualquer.
void setBoth(MazeMap& maze, Reference& ref, Position p, Direction d, Wall state) {
    maze.setWall(p, d, state);
    switch (d) {
        case Direction::North: ref.h(p.row, p.column) = state; break;
        case Direction::South: ref.h(p.row + 1, p.column) = state; break;
        case Direction::West: ref.v(p.row, p.column) = state; break;
        case Direction::East: ref.v(p.row, p.column + 1) = state; break;
    }
}

struct Case {
    MazeMap maze;
    Reference ref;
    Case(int rows, int cols) : maze(rows, cols), ref(rows, cols) { maze.initKnownPerimeter(); }
};

// Labirinto aleatório: cada borda interna fica Presente (~30%), Desconhecida (~10%) ou Aberta. Cada
// parede é aplicada a partir de UM dos dois lados, escolhido ao acaso (a simetria é testada à parte).
Case randomCase(int rows, int cols, Rng& rng) {
    Case c(rows, cols);
    constexpr std::array<Direction, 4> kDirs = {Direction::North, Direction::East, Direction::South,
                                                Direction::West};
    for (int r = 0; r < rows; ++r) {
        for (int col = 0; col < cols; ++col) {
            for (const Direction d : {Direction::East, Direction::South}) {
                const int nr = r + rowDelta(d);
                const int nc = col + colDelta(d);
                if (nr >= rows || nc >= cols) continue;
                const int roll = rng.below(10);
                const Wall state = roll < 3 ? Wall::Present : roll < 4 ? Wall::Unknown : Wall::Open;
                if (rng.below(2) == 0) {
                    setBoth(c.maze, c.ref, {r, col}, d, state);
                } else {
                    setBoth(c.maze, c.ref, {nr, nc}, opposite(d), state);
                }
            }
        }
    }
    (void)kDirs;
    return c;
}

constexpr std::array<std::array<int, 2>, 6> kSizes = {{{4, 4}, {4, 8}, {8, 4}, {4, 12}, {12, 4}, {1, 6}}};

std::vector<Position> randomGoals(int rows, int cols, Rng& rng) {
    std::vector<Position> goals;
    const int count = 1 + rng.below(3);
    for (int i = 0; i < count; ++i) goals.push_back({rng.below(rows), rng.below(cols)});
    return goals;
}

void expectSameDistances(const FloodFill& flood, const Reference& ref, const std::vector<int>& want,
                         const char* what, int seed) {
    for (int r = 0; r < ref.rows; ++r) {
        for (int c = 0; c < ref.cols; ++c) {
            const int expected = want[static_cast<std::size_t>(r * ref.cols + c)];
            const int got = flood.getDistance({r, c});
            if (expected == kUnreachableRef) {
                ASSERT_EQ(got, FloodFill::kUnreachable) << what << " seed " << seed << " (" << r << "," << c << ")";
            } else {
                ASSERT_EQ(got, expected) << what << " seed " << seed << " (" << r << "," << c << ")";
            }
        }
    }
}

TEST(FloodFillProperty, MatchesAnIndependentBfsOnRandomMazesOfEverySize) {
    for (const auto& size : kSizes) {
        for (int seed = 1; seed <= 150; ++seed) {
            Rng rng(static_cast<std::uint32_t>(seed * 31 + size[0] * 7 + size[1]));
            Case c = randomCase(size[0], size[1], rng);
            const std::vector<Position> goals = randomGoals(size[0], size[1], rng);
            FloodFill flood(c.maze);
            flood.computeFloodFill(goals);
            expectSameDistances(flood, c.ref, c.ref.bfs(goals), "bfs", seed);
        }
    }
}

// Parede escrita de um lado vale dos dois, e a borda do labirinto é sempre parede, mesmo se alguém
// tentar abri-la.
TEST(FloodFillProperty, WallsAreSymmetricBetweenNeighboursAndTheBorderIsAlwaysAWall) {
    for (const auto& size : kSizes) {
        Rng rng(static_cast<std::uint32_t>(size[0] * 100 + size[1]));
        Case c = randomCase(size[0], size[1], rng);
        for (int r = 0; r < size[0]; ++r) {
            for (int col = 0; col < size[1]; ++col) {
                for (const Direction d : {Direction::North, Direction::East, Direction::South,
                                          Direction::West}) {
                    const Position p{r, col};
                    const Position q{r + rowDelta(d), col + colDelta(d)};
                    if (!c.maze.contains(q)) {
                        c.maze.setWall(p, d, Wall::Open);  // tentativa de abrir a borda
                        EXPECT_EQ(c.maze.getWall(p, d), Wall::Present);
                        continue;
                    }
                    EXPECT_EQ(c.maze.getWall(p, d), c.maze.getWall(q, opposite(d)));
                    EXPECT_EQ(c.maze.isBlocked(p, d), c.maze.isBlocked(q, opposite(d)));
                }
            }
        }
    }
}

// Objetivo inalcançável (cercado): nenhuma outra célula chega, e não há direção.
TEST(FloodFillProperty, AnEnclosedGoalIsUnreachableFromEverywhere) {
    for (const auto& size : kSizes) {
        if (size[0] * size[1] < 4) continue;
        Case c(size[0], size[1]);
        const Position goal{0, 0};
        setBoth(c.maze, c.ref, goal, Direction::East, Wall::Present);
        setBoth(c.maze, c.ref, goal, Direction::South, Wall::Present);
        FloodFill flood(c.maze);
        flood.computeFloodFill({goal});
        EXPECT_EQ(flood.getDistance(goal), 0);
        for (int r = 0; r < size[0]; ++r) {
            for (int col = 0; col < size[1]; ++col) {
                if (r == 0 && col == 0) continue;
                EXPECT_EQ(flood.getDistance({r, col}), FloodFill::kUnreachable);
                EXPECT_FALSE(flood.nextDirection({r, col}).has_value());
            }
        }
    }
}

// Seguir nextDirection de qualquer célula alcançável chega ao objetivo em EXATAMENTE `distância`
// passos, sem nunca atravessar uma parede (terminação e otimalidade), e o desempate é N, L, S, O: a
// primeira direção, nessa ordem, que cai a distância - 1.
TEST(FloodFillProperty, FollowingNextDirectionReachesTheGoalInExactlyTheDistance) {
    constexpr std::array<Direction, 4> kOrder = {Direction::North, Direction::East, Direction::South,
                                                 Direction::West};
    for (const auto& size : kSizes) {
        for (int seed = 1; seed <= 60; ++seed) {
            Rng rng(static_cast<std::uint32_t>(seed * 977 + size[0] + size[1] * 13));
            Case c = randomCase(size[0], size[1], rng);
            const std::vector<Position> goals = randomGoals(size[0], size[1], rng);
            FloodFill flood(c.maze);
            flood.computeFloodFill(goals);
            const std::vector<int> want = c.ref.bfs(goals);
            for (int r = 0; r < size[0]; ++r) {
                for (int col = 0; col < size[1]; ++col) {
                    const int d0 = want[static_cast<std::size_t>(r * size[1] + col)];
                    const std::optional<Direction> first = flood.nextDirection({r, col});
                    if (d0 <= 0) {
                        EXPECT_FALSE(first.has_value());  // no objetivo ou inalcançável
                        continue;
                    }
                    // Desempate: a primeira direção N, L, S, O livre cuja distância é d0 - 1.
                    std::optional<Direction> expected;
                    for (const Direction d : kOrder) {
                        if (c.ref.blocked(r, col, d)) continue;
                        const int nr = r + rowDelta(d);
                        const int nc = col + colDelta(d);
                        if (nr < 0 || nr >= size[0] || nc < 0 || nc >= size[1]) continue;
                        if (want[static_cast<std::size_t>(nr * size[1] + nc)] == d0 - 1) {
                            expected = d;
                            break;
                        }
                    }
                    ASSERT_TRUE(first.has_value());
                    ASSERT_EQ(*first, *expected) << "seed " << seed;
                    // Anda até o objetivo.
                    Position at{r, col};
                    int steps = 0;
                    while (flood.getDistance(at) != 0 && steps <= size[0] * size[1]) {
                        const std::optional<Direction> next = flood.nextDirection(at);
                        ASSERT_TRUE(next.has_value());
                        ASSERT_FALSE(c.maze.isBlocked(at, *next));
                        at = {at.row + rowDelta(*next), at.column + colDelta(*next)};
                        ++steps;
                    }
                    ASSERT_EQ(steps, d0) << "seed " << seed;
                }
            }
        }
    }
}

// Descobrir uma parede no meio da corrida: recalcular com o MESMO FloodFill dá o mesmo que um BFS
// novo, e não sobra valor velho.
TEST(FloodFillProperty, RecomputingAfterDiscoveringAWallMatchesAFreshBfs) {
    for (const auto& size : kSizes) {
        for (int seed = 1; seed <= 100; ++seed) {
            Rng rng(static_cast<std::uint32_t>(seed * 4099 + size[0] * 3 + size[1]));
            Case c = randomCase(size[0], size[1], rng);
            const std::vector<Position> goals = randomGoals(size[0], size[1], rng);
            FloodFill flood(c.maze);
            flood.computeFloodFill(goals);
            for (int found = 0; found < 3; ++found) {
                const Position p{rng.below(size[0]), rng.below(size[1])};
                const Direction d = static_cast<Direction>(rng.below(4));
                setBoth(c.maze, c.ref, p, d, rng.below(4) == 0 ? Wall::Open : Wall::Present);
                flood.computeFloodFill(goals);
                expectSameDistances(flood, c.ref, c.ref.bfs(goals), "reflood", seed);
            }
        }
    }
}

// Entradas fora do mapa: objetivo fora é ignorado e a posição fora vale inalcançável.
TEST(FloodFillProperty, OutOfRangeTargetsAndPositionsAreHandled) {
    Case c(4, 8);
    FloodFill flood(c.maze);
    flood.computeFloodFill({{-1, 0}, {4, 0}, {0, 8}, {3, 7}});
    EXPECT_EQ(flood.getDistance({3, 7}), 0);
    EXPECT_EQ(flood.getDistance({-1, 0}), FloodFill::kUnreachable);
    EXPECT_EQ(flood.getDistance({4, 0}), FloodFill::kUnreachable);
    EXPECT_FALSE(flood.nextDirection({9, 9}).has_value());
    flood.computeFloodFill({{-1, -1}});  // só objetivos inválidos: nada alcançável
    EXPECT_EQ(flood.getDistance({0, 0}), FloodFill::kUnreachable);
}

// O maior caminho possível cabe em uint8_t em todos os tamanhos: 12 x 4 = 48 células.
TEST(FloodFillProperty, ALongSerpentineFitsTheDistanceType) {
    Case c(4, 12);
    // Serpentina: paredes alternadas fecham todas as colunas, menos uma passagem por coluna.
    for (int col = 0; col < 11; ++col) {
        for (int r = 0; r < 4; ++r) {
            const bool gap = (col % 2 == 0) ? (r == 0) : (r == 3);
            if (!gap) setBoth(c.maze, c.ref, {r, col}, Direction::East, Wall::Present);
        }
    }
    FloodFill flood(c.maze);
    flood.computeFloodFill({{3, 11}});
    const std::vector<int> want = c.ref.bfs({{3, 11}});
    expectSameDistances(flood, c.ref, want, "serpentina", 0);
    EXPECT_GT(flood.getDistance({3, 0}), 12);
    EXPECT_LT(flood.getDistance({3, 0}), 255);
}

}  // namespace
}  // namespace micromouse::domain
