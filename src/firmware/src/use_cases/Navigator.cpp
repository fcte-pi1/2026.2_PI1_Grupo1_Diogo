#include "use_cases/Navigator.hpp"

#include <algorithm>
#include <cstdint>
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

int Navigator::outsideOpenings() const noexcept { return outsideOpenings_; }

const StepReport& Navigator::lastStep() const noexcept { return report_; }

const char* stepActionName(StepAction action) noexcept {
    switch (action) {
        case StepAction::None: return "nenhum";
        case StepAction::Forward: return "frente";
        case StepAction::TurnLeft: return "esquerda";
        case StepAction::TurnRight: return "direita";
        case StepAction::Reverse: return "re";
        case StepAction::Wait: return "espera";
        case StepAction::AssumedWall: return "assumiu parede";
        case StepAction::Arrived: return "chegou";
        case StepAction::Stuck: return "sem caminho";
    }
    return "?";
}

bool Navigator::confirmArrival() {
    const int before = outsideOpenings_;
    senseAndRecord();
    if (outsideOpenings_ == before) return true;
    // Uma leitura ruim isolada não derruba a chegada: só vale se a segunda repetir.
    const int afterFirst = outsideOpenings_;
    senseAndRecord();
    return outsideOpenings_ == afterFirst;
}

