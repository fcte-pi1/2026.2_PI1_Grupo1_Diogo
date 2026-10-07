#include "domain/FloodFill.hpp"

#include <array>
#include <queue>

namespace micromouse::domain {

namespace {

constexpr std::array<Direction, 4> kScanOrder = {
    Direction::North,  //
    Direction::East,   //
    Direction::South,  //
    Direction::West    //
};

Position neighbor(const Position& position, Direction direction) {
    return {position.row + rowDelta(direction), position.column + colDelta(direction)};
}

}  // namespace

FloodFill::FloodFill(const MazeMap& maze)
    : maze_(maze),
      distances_(static_cast<std::size_t>(maze.getRows() * maze.getColumns()), kUnreachable) {}

std::size_t FloodFill::index(const Position& position) const noexcept {
    return static_cast<std::size_t>(position.row * maze_.getColumns() + position.column);
}

void FloodFill::computeFloodFill(const std::vector<Position>& targets) {
    std::queue<Position> frontier;
    for (const Position& target : targets) {
        if (!maze_.contains(target))  //
            continue;
        distances_[index(target)] = 0;
        frontier.push(target);
    }

    while (!frontier.empty()) {
        const Position current = frontier.front();
        frontier.pop();
        const std::uint8_t next = static_cast<std::uint8_t>(distances_[index(current)] + 1);

        for (Direction direction : kScanOrder) {
            if (maze_.isBlocked(current, direction))  //
                continue;

            const Position adj = neighbor(current, direction);

            if (!maze_.contains(adj))  //
                continue;
            if (distances_[index(adj)] != kUnreachable)  //
                continue;

            distances_[index(adj)] = next;
            frontier.push(adj);
        }
    }
}

std::uint8_t FloodFill::getDistance(const Position& position) const {
    return distances_[index(position)];
}

}  // namespace micromouse::domain
