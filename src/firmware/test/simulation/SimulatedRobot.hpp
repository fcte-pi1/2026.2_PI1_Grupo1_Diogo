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
    const MazeMap& truth_;
    Position position_;
    Direction heading_;

public:
    SimulatedRobot(const MazeMap& truth, Position start, Direction heading)
        : truth_(truth), position_(start), heading_(heading) {};
};

}  // namespace micromouse::test
