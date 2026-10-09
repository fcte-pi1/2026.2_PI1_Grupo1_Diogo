#include <gtest/gtest.h>

#include "ports/SignalPort.hpp"
#include "spy/SpySignalPort.hpp"
#include "use_cases/SessionManager.hpp"

namespace micromouse::use_cases {

namespace {

using test::SpySignal;

TEST(SessionManager, ComecaEmIdle) {
    SpySignal signal;
    SessionManager stateMachine(signal);
    EXPECT_EQ(stateMachine.getCurrentPhase(), SessionPhase::Idle);
}

}  // namespace

}  // namespace micromouse::use_cases
