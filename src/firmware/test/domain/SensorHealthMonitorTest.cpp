#include <gtest/gtest.h>

#include <stdexcept>

#include "domain/SensorHealthMonitor.hpp"

namespace micromouse::domain {

namespace {

TEST(SensorHealthMonitor, HealthySensorNeverFails) {
    SensorHealthMonitor monitor(3);
    for (int i = 0; i < 20; ++i) {
        EXPECT_FALSE(monitor.update(true));
    }
}

TEST(SensorHealthMonitor, IsolatedFailureIsTolerated) {
    SensorHealthMonitor monitor(3);
    EXPECT_FALSE(monitor.update(false));  // um NACK isolado no I²C
    EXPECT_FALSE(monitor.update(true));   // respondeu de novo: zera a contagem
    EXPECT_FALSE(monitor.update(false));
    EXPECT_FALSE(monitor.update(false));
    EXPECT_FALSE(monitor.hasFailed());
}

TEST(SensorHealthMonitor, ConfirmsAfterConsecutiveFailures) {
    SensorHealthMonitor monitor(3);
    EXPECT_FALSE(monitor.update(false));
    EXPECT_FALSE(monitor.update(false));
    EXPECT_TRUE(monitor.update(false));
    EXPECT_TRUE(monitor.hasFailed());
}

TEST(SensorHealthMonitor, ConfirmedFailureStaysUntilReset) {
    SensorHealthMonitor monitor(2);
    (void)monitor.update(false);
    EXPECT_TRUE(monitor.update(false));
    EXPECT_TRUE(monitor.update(true));
    monitor.reset();
    EXPECT_FALSE(monitor.hasFailed());
}

TEST(SensorHealthMonitor, DefaultToleratesTwoFailures) {
    SensorHealthMonitor monitor;
    EXPECT_FALSE(monitor.update(false));
    EXPECT_FALSE(monitor.update(false));
    EXPECT_TRUE(monitor.update(false));
}

TEST(SensorHealthMonitor, RejectsInvalidConfiguration) {
    EXPECT_THROW(SensorHealthMonitor(0), std::invalid_argument);
}

}  // namespace

}  // namespace micromouse::domain
