#include "use_cases/SessionManager.hpp"

namespace micromouse::use_cases {

SessionManager::SessionManager(ISignalPort& signal) : signal_(signal) {}

SessionPhase SessionManager::getCurrentPhase() const noexcept { return phase_; }

}  // namespace micromouse::use_cases
