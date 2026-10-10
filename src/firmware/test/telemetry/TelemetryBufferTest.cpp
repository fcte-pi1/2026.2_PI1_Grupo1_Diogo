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
    buffer.add(10, "a");
    buffer.add(20, "b");
    buffer.add(30, "c");
    EXPECT_EQ(buffer.size(), 3u);
    EXPECT_FALSE(buffer.empty());
    EXPECT_EQ(buffer.messages(), (TelemetryData{"a", "b", "c"}));
}

TEST(TelemetryBuffer, DescartaForaDaJanelaDeTempo) {
    TelemetryBuffer buffer(1000, 2000);  // 1 segundo de retenção
    buffer.add(0, "a");
    buffer.add(500, "b");
    buffer.add(1200, "c");  // corte = 1200-1000 = 200: "a"(t0) sai
    EXPECT_EQ(buffer.size(), 2u);
    EXPECT_FALSE(buffer.empty());
    EXPECT_EQ(buffer.messages(), (TelemetryData{"b", "c"}));
}

TEST(TelemetryBuffer, MantemAMensagemNaBorda) {
    TelemetryBuffer buffer(1000, 2000);  // 1 segundo de retenção
    buffer.add(200, "a");
    buffer.add(1200, "b");  // corta = 200; "a" tem timestamp 200, não é < 200, então não é cortada
    EXPECT_EQ(buffer.size(), 2u);
    EXPECT_FALSE(buffer.empty());
    EXPECT_EQ(buffer.messages(), (TelemetryData{"a", "b"}));
}

}  // namespace

}  // namespace micromouse::telemetry
