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

}  // namespace

}  // namespace micromouse::telemetry
