#include "use_cases/Navigator.hpp"

#include <algorithm>
#include <utility>

namespace micromouse::use_cases {

Navigator::Navigator(MazeMap& maze, ISensorPort& sensor, IMotionPort& motion, Position start,
                     Direction heading, std::vector<Position> goals)
    : maze_(maze),
      flood_(maze),
      sensor_(sensor),
      motion_(motion),
      pos_(start),
      heading_(heading),
      goals_(goals) {}

Position Navigator::getPosition() const noexcept { return pos_; }

Direction Navigator::getHeading() const noexcept { return heading_; }

bool Navigator::reachedGoal() const noexcept {
    return std::any_of(goals_.begin(), goals_.end(),
                       [this](const Position& g) { return g == pos_; });
}

}  // namespace micromouse::use_cases
