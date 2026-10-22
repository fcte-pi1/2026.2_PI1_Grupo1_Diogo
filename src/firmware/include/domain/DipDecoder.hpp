#pragma once

#include "domain/Maze.hpp"

namespace micromouse::domain {

enum class MazeType {
    Small4x4,   //
    Medium8x4,  //
    Large12x4   //
};

struct MazeSetup {
    MazeType type{};
    int rows{};
    int columns{};
    Position start{};
    Position goal{};
};

class DipDecoder {
public:
    [[nodiscard]] MazeSetup decode(bool dip1, bool dip2, bool dip3) const;
};

}  // namespace micromouse::domain