void Navigator::senseAndRecord() {
    const ports::WallsAhead wall = sensor_.sense();
    lastSense_ = wall;
    // Um lado em falha (NACK, medida atrasada) não grava nada: uma parede falsa ficaria no mapa
    // até o fim da corrida e podia fechar o único caminho (revisão do #438).
    // Um lado que dá para fora do mapa e o sensor leu aberto: o setWall mantém a borda, e a leitura
    // fica contada (ver outsideOpenings()).
    auto record = [this](Direction side, bool present, bool unknown) {
        if (unknown) return;
        const Position beyond{position_.row + rowDelta(side), position_.column + colDelta(side)};
        if (!present && !maze_.contains(beyond)) {
            ++outsideOpenings_;
        }
        maze_.setWall(position_, side, present ? Wall::Present : Wall::Open);
    };
    record(heading_, wall.front, wall.frontUnknown);
    record(turnLeft(heading_), wall.left, wall.leftUnknown);
    record(turnRight(heading_), wall.right, wall.rightUnknown);
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

// Só para a frente ou para os lados. Para trás, o step() anda de ré (reverseCell) e não chega aqui.
void Navigator::applyTurnTo(Direction target) {
    if (target == heading_) return;
    if (target == turnRight(heading_)) {
        motion_.turnRight();
    } else if (target == turnLeft(heading_)) {
        motion_.turnLeft();
    } else {
        return;
    }
    heading_ = target;
}

std::optional<Direction> Navigator::nextDirectionAvoiding(Direction closed) {
    const Wall before = maze_.getWall(position_, closed);
    maze_.setWall(position_, closed, Wall::Present);
    flood_.computeFloodFill(goals_);
    const std::optional<Direction> other = flood_.nextDirection(position_);
    maze_.setWall(position_, closed, before);
    flood_.computeFloodFill(goals_);
    return other;
}

void Navigator::step() {
    // A primeira leitura da corrida não vale: desde o boot os ToF mediam sem ninguém ler, e a
    // primeira medida depois disso vinha com lixo (07/11: 0, 6, 22 ou 9999 na primeira linha do
    // `tof`; 04/11: o frontal "via" parede na largada). Custa uma leitura a mais, só na largada.
    if (!warmedUp_) {
        (void)sensor_.sense();
        warmedUp_ = true;
    }
    report_ = {};
    report_.cell = position_;
    report_.heading = heading_;
    senseAndRecord();
    report_.sense = lastSense_;
    flood_.computeFloodFill(goals_);
    // Preenche o resto do relatório em qualquer saída do passo.
    struct Finish {
        Navigator& nav;
        ~Finish() {
            const std::uint8_t d = nav.flood_.getDistance(nav.report_.cell);
            nav.report_.distance = d == FloodFill::kUnreachable ? -1 : static_cast<int>(d);
            nav.report_.outsideOpenings = nav.outsideOpenings_;
        }
    } finish{*this};

    if (reachedGoal()) {
        report_.action = StepAction::Arrived;
        return;
    }

    std::optional<Direction> nextDir = flood_.nextDirection(position_);

    if (!nextDir) {
        report_.forgotMap = true;
        // Uma parede lida errada (em 04/11, o frontal "via" parede na largada) pode fechar todos os
        // caminhos. Antes, o robô ficava parado sentindo a mesma célula até o limite de passos.
        // Agora esquece as paredes lidas (fica só o perímetro), sente de novo e recalcula; se nem
        // assim houver caminho, desiste.
        maze_.initKnownPerimeter();
        senseAndRecord();
        // O lado por onde o robô entrou nesta célula continua aberto: ele acabou de passar por ali.
        if (entrySide_) {
            maze_.setWall(position_, *entrySide_, Wall::Open);
        }
        flood_.computeFloodFill(goals_);
        nextDir = flood_.nextDirection(position_);
        // Sem caminho, ou o único caminho é um lado que já se mostrou ilegível nesta célula: desiste.
        if (!nextDir || (assumedWallHere_ && wasUnseen(*nextDir))) {
            stuck_ = true;
            report_.action = StepAction::Stuck;
            return;
        }
    }

    // Para trás não há sensor. Se o mapa não sabe que o lado de trás está aberto (o robô entrou
    // nesta célula por um lado, e não por trás), prefere outro caminho que os sensores enxerguem:
    // de ré, uma parede ali só seria descoberta batendo. Se não houver outro, vai de ré mesmo, e
    // uma parede ali leva ao Erro pela falha da reta ("nao chegou ao fim da celula").
    const Direction back = opposite(heading_);
    if (*nextDir == back && maze_.getWall(position_, back) != Wall::Open) {
        if (const std::optional<Direction> other = nextDirectionAvoiding(back)) {
            nextDir = other;
            report_.avoidedBlindReverse = true;
        }
    }

    // Não avança por um lado que o sensor não viu: espera a próxima leitura. Sensor quebrado leva
    // ao Erro pelo SensorHealthMonitor do laço da corrida. Uma medida incerta que persiste (o
    // sensor funciona, mas não lê aquele lado) vira parede depois de kMaxBlindWaits leituras: o
    // robô procura outro caminho, e o "esquecer" acima a reabre se ela fechar todos.
    if (wasUnseen(*nextDir)) {
        report_.action = StepAction::Wait;
        if (++blindWaits_ >= kMaxBlindWaits) {
            maze_.setWall(position_, *nextDir, Wall::Present);
            blindWaits_ = 0;
            assumedWallHere_ = true;
            report_.action = StepAction::AssumedWall;
        }
        return;
    }
    blindWaits_ = 0;
    assumedWallHere_ = false;

    if (*nextDir == back) {
        // Beco (ou o caminho fechou): sai de RÉ, sem girar. A meia-volta no lugar não cabe no
        // corredor: no relato de 10/11 o robô travou girando no beco A1, e em 09/11 o giro de 90
        // graus no lugar já travava a 68-75 graus em A4. Na célula de trás, ele continua virado para o beco,
        // os três sensores valem, e a curva seguinte (se houver) é a curva em arco de sempre.
        report_.action = StepAction::Reverse;
        motion_.reverseCell();
        position_ = {position_.row + rowDelta(back), position_.column + colDelta(back)};
        entrySide_ = heading_;
        return;
    }

    report_.action = *nextDir == heading_              ? StepAction::Forward
                     : *nextDir == turnLeft(heading_) ? StepAction::TurnLeft
                                                      : StepAction::TurnRight;
    applyTurnTo(*nextDir);
    motion_.advanceCell();
    position_ = {position_.row + rowDelta(heading_), position_.column + colDelta(heading_)};
    entrySide_ = opposite(heading_);
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
