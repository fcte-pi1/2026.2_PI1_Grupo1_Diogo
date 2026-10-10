#include <gtest/gtest.h>

#include <vector>

#include "telemetry/TelemetryBuffer.hpp"

namespace micromouse::telemetry {

using TelemetryData = std::vector<std::string>;

namespace {

TEST(TelemetryBuffer, ComecaVazio) {
    TelemetryBuffer buffer(60000, 2000);
    EXPECT_EQ(buffer.size(), 0);
    EXPECT_TRUE(buffer.empty());
    EXPECT_EQ(buffer.messages(), TelemetryData{});
}

TEST(TelemetryBuffer, GuardaEmOrdem) {
    TelemetryBuffer buffer(60000, 2000);
    buffer.add(0, "a");
    buffer.add(500, "b");
    buffer.add(1200, "c");
    EXPECT_EQ(buffer.size(), 3u);
    EXPECT_FALSE(buffer.empty());
    EXPECT_EQ(buffer.messages(), (TelemetryData{"a", "b", "c"}));
}

}  // namespace

}  // namespace micromouse::telemetry
