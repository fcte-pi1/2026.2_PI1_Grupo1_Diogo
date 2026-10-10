#include "telemetry/TelemetryEmitter.hpp"

namespace micromouse::telemetry {

TelemetryEmitter::TelemetryEmitter(Encoder encoder) : encoder_(std::move(encoder)) {}

std::string TelemetryEmitter::encodeHello() const { return encoder_.encodeHello(); }

}  // namespace micromouse::telemetry
