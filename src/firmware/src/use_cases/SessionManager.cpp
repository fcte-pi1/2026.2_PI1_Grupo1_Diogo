#include "use_cases/SessionManager.hpp"

namespace micromouse::use_cases {

SessionManager::SessionManager(ISignalPort& signal) : signal_(signal) {}

SessionPhase SessionManager::getCurrentPhase() const noexcept { return phase_; }

void SessionManager::enter(SessionPhase next) { phase_ = next; }

void SessionManager::start() {
    if (phase_ == SessionPhase::Idle) enter(SessionPhase::SelfTest);
}

}  // namespace micromouse::use_cases
