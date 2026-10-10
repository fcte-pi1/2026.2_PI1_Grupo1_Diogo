#pragma once

#include "domain/DipDecoder.hpp"
#include "protocol/ProtocolV1.hpp"

namespace micromouse::telemetry {

using domain::MazeType;
using protocol::Encoder;
using protocol::mazeToString;

class TelemetryEmitter {
private:
    Encoder encoder_;

public:
    explicit TelemetryEmitter(Encoder encoder);

    [[nodiscard]] std::string encodeHello() const;
    [[nodiscard]] std::string encodeStartRun(int runIndex, long time, MazeType type);
};

}  // namespace micromouse::telemetry
