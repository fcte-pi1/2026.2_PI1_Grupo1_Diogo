#include "use_cases/Navigator.hpp"

#include <algorithm>
#include <utility>

namespace micromouse::use_cases {

using domain::turnLeft;
using domain::turnRight;
using domain::Wall;

Navigator::Navigator(MazeMap& maze, ISensorPort& sensor, IMotionPort& motion, Position start,
                     Direction heading, std::vector<Position> goals)
    : maze_(maze),
      flood_(maze),
      sensor_(sensor),
      motion_(motion),
      position_(start),
      heading_(heading),
      goals_(goals) {}

Position Navigator::getPosition() const noexcept { return position_; }

Direction Navigator::getHeading() const noexcept { return heading_; }

bool Navigator::reachedGoal() const noexcept {
    return std::any_of(goals_.begin(), goals_.end(),
                       [this](const Position& g) { return g == position_; });
}

void Navigator::senseAndRecord() {
    const ports::WallsAhead wall = sensor_.sense();
    maze_.setWall(position_, heading_, wall.front ? Wall::Present : Wall::Open);
    maze_.setWall(position_, turnLeft(heading_), wall.left ? Wall::Present : Wall::Open);
    maze_.setWall(position_, turnRight(heading_), wall.right ? Wall::Present : Wall::Open);
}

void Navigator::step() { senseAndRecord(); }

}  // namespace micromouse::use_cases
