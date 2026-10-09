#pragma once

#include "domain/Maze.hpp"
#include "ports/MotionPort.hpp"
#include "ports/SensorPort.hpp"

namespace micromouse::test {

using domain::Direction;
using domain::MazeMap;
using domain::Position;

class SimulatedRobot final : public ports::ISensorPort, public ports::IMotionPort {
private:
public:
};

}  // namespace micromouse::test
