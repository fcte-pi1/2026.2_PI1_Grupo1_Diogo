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
public:
    // Leituras seguidas, na mesma célula, de um lado desconhecido pelo qual o caminho passa, antes de
    // assumir parede nele e procurar outro caminho.
    static constexpr int kMaxBlindWaits = 3;

private:
    MazeMap& maze_;
    FloodFill flood_;
    ISensorPort& sensor_;
    IMotionPort& motion_;
    Position position_;
    Direction heading_;
    std::vector<Position> goals_;
    bool stuck_{false};
    ports::WallsAhead lastSense_{};  // última leitura, com os lados que falharam
    int blindWaits_{0};               // leituras seguidas esperando um lado desconhecido
    bool assumedWallHere_{false};     // já assumiu parede num lado desconhecido nesta célula
    bool warmedUp_{false};            // a primeira leitura da corrida já foi descartada
    void senseAndRecord();
    void applyTurnTo(Direction target);
    [[nodiscard]] bool wasUnseen(Direction direction) const;

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
