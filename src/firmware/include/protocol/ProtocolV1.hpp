#pragma once

#include <optional>
#include <string>

#include "domain/DipDecoder.hpp"
#include "domain/Maze.hpp"
#include "use_cases/SessionManager.hpp"

namespace micromouse::protocol {

using domain::Direction;
using domain::MazeType;
using use_cases::SessionPhase;

[[nodiscard]] std::string phaseToString(SessionPhase phase);
[[nodiscard]] char directionToChar(Direction direction);
[[nodiscard]] std::string mazeToString(MazeType maze);

enum class RunResult { Success, Failure };

class Encoder {
private:
    std::string device_;
    std::string token_;
    std::string boot_;
    std::string run_;
    long sequence_{0};
    long nextSequence();

public:
    Encoder(std::string device, std::string token, std::string boot);
    std::string encodeHello() const;
    [[nodiscard]] std::string encodeStartRun(int runIndex, long time, const std::string& maze);
    [[nodiscard]] long sequence() const noexcept;

    [[nodiscard]] std::string encodeState(long time,                      //
                                          use_cases::SessionPhase phase  //
    );

    [[nodiscard]] std::string encodeCell(long time,   //
                                         int x,       //
                                         int y,       //
                                         bool north,  //
                                         bool east,   //
                                         bool south,  //
                                         bool west    //
    );

    [[nodiscard]] std::string encodePosition(long time,                     //
                                             int x,                        //
                                             int y,                        //
                                             domain::Direction direction,  //
                                             int cells,                    //
                                             std::optional<double> speed   //
    );

    [[nodiscard]] std::string encodeEnergy(long time,        //
                                           double voltage,   //
                                           double amperage,  //
                                           double watts      //
    );

    [[nodiscard]] std::string encodeRunResult(long time, RunResult result,
                                              std::optional<std::string> message = std::nullopt);
};

}  // namespace micromouse::protocol
