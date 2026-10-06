#include "domain/Maze.hpp"

#include <stdexcept>
#include <string>
#include <utility>

namespace micromouse::domain {

namespace {

int requirePositive(int value, const char* what) {
    if (value <= 0) {
        throw std::invalid_argument(std::string("MazeMap: ") + what + " deve ser positivo");
    }
    return value;
}

}  // namespace

MazeMap::MazeMap(int rows, int columns)
    : rows_(requirePositive(rows, "rows")),
      columns_(requirePositive(columns, "columns")),
      horizontalEdges_(static_cast<std::size_t>((rows_ + 1) * columns_), Wall::Unknown),
      verticalEdges_(static_cast<std::size_t>(rows_ * (columns_ + 1)), Wall::Unknown) {}

int MazeMap::getRows() const noexcept { return rows_; }

int MazeMap::getColumns() const noexcept { return columns_; }

std::size_t MazeMap::horizontalIndex(int row, int col) const noexcept {
    return static_cast<std::size_t>(row * columns_ + col);
}

std::size_t MazeMap::verticalIndex(int row, int col) const noexcept {
    return static_cast<std::size_t>(row * (columns_ + 1) + col);
}

const Wall& MazeMap::edge(const Position& pos, Direction dir) const {
    switch (dir) {
        case Direction::North:
            return horizontalEdges_[horizontalIndex(pos.row, pos.col)];
        case Direction::South:
            return horizontalEdges_[horizontalIndex(pos.row + 1, pos.col)];
        case Direction::West:
            return verticalEdges_[verticalIndex(pos.row, pos.col)];
        default:
            return verticalEdges_[verticalIndex(pos.row, pos.col + 1)];
    }
}

Wall& MazeMap::edge(const Position& pos, Direction dir) {
    return const_cast<Wall&>(std::as_const(*this).edge(pos, dir));
}

Wall MazeMap::getWall(const Position& pos, Direction dir) const { return edge(pos, dir); }

void MazeMap::setWall(const Position& pos, Direction dir, Wall state) { edge(pos, dir) = state; }

}  // namespace micromouse::domain
