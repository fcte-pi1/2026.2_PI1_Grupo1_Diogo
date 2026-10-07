#include <gtest/gtest.h>

#include "domain/FloodFill.hpp"
#include "domain/Maze.hpp"

/*
Labirinto 4x4 usado nestes testes.

Convenção (ver rowDelta/colDelta em Maze.cpp):
  - North = row - 1  -> row cresce para baixo (row 0 = topo)
  - East  = col + 1  -> col cresce para a direita (col 0 = esquerda)
  - South = row + 1  -> row cresce para cima (row 0 = topo)
  - West  = col - 1  -> col cresce para a esquerda (col 0 = esquerda)
Logo: {0, 3} = canto superior direito; {3, 0} = canto inferior esquerdo.

           col 0   col 1   col 2   col 3
         +-------+-------+-------+-------+
  row 0  |  0,0  |  1,0  |  2,0  |  3,0  |
         +-------+-------+-------+-------+
  row 1  |  0,1  |  1,1  |  2,1  |  3,1  |
         +-------+-------+-------+-------+
  row 2  |  0,2  |  1,2  |  2,2  |  3,2  |
         +-------+-------+-------+-------+
  row 3  |  0,3  |  1,3  |  2,3  |  3,3  |
         +-------+-------+-------+-------+

           col 0   col 1   col 2   col 3
         +-------+-------+-------+-------+
  row 0  |   0   |   1   |   2   |   3   |
         +-------+-------+-------+-------+
  row 1  |   1   |   2   |   3   |   4   |
         +-------+-------+-------+-------+
  row 2  |   2   |   3   |   4   |   5   |
         +-------+-------+-------+-------+
  row 3  |   3   |   4   |   5   |   6   |
         +-------+-------+-------+-------+
*/

namespace micromouse::domain {
namespace {

TEST(FloodFill, ObjetivoTemDistanciaZero) {
    MazeMap small(4, 4);
    FloodFill floodFill(small);
    floodFill.computeFloodFill({{0, 0}});
    EXPECT_EQ(floodFill.getDistance({0, 0}), 0);
}

TEST(FloodFill, PropagaUmPassoParaVizinha) {
    MazeMap small(4, 4);
    FloodFill floodFill(small);
    floodFill.computeFloodFill({{0, 0}});
    EXPECT_EQ(floodFill.getDistance({0, 1}), 1);
    EXPECT_EQ(floodFill.getDistance({1, 0}), 1);
}

TEST(FloodFill, LabirintoAbertoDaDistanciaManhattan) {
    MazeMap small(4, 4);
    FloodFill floodFill(small);
    floodFill.computeFloodFill({{0, 0}});
    EXPECT_EQ(floodFill.getDistance({1, 3}), 4);  // 1 + 3 = 4
    EXPECT_EQ(floodFill.getDistance({2, 3}), 5);  // 2 + 3 = 5
    EXPECT_EQ(floodFill.getDistance({3, 3}), 6);  // 3 + 3 = 6
}

/*
Labirinto 3x3 deste teste. Objetivo em {0,0}; a célula {0,2} fica isolada.
Paredes: '-' e '|' = parede (Present); espaço entre células = caminho aberto.
A borda externa e sempre parede. So duas arestas internas sao fechadas:
  - {0,2} Oeste (entre {0,1} e {0,2})  -> o '|' na linha r0
  - {0,2} Sul   (entre {0,2} e {1,2})  -> o '---' abaixo de {0,2}

         c0      c1      c2
       +-------+-------+-------+
  r0   |  0,0     0,1  |  0,2  |   <- {0,2} cercada: Oeste e Sul fechados,
       +       +       +-------+      Norte e Leste sao borda -> inalcançável
  r1   |  1,0     1,1    1,2   |
       +       +       +       +
  r2   |  2,0     2,1    2,2   |
       +-------+-------+-------+

Caminho ate {0,1}: {0,0} -> {0,1} (dist 1). {0,2} nao tem vizinho acessível.
*/
TEST(FloodFill, ParedeDesviaOCaminho) {
    MazeMap maze(3, 3);
    maze.setWall({0, 2}, Direction::West, Wall::Present);
    maze.setWall({0, 2}, Direction::South, Wall::Present);
    FloodFill floodFill(maze);
    floodFill.computeFloodFill({{0, 0}});
    EXPECT_EQ(floodFill.getDistance({0, 1}), 1);
    EXPECT_EQ(floodFill.getDistance({0, 2}), FloodFill::kUnreachable);  // bloqueado
}

TEST(FloodFill, _) {}

}  // namespace
}  // namespace micromouse::domain
