#pragma once

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

public:
    MazeMap(int rows, int columns);

    [[nodiscard]] int getRows() const noexcept;
    [[nodiscard]] int getColumns() const noexcept;
    [[nodiscard]] Wall getWall(const Position& pos, Direction dir) const;
};

}  // namespace micromouse::domain
