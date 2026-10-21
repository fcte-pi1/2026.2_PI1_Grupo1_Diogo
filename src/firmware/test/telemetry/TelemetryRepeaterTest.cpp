#include <gtest/gtest.h>

#include <string>
#include <vector>

#include "telemetry/TelemetryRepeater.hpp"

namespace micromouse::telemetry {

using Messages = std::vector<std::string>;

namespace {

TEST(TelemetryRepeater, ComecaVazio) {
    TelemetryRepeater repeater;
    EXPECT_TRUE(repeater.empty());
    EXPECT_EQ(repeater.due(1'000'000), Messages{});
}

TEST(TelemetryRepeater, ReenviaNosAtrasosPadrao) {
    TelemetryRepeater repeater;  // 300 ms e 1000 ms
    repeater.schedule(1000, "fim");
    EXPECT_EQ(repeater.due(1299), Messages{});
    EXPECT_EQ(repeater.due(1300), Messages{"fim"});
    EXPECT_EQ(repeater.due(1999), Messages{});
    EXPECT_EQ(repeater.due(2000), Messages{"fim"});
    EXPECT_TRUE(repeater.empty());
}

TEST(TelemetryRepeater, CadaCopiaSaiUmaVezSo) {
    TelemetryRepeater repeater({100});
    repeater.schedule(0, "inicio");
    EXPECT_EQ(repeater.due(500), Messages{"inicio"});
    EXPECT_EQ(repeater.due(600), Messages{});
}

TEST(TelemetryRepeater, AtrasoDoLacoEntregaTodasAsVencidasEmOrdem) {
    // A tarefa de telemetria roda a cada 100 ms: uma volta atrasada recebe tudo o que venceu.
    TelemetryRepeater repeater({300, 1000});
    repeater.schedule(0, "inicio");
    repeater.schedule(500, "fim");
    EXPECT_EQ(repeater.due(5000), (Messages{"inicio", "fim", "inicio", "fim"}));
    EXPECT_TRUE(repeater.empty());
}

TEST(TelemetryRepeater, IntercalaMensagensPeloVencimento) {
    TelemetryRepeater repeater({300, 1000});
    repeater.schedule(0, "a");    // vence em 300 e 1000
    repeater.schedule(200, "b");  // vence em 500 e 1200
    EXPECT_EQ(repeater.due(300), Messages{"a"});
    EXPECT_EQ(repeater.due(1000), (Messages{"b", "a"}));
    EXPECT_EQ(repeater.due(1200), Messages{"b"});
}

TEST(TelemetryRepeater, SemAtrasosNaoRepete) {
    TelemetryRepeater repeater({});
    repeater.schedule(0, "x");
    EXPECT_TRUE(repeater.empty());
}

}  // namespace

}  // namespace micromouse::telemetry
