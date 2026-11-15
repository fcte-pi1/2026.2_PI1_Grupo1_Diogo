#pragma once

#include <optional>
#include <vector>

#include "domain/DipDecoder.hpp"
#include "domain/Maze.hpp"
#include "protocol/ProtocolV1.hpp"
#include "use_cases/SessionManager.hpp"

namespace micromouse::telemetry {

using domain::Direction;
using domain::MazeType;
using domain::Position;
using protocol::Encoder;
using protocol::mazeToString;
using protocol::RunResult;
using use_cases::SessionPhase;

struct Snapshot {
    SessionPhase phase;
    Position position;
    Direction heading;
    int cells;
    std::optional<double> speed;
    double voltage;
    double amperage;
    double watts;
};

class TelemetryEmitter {
private:
    Encoder encoder_;
    std::optional<SessionPhase> lastPhase_;

public:
    explicit TelemetryEmitter(Encoder encoder);

    [[nodiscard]] std::string encodeHello() const;
    [[nodiscard]] std::string encodeStartRun(int runIndex, long time, MazeType type);
    [[nodiscard]] std::vector<std::string> encodeCycle(long time, const Snapshot& snap);
    [[nodiscard]] std::string encodeCell(long time,                 //
                                         const Position& position,  //
                                         bool north,                //
                                         bool east,                 //
                                         bool south,                //
                                         bool west                  //
    );
    [[nodiscard]] std::string encodeRunResult(long time,         //
                                              RunResult result,  //
                                              std::optional<std::string> message = std::nullopt);
};

}  // namespace micromouse::telemetry
