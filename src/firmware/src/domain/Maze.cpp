#include "domain/Maze.hpp"

#include <algorithm>
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

bool operator==(const Position& left, const Position& right) noexcept {
    return left.row == right.row && left.column == right.column;
}

int rowDelta(Direction direction) noexcept {
    switch (direction) {
        case Direction::North:
            return -1;
        case Direction::South:
            return 1;
        default:
            return 0;
    }
}

int colDelta(Direction direction) noexcept {
    switch (direction) {
        case Direction::East:
            return 1;
        case Direction::West:
            return -1;
        default:
            return 0;
    }
}

Direction opposite(Direction direction) noexcept {
    switch (direction) {
        case Direction::North:
            return Direction::South;
        case Direction::South:
            return Direction::North;
        case Direction::East:
            return Direction::West;
        case Direction::West:
            return Direction::East;
    }
    __builtin_unreachable();
}

Direction turnLeft(Direction direction) noexcept {
    switch (direction) {
        case Direction::North:
            return Direction::West;
        case Direction::West:
            return Direction::South;
        case Direction::South:
            return Direction::East;
        case Direction::East:
            return Direction::North;
    }
    __builtin_unreachable();
}

Direction turnRight(Direction direction) noexcept {
    switch (direction) {
        case Direction::North:
            return Direction::East;
        case Direction::East:
            return Direction::South;
        case Direction::South:
            return Direction::West;
        case Direction::West:
            return Direction::North;
    }
    __builtin_unreachable();
}

MazeMap::MazeMap(int rows, int columns)
    : rows_(requirePositive(rows, "rows")),
      columns_(requirePositive(columns, "columns")),
      horizontalEdges_(static_cast<std::size_t>((rows_ + 1) * columns_), Wall::Unknown),
      verticalEdges_(static_cast<std::size_t>(rows_ * (columns_ + 1)), Wall::Unknown) {}

int MazeMap::getRows() const noexcept { return rows_; }

int MazeMap::getColumns() const noexcept { return columns_; }

bool MazeMap::contains(const Position& position) const noexcept {
    return position.row >= 0 && position.row < rows_ && position.column >= 0 &&
           position.column < columns_;
}

std::size_t MazeMap::horizontalIndex(int row, int column) const noexcept {
    return static_cast<std::size_t>(row * columns_ + column);
}

std::size_t MazeMap::verticalIndex(int row, int column) const noexcept {
    return static_cast<std::size_t>(row * (columns_ + 1) + column);
}

const Wall& MazeMap::edge(const Position& position, Direction direction) const {
    switch (direction) {
        case Direction::North:
            return horizontalEdges_[horizontalIndex(position.row, position.column)];
        case Direction::South:
            return horizontalEdges_[horizontalIndex(position.row + 1, position.column)];
        case Direction::West:
            return verticalEdges_[verticalIndex(position.row, position.column)];
        case Direction::East:
            return verticalEdges_[verticalIndex(position.row, position.column + 1)];
    }
    __builtin_unreachable();
}

Wall& MazeMap::edge(const Position& position, Direction direction) {
    return const_cast<Wall&>(std::as_const(*this).edge(position, direction));
}

Wall MazeMap::getWall(const Position& position, Direction direction) const {
    return edge(position, direction);
}

void MazeMap::setWall(const Position& position, Direction direction, Wall state) {
    edge(position, direction) = state;
}

bool MazeMap::isBlocked(const Position& position, Direction direction) const {
    return getWall(position, direction) == Wall::Present;
}

void MazeMap::initKnownPerimeter() {
    std::fill(horizontalEdges_.begin(), horizontalEdges_.end(), Wall::Unknown);
    std::fill(verticalEdges_.begin(), verticalEdges_.end(), Wall::Unknown);
    for (int column = 0; column < columns_; ++column) {
        setWall({0, column}, Direction::North, Wall::Present);
        setWall({rows_ - 1, column}, Direction::South, Wall::Present);
    }

    for (int row = 0; row < rows_; ++row) {
        setWall({row, 0}, Direction::West, Wall::Present);
        setWall({row, columns_ - 1}, Direction::East, Wall::Present);
    }
}

}  // namespace micromouse::domain
