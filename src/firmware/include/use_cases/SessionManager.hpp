#pragma once

#include "ports/SignalPort.hpp"

namespace micromouse::use_cases {

using ports::ISignalPort;

enum class SessionPhase {
    Idle,       //
    SelfTest,   //
    Exploring,  //
    Returning,  //
    FastRun,    //
    Finished,   //
    Fault       //
};

class SessionManager {
private:
    ISignalPort& signal_;
    SessionPhase phase_{SessionPhase::Idle};

public:
    explicit SessionManager(ISignalPort& signal);
    [[nodiscard]] SessionPhase getCurrentPhase() const noexcept;
};

}  // namespace micromouse::use_cases
