#pragma once

#include <optional>
#include <string_view>

#include "domain/Maze.hpp"

namespace micromouse::domain {

// Nomes em COLUNAS x LINHAS, como no protocolo: 8x4 = 4 linhas e 8 colunas ("deitado"); 4x8 = 8 linhas
// e 4 colunas ("em pé"). O DIP só escolhe os três primeiros; os em pé (19/11) vêm do comando BLE
// `labirinto`, porque a via 1 + 2 fechadas é combinação proibida (#393).
enum class MazeType {
    Small4x4,   //
    Medium8x4,  //
    Large12x4,  //
    Tall4x8,    // 8 linhas x 4 colunas
    Tall4x12,   // 12 linhas x 4 colunas
    Tall4x4     // o 4x4 com o relato GIRADO: só pelo toque longo, para testar o caminho girado
};

// "Em pé" = o relato da telemetria sai girado 90 graus (ver ReportFrame). O toque longo do botão
// alterna: 4x4 <-> 4x4 girado, 8x4 <-> 4x8, 12x4 <-> 4x12.
[[nodiscard]] bool isPortrait(MazeType type) noexcept;
[[nodiscard]] MazeType flipOrientation(MazeType type) noexcept;
// O deitado correspondente (o que o protocolo e o painel conhecem).
[[nodiscard]] MazeType landscapeOf(MazeType type) noexcept;

struct MazeSetup {
    MazeType type{};
    int rows{};
    int columns{};
    Position start{};
    Position goal{};
};

// Dimensões, largada e objetivo de um tipo de labirinto. A largada é num canto de baixo (a esquerda ou
// a direita) e o objetivo no canto oposto.
[[nodiscard]] MazeSetup makeMazeSetup(MazeType type, bool startRight);

// "4x4", "8x4", "12x4", "4x8" ou "4x12" (colunas x linhas), do comando BLE `labirinto`.
[[nodiscard]] std::optional<MazeType> parseMazeType(std::string_view text) noexcept;

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
