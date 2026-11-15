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
    void fault();
    // RF-56: encerrada a sessão, volta ao Aguardando para uma nova largada. Uma falha (Fault) não
    // se desfaz sozinha: exige reiniciar o robô.
    void rearm();
};

}  // namespace micromouse::use_cases
