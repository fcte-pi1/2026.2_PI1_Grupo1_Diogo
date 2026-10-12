#include "telemetry/TelemetryEmitter.hpp"

namespace micromouse::telemetry {

TelemetryEmitter::TelemetryEmitter(Encoder encoder) : encoder_(std::move(encoder)) {}

std::string TelemetryEmitter::encodeHello() const { return encoder_.encodeHello(); }

std::string TelemetryEmitter::encodeStartRun(int runIndex, long time, MazeType type) {
    return encoder_.encodeStartRun(runIndex, time, mazeToString(type));
};

std::vector<std::string> TelemetryEmitter::encodeCycle(long time, const Snapshot& snap) {
    std::vector<std::string> messages;

    if (!lastPhase_.has_value() || *lastPhase_ != snap.phase) {
        messages.push_back(encoder_.encodeState(time, snap.phase));
        lastPhase_ = snap.phase;
    }

    messages.push_back(encoder_.encodePosition(time,                  //
                                               snap.position.column,  //
                                               snap.position.row,     //
                                               snap.heading,          //
                                               snap.cells,            //
                                               snap.speed             //
                                               ));

    messages.push_back(encoder_.encodeEnergy(time,           //
                                             snap.voltage,   //
                                             snap.amperage,  //
                                             snap.watts      //
                                             ));
    return messages;
}

std::string TelemetryEmitter::encodeCell(long time,                 //
                                         const Position& position,  //
                                         bool north,                //
                                         bool east,                 //
                                         bool south,                //
                                         bool west                  //
) {
    return encoder_.encodeCell(time,             //
                               position.column,  //
                               position.row,     //
                               north,            //
                               east,             //
                               south,            //
                               west              //
    );
}

std::string TelemetryEmitter::encodeRunResult(long time,         //
                                              RunResult result,  //
                                              std::optional<std::string> message) {
    return encoder_.encodeRunResult(time, result, message);
}

}  // namespace micromouse::telemetry
