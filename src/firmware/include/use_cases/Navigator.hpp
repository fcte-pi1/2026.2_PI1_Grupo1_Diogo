#pragma once

#include <vector>

#include "domain/FloodFill.hpp"
#include "domain/Maze.hpp"
#include "ports/MotionPort.hpp"
#include "ports/SensorPort.hpp"

namespace micromouse::use_cases {

using domain::Direction;
using domain::FloodFill;
using domain::MazeMap;
using domain::Position;

using ports::IMotionPort;
using ports::ISensorPort;

class Navigator {
private:
    MazeMap& maze_;
    FloodFill flood_;
    ISensorPort& sensor_;
    IMotionPort& motion_;
    Position pos_;
    Direction heading_;
    std::vector<Position> goals_;

public:
    Navigator(MazeMap& maze, ISensorPort& sensor, IMotionPort& motion, Position start,
              Direction heading, std::vector<Position> goals);

    [[nodiscard]] Position getPosition() const noexcept;
    [[nodiscard]] Direction getHeading() const noexcept;
    [[nodiscard]] bool reachedGoal() const noexcept;
};

}  // namespace micromouse::use_cases
