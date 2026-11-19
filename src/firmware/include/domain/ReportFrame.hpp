#pragma once

#include "domain/DipDecoder.hpp"
#include "domain/Maze.hpp"

namespace micromouse::domain {

// Quadro de RELATO da telemetria (19/11). O protocolo e o painel só conhecem 4x4, 8x4 e 12x4
// (deitados). Um labirinto em pé (4x8, 4x12: mais linhas que colunas) é relatado como o deitado
// correspondente, com o mapa GIRADO 90 graus (rotação, não espelho): a largada fica embaixo e o
// objetivo em cima. Dentro do robô o mapa continua no quadro dele; só a saída é girada.
//  - largada à esquerda: giro anti-horário, (r, c) -> (C-1-c, r);   N->O, L->N, S->L, O->S
//  - largada à direita:  giro horário,       (r, c) -> (c, R-1-r);   N->L, L->S, S->O, O->N
// (R = linhas e C = colunas do quadro do robô). Deitados e o 4x4 passam sem mudança.
class ReportFrame {
public:
    struct Walls {
        bool north;
        bool east;
        bool south;
        bool west;
    };

    explicit ReportFrame(const MazeSetup& setup) noexcept;

    [[nodiscard]] bool rotated() const noexcept { return rotated_; }
    [[nodiscard]] MazeType type() const noexcept { return reported_; }  // o tipo que vai no protocolo
    [[nodiscard]] Position position(const Position& position) const noexcept;
    [[nodiscard]] Direction direction(Direction direction) const noexcept;
    // As quatro paredes de uma célula, giradas junto com o mapa.
    [[nodiscard]] Walls walls(bool north, bool east, bool south, bool west) const noexcept;

private:
    bool rotated_;
    bool clockwise_;  // só vale se rotated_
    int rows_;
    int columns_;
    MazeType reported_;
};

}  // namespace micromouse::domain
