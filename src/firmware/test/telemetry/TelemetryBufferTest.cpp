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

TEST(TelemetryBuffer, DescartaAlemDoTetoDeContagem) {
    TelemetryBuffer buffer(1000000, 3);  // 1 milhão de ms de retenção, 3 mensagens no máximo
    buffer.add(0, "a");
    buffer.add(1, "b");
    buffer.add(2, "c");
    buffer.add(3, "d");  // "a" é descartada, pois o buffer tem capacidade máxima de 3 mensagens
    EXPECT_EQ(buffer.size(), 3u);
    EXPECT_FALSE(buffer.empty());
    EXPECT_EQ(buffer.messages(), (TelemetryData{"b", "c", "d"}));
}

TEST(TelemetryBuffer, ClearEsvazia) {
    TelemetryBuffer buffer(60000, 2000);
    buffer.add(10, "a");
    buffer.clear();
    EXPECT_EQ(buffer.size(), 0u);
    EXPECT_TRUE(buffer.empty());
    EXPECT_EQ(buffer.messages(), (TelemetryData{}));
}

TEST(TelemetryBuffer, RetemPeloMenos60Segundos) {
    TelemetryBuffer buffer(60000, 100000);  // 1 minuto de retenção, 100000 mensagens no máximo

    // Adiciona mensagens a cada 100ms, totalizando 90 segundos de mensagens
    for (long timestamp = 0; timestamp <= 90000; timestamp += 100) {
        buffer.add(timestamp, "msg_" + std::to_string(timestamp));
    }
    const TelemetryData messages = buffer.messages();

    // A primeira mensagem retida deve ter timestamp 30000
    EXPECT_EQ(messages.front(), "msg_30000");

    // A última mensagem retida deve ter timestamp 90000
    EXPECT_EQ(messages.back(), "msg_90000");
}

}  // namespace

}  // namespace micromouse::telemetry
