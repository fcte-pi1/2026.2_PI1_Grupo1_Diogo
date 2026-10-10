#include "use_cases/SessionManager.hpp"

namespace micromouse::use_cases {

SessionManager::SessionManager(ISignalPort& signal) : signal_(signal) {}

SessionPhase SessionManager::getCurrentPhase() const noexcept { return phase_; }

void SessionManager::enter(SessionPhase next) {
    phase_ = next;
    switch (next) {
        case SessionPhase::Exploring:
            signal_.signalReady();
            break;
        case SessionPhase::FastRun:
            signal_.signalRunning();
            break;
        case SessionPhase::Fault:
            signal_.signalError();
            break;
        default:
            break;
    }
}

void SessionManager::onSelfTestResult(bool ok) {
    if (phase_ != SessionPhase::SelfTest) return;
    enter(ok ? SessionPhase::Exploring : SessionPhase::Fault);
}

void SessionManager::start() {
    if (phase_ == SessionPhase::Idle) enter(SessionPhase::SelfTest);
}

void SessionManager::reachedGoal() {
    if (phase_ == SessionPhase::Exploring) {
        enter(SessionPhase::Returning);
    } else if (phase_ == SessionPhase::FastRun) {
        enter(SessionPhase::Finished);
    }
}

void SessionManager::backAtStart() {
    if (phase_ == SessionPhase::Returning) {
        enter(SessionPhase::FastRun);
    }
}

void SessionManager::fault() {
    if (phase_ != SessionPhase::Finished && phase_ != SessionPhase::Fault) {
        enter(SessionPhase::Fault);
    }
}

}  // namespace micromouse::use_cases
