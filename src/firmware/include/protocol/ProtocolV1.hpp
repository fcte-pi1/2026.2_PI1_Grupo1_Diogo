#pragma once

#include <optional>
#include <string>

#include "domain/Maze.hpp"
#include "use_cases/SessionManager.hpp"

namespace micromouse::protocol {

using use_cases::SessionPhase;

[[nodiscard]] std::string phaseToString(use_cases::SessionPhase phase);
[[nodiscard]] char directionToChar(domain::Direction direction);

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
    [[nodiscard]] std::string encodeStartRun(int runIndex, int time, const std::string& maze);
    [[nodiscard]] long sequence() const noexcept;

    [[nodiscard]] std::string encodeState(int time,                      //
                                          use_cases::SessionPhase phase  //
    );

    [[nodiscard]] std::string encodeCell(int time,    //
                                         int x,       //
                                         int y,       //
                                         bool north,  //
                                         bool east,   //
                                         bool south,  //
                                         bool west    //
    );

    [[nodiscard]] std::string encodePosition(int time,                     //
                                             int x,                        //
                                             int y,                        //
                                             domain::Direction direction,  //
                                             int cells,                    //
                                             std::optional<double> speed   //
    );

    [[nodiscard]] std::string encodeEnergy(int time,         //
                                           double voltage,   //
                                           double amperage,  //
                                           double watts      //
    );
};

}  // namespace micromouse::protocol
