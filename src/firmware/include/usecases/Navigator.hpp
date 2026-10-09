#pragma once

#include "domain/FloodFill.hpp"
#include "domain/Maze.hpp"
#include "ports/MotionPort.hpp"
#include "ports/SensorPort.hpp"

namespace micromouse::usecases {

using domain::Direction;
using domain::FloodFill;
using domain::MazeMap;
using domain::Position;

using ports::IMotionPort;
using ports::ISensorPort;

class Navigator {
private:
public:
};

}  // namespace micromouse::usecases
