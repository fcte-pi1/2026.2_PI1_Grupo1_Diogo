#include "domain/FloodFill.hpp"

namespace micromouse::domain {
FloodFill::FloodFill(const MazeMap& maze)
    : maze_(maze),
      distances_(static_cast<std::size_t>(maze.getRows() * maze.getColumns()), kUnreachable) {}

std::size_t FloodFill::index(const Position& position) const noexcept {
    return static_cast<std::size_t>(position.row * maze_.getColumns() + position.column);
}

void FloodFill::computeFloodFill(const std::vector<Position>& targets) {
    for (const Position& target : targets) {
        distances_[index(target)] = 0;
    }
}

std::uint8_t FloodFill::getDistance(const Position& position) const {
    return distances_[index(position)];
}

}  // namespace micromouse::domain
