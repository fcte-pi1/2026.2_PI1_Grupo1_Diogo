#pragma once

#include "protocol/ProtocolV1.hpp"

namespace micromouse::telemetry {

using protocol::Encoder;

class TelemetryEmitter {
private:
    Encoder encoder_;

public:
    explicit TelemetryEmitter(Encoder encoder);

    [[nodiscard]] std::string encodeHello() const;
};

}  // namespace micromouse::telemetry
