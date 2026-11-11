#pragma once

#include <optional>
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

// O que o último step() fez, para o log da corrida (uma linha "nav" por passo): sem isto, uma
// corrida que falha na pista só deixava o motivo final, e não as decisões que levaram até ele.
enum class StepAction {
    None,         // ainda não houve passo
    Forward,      // andou uma célula para a frente
    TurnLeft,     // virou à esquerda e andou
    TurnRight,    // virou à direita e andou
    Reverse,      // andou uma célula de ré
    Wait,         // o lado escolhido não foi visto: espera outra leitura
    AssumedWall,  // esperou demais: assumiu parede no lado escolhido
    Arrived,      // já estava no objetivo
    Stuck         // sem caminho, mesmo esquecendo o mapa
};

struct StepReport {
    Position cell{};             // célula em que o passo começou (a que foi sentida)
    Direction heading{};         // para onde o robô estava virado ao sentir
    ports::WallsAhead sense{};   // o que os sensores disseram
    StepAction action{StepAction::None};
    int distance{-1};            // distância do flood fill da célula ao objetivo (-1 = sem caminho)
    bool forgotMap{false};       // o mapa fechou e foi esquecido neste passo
    bool avoidedBlindReverse{false};  // trocou uma ré às cegas por outro caminho
    int outsideOpenings{0};      // total de leituras "aberto" para fora do mapa até aqui
};

[[nodiscard]] const char* stepActionName(StepAction action) noexcept;

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
    // Lado da célula atual por onde o robô acabou de entrar (atrás, se veio de frente; à frente, se
    // veio de ré). Está aberto com certeza: o robô passou por ali. Vazio na largada.
    std::optional<Direction> entrySide_{};
    int outsideOpenings_{0};  // leituras "sem parede" num lado que dá para FORA do mapa
    StepReport report_{};
    void senseAndRecord();
    void applyTurnTo(Direction target);
    [[nodiscard]] bool wasUnseen(Direction direction) const;
    // Próxima direção com o lado `closed` da célula atual contado como parede (o mapa não muda).
    [[nodiscard]] std::optional<Direction> nextDirectionAvoiding(Direction closed);

public:
    Navigator(MazeMap& maze, ISensorPort& sensor, IMotionPort& motion, Position start,
              Direction heading, std::vector<Position> goals);

    [[nodiscard]] Position getPosition() const noexcept;
    [[nodiscard]] Direction getHeading() const noexcept;
    [[nodiscard]] bool reachedGoal() const noexcept;
    // Sem caminho até o objetivo, mesmo depois de esquecer as paredes lidas e sentir de novo: o
    // mapa não fecha com o que os sensores leem. O robô não se mexe mais; a corrida vai ao Erro.
    [[nodiscard]] bool stuck() const noexcept;
    // Quantas vezes um sensor leu "sem parede" num lado que, pelo mapa, é a borda do labirinto. O
    // mapa ignora essa leitura (a borda é sempre parede), mas, se ela se repete, o mapa está
    // montado para o lado errado: a via 3 da DIP (canto de partida) não corresponde ao canto em que
    // o robô foi posto. Só diagnóstico: vai no motivo de uma corrida que falha.
    [[nodiscard]] int outsideOpenings() const noexcept;
    // O que o último step() sentiu e decidiu (para o log).
    [[nodiscard]] const StepReport& lastStep() const noexcept;
    // Confere a chegada: sente a célula do objetivo e devolve false se algum sensor vê passagem
    // num lado que é a borda do labirinto. O objetivo é sempre um canto: se a borda "sumiu", o robô
    // não está onde o mapa diz (09/11, C3k: declarou sucesso depois de girar sem perceber).
    [[nodiscard]] bool confirmArrival();
    // Um passo: sente, recalcula e anda uma célula. Para a FRENTE ou para os lados, vira (se
    // preciso) e avança. Para TRÁS (beco, ou caminho que fechou), o robô NÃO dá meia-volta: anda
    // uma célula de ré, virado para o mesmo lado (getHeading() não muda). Com o eixo na traseira e
    // a frente longa, ele não cabe girando 180 graus dentro de um corredor (10/11).
    void step();
    bool run(int maxSteps);
};

}  // namespace micromouse::use_cases
