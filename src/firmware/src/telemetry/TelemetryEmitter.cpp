#include "telemetry/TelemetryEmitter.hpp"

namespace micromouse::telemetry {

TelemetryEmitter::TelemetryEmitter(Encoder encoder) : encoder_(std::move(encoder)) {}

std::string TelemetryEmitter::encodeHello() const { return encoder_.encodeHello(); }

std::string TelemetryEmitter::encodeStartRun(int runIndex, long time, MazeType type) {
    return encoder_.encodeStartRun(runIndex, time, mazeToString(type));
};

}  // namespace micromouse::telemetry
