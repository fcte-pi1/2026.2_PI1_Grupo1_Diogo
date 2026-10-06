#include "domain/Maze.hpp"

namespace micromouse::domain {

MazeMap::MazeMap(int rows, int columns) : rows_(rows), columns_(columns) {}

int MazeMap::rows() const noexcept { return rows_; }

int MazeMap::columns() const noexcept { return columns_; }

}  // namespace micromouse::domain
