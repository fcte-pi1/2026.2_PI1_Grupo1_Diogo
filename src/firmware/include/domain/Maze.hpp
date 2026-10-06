#pragma once

#include <cstddef>
#include <vector>

namespace micromouse::domain {

enum class Direction { North, East, South, West };
enum class Wall { Unknown, Open, Present };

struct Position {
    int row{};
    int col{};
};

class MazeMap {
private:
    int rows_;
    int columns_;
    std::vector<Wall> horizontalEdges_;  // (rows+1) x cols
    std::vector<Wall> verticalEdges_;    // rows x (cols+1)

    [[nodiscard]] std::size_t horizontalIndex(int row, int col) const noexcept;
    [[nodiscard]] std::size_t verticalIndex(int row, int col) const noexcept;

public:
    MazeMap(int rows, int columns);

    [[nodiscard]] int getRows() const noexcept;
    [[nodiscard]] int getColumns() const noexcept;
    [[nodiscard]] Wall getWall(const Position& pos, Direction dir) const;
    void setWall(const Position& pos, Direction dir, Wall state);
};

}  // namespace micromouse::domain
