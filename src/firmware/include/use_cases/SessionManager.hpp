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
    void enter(SessionPhase next);

public:
    explicit SessionManager(ISignalPort& signal);
    [[nodiscard]] SessionPhase getCurrentPhase() const noexcept;
    void start();
    void onSelfTestResult(bool success);
    void reachedGoal();
    void backAtStart();
};

}  // namespace micromouse::use_cases
