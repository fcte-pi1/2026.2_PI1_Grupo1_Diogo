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

TEST(SessionManager, StartVaiParaSelfTest) {
    SpySignal signal;
    SessionManager stateMachine(signal);
    stateMachine.start();
    EXPECT_EQ(stateMachine.getCurrentPhase(), SessionPhase::SelfTest);
}

TEST(SessionManager, SelfTestOkVaiExplorarESinalizaPronto) {
    SpySignal signal;
    SessionManager stateMachine(signal);
    stateMachine.start();
    stateMachine.onSelfTestResult(true);
    EXPECT_EQ(stateMachine.getCurrentPhase(), SessionPhase::Exploring);
    EXPECT_EQ(signal.ready, 1);
    EXPECT_EQ(signal.error, 0);
}

TEST(SessionManager, SelfTestFalhaVaiParaFaultESinalizaErro) {
    SpySignal signal;
    SessionManager stateMachine(signal);
    stateMachine.start();
    stateMachine.onSelfTestResult(false);
    EXPECT_EQ(stateMachine.getCurrentPhase(), SessionPhase::Fault);
    EXPECT_EQ(signal.ready, 0);
    EXPECT_EQ(signal.error, 1);
}

TEST(SessionManager, ReachedGoalNaExploracaoVaiRetornar) {
    SpySignal signal;
    SessionManager stateMachine(signal);
    stateMachine.start();
    stateMachine.onSelfTestResult(true);
    stateMachine.reachedGoal();
    EXPECT_EQ(stateMachine.getCurrentPhase(), SessionPhase::Returning);
}

TEST(SessionManager, FluxoCompletoAteFinished) {
    SpySignal signal;
    SessionManager stateMachine(signal);
    stateMachine.start();
    stateMachine.onSelfTestResult(true);
    stateMachine.reachedGoal();
    stateMachine.backAtStart();
    EXPECT_EQ(stateMachine.getCurrentPhase(), SessionPhase::FastRun);
    EXPECT_EQ(signal.running, 1);
    stateMachine.reachedGoal();
    EXPECT_EQ(stateMachine.getCurrentPhase(), SessionPhase::Finished);
}

TEST(SessionManager, FaultInterrompeFaseAtiva) {
    SpySignal signal;
    SessionManager stateMachine(signal);
    stateMachine.start();
    stateMachine.onSelfTestResult(true);
    stateMachine.reachedGoal();
    stateMachine.fault();
    EXPECT_EQ(stateMachine.getCurrentPhase(), SessionPhase::Fault);
    EXPECT_EQ(signal.error, 1);
}

TEST(SessionManager, _) {}

}  // namespace

}  // namespace micromouse::use_cases
