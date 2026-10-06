#include "domain/Maze.hpp"

namespace micromouse::domain {

MazeMap::MazeMap(int rows, int columns) : rows_(rows), columns_(columns) {}

int MazeMap::getRows() const noexcept { return rows_; }

int MazeMap::getColumns() const noexcept { return columns_; }

Wall MazeMap::getWall(const Position& pos, Direction dir) const { return Wall::Unknown; }

}  // namespace micromouse::domain
