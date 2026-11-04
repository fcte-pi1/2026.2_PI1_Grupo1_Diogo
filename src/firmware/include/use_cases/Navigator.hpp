#pragma once

#include <vector>

#include "domain/FloodFill.hpp"
#include "domain/Maze.hpp"
#include "ports/MotionPort.hpp"
#include "ports/SensorPort.hpp"

namespace micromouse::use_cases {

using domain::Direction;
using domain::FloodFill;
using domain::MazeMap;
using domain::Position;

using ports::IMotionPort;
using ports::ISensorPort;

class Navigator {
private:
    MazeMap& maze_;
    FloodFill flood_;
    ISensorPort& sensor_;
    IMotionPort& motion_;
    Position position_;
    Direction heading_;
    std::vector<Position> goals_;
    bool stuck_{false};
    void senseAndRecord();
    void applyTurnTo(Direction target);

public:
    Navigator(MazeMap& maze, ISensorPort& sensor, IMotionPort& motion, Position start,
              Direction heading, std::vector<Position> goals);

    [[nodiscard]] Position getPosition() const noexcept;
    [[nodiscard]] Direction getHeading() const noexcept;
    [[nodiscard]] bool reachedGoal() const noexcept;
    // Sem caminho até o objetivo, mesmo depois de esquecer as paredes lidas e sentir de novo: o
    // mapa não fecha com o que os sensores leem. O robô não se mexe mais; a corrida vai ao Erro.
    [[nodiscard]] bool stuck() const noexcept;
    void step();
    bool run(int maxSteps);
};

}  // namespace micromouse::use_cases
