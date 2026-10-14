#include <iostream>
#include <optional>

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
}
