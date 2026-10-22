#pragma once

#include <cstddef>
#include <vector>

namespace micromouse::domain {

enum class Direction {
    North,  //
    East,   //
    South,  //
    West    //
};

enum class Wall {
    Unknown,  //
    Open,     //
    Present   //
};

struct Position {
    int row{};
    int column{};
};

bool operator==(const Position& left, const Position& right) noexcept;

int rowDelta(Direction direction) noexcept;
int colDelta(Direction direction) noexcept;

Direction opposite(Direction dir) noexcept;   // direção oposta (180 graus)
Direction turnLeft(Direction dir) noexcept;   // giro anti-horário (90 graus)
Direction turnRight(Direction dir) noexcept;  // giro horário (90 graus)

class MazeMap {
private:
    int rows_;
    int columns_;
    std::vector<Wall> horizontalEdges_;  // (rows+1) x cols
    std::vector<Wall> verticalEdges_;    // rows x (cols+1)

    [[nodiscard]] std::size_t horizontalIndex(int row, int column) const noexcept;
    [[nodiscard]] std::size_t verticalIndex(int row, int column) const noexcept;
    [[nodiscard]] const Wall& edge(const Position& position, Direction direction) const;
    [[nodiscard]] Wall& edge(const Position& position, Direction direction);

public:
    MazeMap(int rows, int columns);

    [[nodiscard]] int getRows() const noexcept;
    [[nodiscard]] int getColumns() const noexcept;
    [[nodiscard]] bool contains(const Position& position) const noexcept;

    [[nodiscard]] Wall getWall(const Position& position, Direction direction) const;
    void setWall(const Position& position, Direction direction, Wall state);
    [[nodiscard]] bool isBlocked(const Position& position, Direction direction) const;

    void initKnownPerimeter();
};

}  // namespace micromouse::domain
