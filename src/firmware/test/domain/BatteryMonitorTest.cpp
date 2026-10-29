#include <gtest/gtest.h>

#include <cmath>
#include <stdexcept>

#include "domain/BatteryMonitor.hpp"

namespace micromouse::domain {

namespace {

TEST(BatteryMonitor, StartsNotLow) {
    BatteryMonitor monitor(6.6, 3);
    EXPECT_FALSE(monitor.isLow());
}

TEST(BatteryMonitor, HealthyVoltageNeverTriggers) {
    BatteryMonitor monitor(6.6, 3);
    for (int i = 0; i < 20; ++i) {
        EXPECT_FALSE(monitor.update(7.4));
    }
}

TEST(BatteryMonitor, ConfirmsOnlyAfterConsecutiveLowSamples) {
    BatteryMonitor monitor(6.6, 3);
    EXPECT_FALSE(monitor.update(6.4));
    EXPECT_FALSE(monitor.update(6.4));
    EXPECT_TRUE(monitor.update(6.4));
    EXPECT_TRUE(monitor.isLow());
}

TEST(BatteryMonitor, TransientDipDoesNotTrigger) {
    BatteryMonitor monitor(6.6, 3);
    EXPECT_FALSE(monitor.update(6.0));  // queda na partida dos motores
    EXPECT_FALSE(monitor.update(6.0));
    EXPECT_FALSE(monitor.update(7.2));  // recuperou: zera a contagem
    EXPECT_FALSE(monitor.update(6.0));
    EXPECT_FALSE(monitor.update(6.0));
    EXPECT_FALSE(monitor.isLow());
}

TEST(BatteryMonitor, VoltageEqualToThresholdIsNotLow) {
    BatteryMonitor monitor(6.6, 1);
    EXPECT_FALSE(monitor.update(6.6));
    EXPECT_TRUE(monitor.update(6.59));
}

TEST(BatteryMonitor, InvalidReadingsAreIgnored) {
    BatteryMonitor monitor(6.6, 2);
    EXPECT_FALSE(monitor.update(0.0));
    EXPECT_FALSE(monitor.update(-1.0));
    EXPECT_FALSE(monitor.update(std::nan("")));
    EXPECT_FALSE(monitor.isLow());
    EXPECT_FALSE(monitor.update(6.0));
    EXPECT_FALSE(monitor.update(0.0));  // não zera nem confirma
    EXPECT_TRUE(monitor.update(6.0));
}

TEST(BatteryMonitor, StaysLowOnceConfirmedUntilReset) {
    BatteryMonitor monitor(6.6, 2);
    (void)monitor.update(6.0);
    EXPECT_TRUE(monitor.update(6.0));
    EXPECT_TRUE(monitor.update(0.0));
    monitor.reset();
    EXPECT_FALSE(monitor.isLow());
}

TEST(BatteryMonitor, RejectsInvalidConfiguration) {
    EXPECT_THROW(BatteryMonitor(0.0, 3), std::invalid_argument);
    EXPECT_THROW(BatteryMonitor(6.6, 0), std::invalid_argument);
}

TEST(BatteryMonitor, DefaultsUseProvisionalThreshold) {
    BatteryMonitor monitor;
    for (int i = 0; i < BatteryMonitor::kDefaultConsecutiveSamples; ++i) {
        (void)monitor.update(6.0);
    }
    EXPECT_TRUE(monitor.isLow());
}

}  // namespace

}  // namespace micromouse::domain
