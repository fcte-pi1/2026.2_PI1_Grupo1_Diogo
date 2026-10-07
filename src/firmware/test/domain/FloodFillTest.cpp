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

Objetivo em {0, 3}. Números = distancia do flood fill (Manhattan, sem paredes):

           col 0   col 1   col 2   col 3
         +-------+-------+-------+-------+
  row 0  |   3   |   2   |   1   |   0   |  <- topo (objetivo em col 3)
         +-------+-------+-------+-------+
  row 1  |   4   |   3   |   2   |   1   |
         +-------+-------+-------+-------+
  row 2  |   5   |   4   |   3   |   2   |
         +-------+-------+-------+-------+
  row 3  |   6   |   5   |   4   |   3   |  <- base
         +-------+-------+-------+-------+
           esquerda                direita
*/

namespace micromouse::domain {
namespace {

TEST(FloodFill, ObjetivoTemDistanciaZero) {
    MazeMap small(4, 4);
    FloodFill floodFill(small);
    floodFill.computeFloodFill({{0, 3}});
    EXPECT_EQ(floodFill.getDistance({0, 3}), 0);
}

TEST(FloodFill, _) {}

}  // namespace
}  // namespace micromouse::domain
