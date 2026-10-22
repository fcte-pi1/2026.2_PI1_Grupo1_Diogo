#include <iostream>
#include <optional>
#include <string>

#include "domain/Maze.hpp"
#include "protocol/ProtocolV1.hpp"
#include "use_cases/SessionManager.hpp"

using namespace micromouse;
using domain::Direction;
using use_cases::SessionPhase;

int main() {
    protocol::Encoder enc("rato-01", "<token>", "9f3a1c");
    std::cout << enc.encodeHello() << '\n';
    std::cout << enc.encodeStartRun(1, 12000, "4x4") << '\n';
    for (auto p : {SessionPhase::SelfTest, SessionPhase::Idle, SessionPhase::Exploring,
                   SessionPhase::FastRun, SessionPhase::Finished, SessionPhase::Fault})
        std::cout << enc.encodeState(12001, p) << '\n';
    std::cout << enc.encodeCell(12010, 0, 3, false, true, true, true) << '\n';
    for (auto d : {Direction::North, Direction::East, Direction::South, Direction::West})
        std::cout << enc.encodePosition(12100, 2, 1, d, 3, 0.12) << '\n';
    std::cout << enc.encodePosition(12100, 2, 1, Direction::North, 3, std::nullopt) << '\n';
    std::cout << enc.encodeEnergy(12100, 8.12, 0.41, 3.33) << '\n';
    std::cout << enc.encodeRunResult(95500, protocol::RunResult::Success) << '\n';
    std::cout << enc.encodeRunResult(95500, protocol::RunResult::Failure, "falha") << '\n';

    // Casos de borda (#355). O teste do backend confere o texto exato de cada um.
    // detalhe de 250 caracteres: tem que sair com 200.
    std::cout << enc.encodeRunResult(95500, protocol::RunResult::Failure, std::string(250, 'x'))
              << '\n';
    // quebra de linha, tabulação, aspas, barra e caractere de controle: nada pode partir a linha.
    std::cout << enc.encodeRunResult(95500, protocol::RunResult::Failure,
                                     std::string("linha 1\nlinha 2\t\"aspas\" \\ \x01 fim"))
              << '\n';
    // 199 'a' + 5 'é' (UTF-8, 2 bytes cada): o corte em 200 caracteres cai dentro do primeiro 'é'.
    std::string accented(199, 'a');
    for (int i = 0; i < 5; ++i) accented += "\xC3\xA9";
    std::cout << enc.encodeRunResult(95500, protocol::RunResult::Failure, accented) << '\n';
    // O Encoder recebe a velocidade em mm/s e publica em m/s: 250 mm/s tem que sair como 0,25.
    std::cout << enc.encodePosition(12200, 3, 1, Direction::East, 4, 250.0) << '\n';
}
