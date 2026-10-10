#include <gtest/gtest.h>

#include "domain/DipDecoder.hpp"
#include "domain/Maze.hpp"
#include "protocol/ProtocolV1.hpp"
#include "use_cases/SessionManager.hpp"

namespace micromouse::protocol {

namespace {

using domain::Direction;
using domain::MazeType;
using use_cases::SessionPhase;

Encoder makeEncoder() { return Encoder("rato-01", "<token>", "9f3a1c"); }

TEST(ProtocolV1, HelloBateComOExemplo) {
    Encoder encoder = makeEncoder();
    EXPECT_EQ(
        encoder.encodeHello(),
        R"({"tipo":"hello","v":1,"dispositivo":"rato-01","token":"<token>","boot":"9f3a1c"})");
}

TEST(ProtocolV1, InicioCorridaBateComOExemplo) {
    Encoder encoder = makeEncoder();
    EXPECT_EQ(
        encoder.encodeStartRun(1, 12000, "4x4"),
        R"({"v":1,"tipo":"inicio_corrida","corrida":"r9f3a1c-1","seq":1,"t":12000,"labirinto":"4x4"})");
    EXPECT_EQ(encoder.sequence(), 1);
}

TEST(ProtocolV1, SequenciaMonotonicaEntreMensagens) {
    Encoder encoder = makeEncoder();
    encoder.encodeStartRun(1, 12000, "4x4");  // seq 1
    EXPECT_EQ(
        encoder.encodeState(12001, SessionPhase::Exploring),
        R"({"v":1,"tipo":"estado","corrida":"r9f3a1c-1","seq":2,"t":12001,"estado":"MAPEANDO"})");
    EXPECT_EQ(
        encoder.encodeCell(12010, 0, 3, false, true, true, true),
        R"({"v":1,"tipo":"celula","corrida":"r9f3a1c-1","seq":3,"t":12010,"x":0,"y":3,"paredes":{"n":false,"l":true,"s":true,"o":true}})");
    EXPECT_EQ(
        encoder.encodePosition(12100, 0, 3, Direction::North, 0, 0.0),
        R"({"v":1,"tipo":"posicao","corrida":"r9f3a1c-1","seq":4,"t":12100,"x":0,"y":3,"orientacao":"N","celulas":0,"velocidade_media_mps":0})");
    EXPECT_EQ(
        encoder.encodeEnergy(12100, 8.12, 0.41, 3.33),
        R"({"v":1,"tipo":"energia","corrida":"r9f3a1c-1","seq":5,"t":12100,"tensao_v":8.12,"corrente_a":0.41,"potencia_w":3.33})");
    EXPECT_EQ(encoder.sequence(), 5);
}

}  // namespace

}  // namespace micromouse::protocol
