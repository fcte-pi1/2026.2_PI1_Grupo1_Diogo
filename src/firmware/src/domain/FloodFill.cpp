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
    std::fill(distances_.begin(), distances_.end(), kUnreachable);
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
    if (!maze_.contains(position))  //
        return kUnreachable;

    return distances_[index(position)];
}

std::optional<Direction> FloodFill::nextDirection(const Position& position) const {
    const std::uint8_t currentDistance = getDistance(position);

    if (currentDistance == 0 || currentDistance == kUnreachable)  //
        return std::nullopt;

    std::optional<Direction> bestDirection;
    std::uint8_t bestDistance = currentDistance;  // Só avança para distância ESTRITAMENTE menor

    for (Direction direction : kScanOrder) {
        if (maze_.isBlocked(position, direction))  //
            continue;

        const Position adj = neighbor(position, direction);

        if (!maze_.contains(adj))  //
            continue;

        const std::uint8_t adjDistance = getDistance(adj);

        if (adjDistance < bestDistance) {  // '<' (não '<='): o primeiro na ordem N,E,S,W vence
            bestDirection = direction;
            bestDistance = adjDistance;
        }
    }
    return bestDirection;
};

}  // namespace micromouse::domain
