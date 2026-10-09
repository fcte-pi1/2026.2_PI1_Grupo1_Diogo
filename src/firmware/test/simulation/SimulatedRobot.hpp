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
    int advances_{0};
    int left_{0};
    int right_{0};
    int around_{0};

public:
    SimulatedRobot(const MazeMap& truth, Position start, Direction heading)
        : truth_(truth), position_(start), heading_(heading) {};

    [[nodiscard]] ports::WallsAhead sense() const override {
        return {truth_.isBlocked(position_, heading_),
                truth_.isBlocked(position_, domain::turnLeft(heading_)),
                truth_.isBlocked(position_, domain::turnRight(heading_))};
    }

    void advanceCell() override {
        position_ = {position_.row + domain::rowDelta(heading_),
                     position_.column + domain::colDelta(heading_)};
        ++advances_;
    }

    void turnLeft() override {
        heading_ = domain::turnLeft(heading_);
        ++left_;
    }

    void turnRight() override {
        heading_ = domain::turnRight(heading_);
        ++right_;
    }

    void turnAround() override {
        heading_ = domain::opposite(heading_);
        ++around_;
    }

    [[nodiscard]] Position position() const { return position_; }
    [[nodiscard]] Direction heading() const { return heading_; }
    [[nodiscard]] int advances() const { return advances_; }
    [[nodiscard]] int turns() const { return left_ + right_ + around_; }
    [[nodiscard]] int rights() const { return right_; }
    [[nodiscard]] int lefts() const { return left_; }
};

}  // namespace micromouse::test
