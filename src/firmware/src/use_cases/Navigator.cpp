#include "use_cases/Navigator.hpp"

#include <algorithm>
#include <utility>

namespace micromouse::use_cases {

using domain::colDelta;
using domain::opposite;
using domain::rowDelta;
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

bool Navigator::stuck() const noexcept { return stuck_; }

void Navigator::senseAndRecord() {
    const ports::WallsAhead wall = sensor_.sense();
    lastSense_ = wall;
    // Um lado em falha (NACK, medida atrasada) não grava nada: uma parede falsa ficaria no mapa
    // até o fim da corrida e podia fechar o único caminho (revisão do #438).
    if (!wall.frontUnknown) {
        maze_.setWall(position_, heading_, wall.front ? Wall::Present : Wall::Open);
    }
    if (!wall.leftUnknown) {
        maze_.setWall(position_, turnLeft(heading_), wall.left ? Wall::Present : Wall::Open);
    }
    if (!wall.rightUnknown) {
        maze_.setWall(position_, turnRight(heading_), wall.right ? Wall::Present : Wall::Open);
    }
}

// O lado "direction" da célula atual não foi visto agora e o mapa não sabe nada sobre ele.
bool Navigator::wasUnseen(Direction direction) const {
    bool unseen = false;
    if (direction == heading_) {
        unseen = lastSense_.frontUnknown;
    } else if (direction == turnLeft(heading_)) {
        unseen = lastSense_.leftUnknown;
    } else if (direction == turnRight(heading_)) {
        unseen = lastSense_.rightUnknown;
    }
    return unseen && maze_.getWall(position_, direction) == Wall::Unknown;
}

void Navigator::applyTurnTo(Direction target) {
    if (target == heading_) return;
    if (target == turnRight(heading_)) {
        motion_.turnRight();
    } else if (target == turnLeft(heading_)) {
        motion_.turnLeft();
    } else {
        motion_.turnAround();
    }
    heading_ = target;
}

void Navigator::step() {
    senseAndRecord();
    flood_.computeFloodFill(goals_);

    if (reachedGoal()) return;

    std::optional<Direction> nextDir = flood_.nextDirection(position_);

    if (!nextDir) {
        // Uma parede lida errada (em 04/11, o frontal "via" parede na largada) pode fechar todos os
        // caminhos. Antes, o robô ficava parado sentindo a mesma célula até o limite de passos.
        // Agora esquece as paredes lidas (fica só o perímetro), sente de novo e recalcula; se nem
        // assim houver caminho, desiste.
        maze_.initKnownPerimeter();
        senseAndRecord();
        flood_.computeFloodFill(goals_);
        nextDir = flood_.nextDirection(position_);
        // Sem caminho, ou o único caminho é um lado que já se mostrou ilegível nesta célula: desiste.
        if (!nextDir || (assumedWallHere_ && wasUnseen(*nextDir))) {
            stuck_ = true;
            return;
        }
    }

    // Não avança por um lado que o sensor não viu: espera a próxima leitura. Sensor quebrado leva
    // ao Erro pelo SensorHealthMonitor do laço da corrida. Uma medida incerta que persiste (o
    // sensor funciona, mas não lê aquele lado) vira parede depois de kMaxBlindWaits leituras: o
    // robô procura outro caminho, e o "esquecer" acima a reabre se ela fechar todos.
    if (wasUnseen(*nextDir)) {
        if (++blindWaits_ >= kMaxBlindWaits) {
            maze_.setWall(position_, *nextDir, Wall::Present);
            blindWaits_ = 0;
            assumedWallHere_ = true;
        }
        return;
    }
    blindWaits_ = 0;
    assumedWallHere_ = false;

    applyTurnTo(*nextDir);
    motion_.advanceCell();
    position_ = {position_.row + rowDelta(heading_), position_.column + colDelta(heading_)};
}

bool Navigator::run(int maxSteps) {
    for (int i = 0; i < maxSteps; ++i) {
        if (reachedGoal()) return true;
        if (stuck_) return false;
        step();
    }
    return reachedGoal();
}

}  // namespace micromouse::use_cases
