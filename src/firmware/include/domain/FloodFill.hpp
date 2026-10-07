#pragma once

#include <cstdint>
#include <vector>

#include "domain/Maze.hpp"

namespace micromouse::domain {
class FloodFill {
private:
    const MazeMap& maze_;
    std::vector<std::uint8_t> distances_;

    [[nodiscard]] std::size_t index(const Position& position) const noexcept;

public:
    static constexpr std::uint8_t kUnreachable = 255;
    explicit FloodFill(const MazeMap& maze);
    void computeFloodFill(const std::vector<Position>& targets);
    [[nodiscard]] std::uint8_t getDistance(const Position& position) const;
};
}  // namespace micromouse::domain
