#pragma once

#include "domain/Maze.hpp"

namespace micromouse::domain {

enum class MazeType {
    Small4x4,   //
    Medium8x4,  //
    Large12x4   //
};

struct MazeSetup {
    MazeType type{};
    int rows{};
    int columns{};
    Position start{};
    Position goal{};
};

// Conferência do canto de largada (10/11). O robô larga num canto de baixo virado para cima: com a
// partida pela esquerda, a borda fica à ESQUERDA dele; pela direita, à DIREITA. Se o sensor desse
// lado vê passagem, a via 3 da DIP não corresponde ao canto em que o robô foi posto (ou ele está
// virado para o lado errado), e o mapa ficaria espelhado até o fim da corrida.
enum class StartCheck {
    Ok,             // a borda está onde a DIP diz (ou o sensor desse lado não leu)
    BorderSideOpen  // sem parede do lado em que a DIP diz haver borda
};

[[nodiscard]] bool startBorderIsOnTheLeft(const MazeSetup& setup) noexcept;
[[nodiscard]] StartCheck checkStartCorner(const MazeSetup& setup, bool leftWall, bool leftUnknown,
                                          bool rightWall, bool rightUnknown) noexcept;

class DipDecoder {
public:
    [[nodiscard]] MazeSetup decode(bool dip1, bool dip2, bool dip3) const;
};

}  // namespace micromouse::domain
