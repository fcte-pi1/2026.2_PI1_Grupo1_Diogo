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
        R"({"tipo":"hello","versao":1,"dispositivo":"rato-01","token":"<token>","boot":"9f3a1c"})");
}

TEST(ProtocolV1, InicioCorridaBateComOExemplo) {
    Encoder encoder = makeEncoder();
    EXPECT_EQ(
        encoder.encodeStartRun(1, 12000, "4x4"),
        R"({"versao":1,"tipo":"inicio_corrida","corrida":"r9f3a1c-1","sequencia":1,"tempo_ms":12000,"labirinto":"4x4"})");
    EXPECT_EQ(encoder.sequence(), 1);
}

TEST(ProtocolV1, SequenciaMonotonicaEntreMensagens) {
    Encoder encoder = makeEncoder();
    (void)encoder.encodeStartRun(1, 12000, "4x4");
    EXPECT_EQ(
        encoder.encodeState(12001, SessionPhase::Exploring),
        R"({"versao":1,"tipo":"estado","corrida":"r9f3a1c-1","sequencia":2,"tempo_ms":12001,"estado":"MAPEANDO"})");
    EXPECT_EQ(
        encoder.encodeCell(12010, 0, 3, false, true, true, true),
        R"({"versao":1,"tipo":"celula","corrida":"r9f3a1c-1","sequencia":3,"tempo_ms":12010,"x":0,"y":3,"paredes":{"norte":false,"leste":true,"sul":true,"oeste":true}})");
    EXPECT_EQ(
        encoder.encodePosition(12100, 0, 3, Direction::North, 0, 0.0),
        R"({"versao":1,"tipo":"posicao","corrida":"r9f3a1c-1","sequencia":4,"tempo_ms":12100,"x":0,"y":3,"orientacao":"NORTE","celulas":0,"velocidade_media_mps":0})");
    EXPECT_EQ(
        encoder.encodeEnergy(12100, 8.12, 0.41, 3.33),
        R"({"versao":1,"tipo":"energia","corrida":"r9f3a1c-1","sequencia":5,"tempo_ms":12100,"tensao_v":8.12,"corrente_a":0.41,"potencia_w":3.33})");
    EXPECT_EQ(encoder.sequence(), 5);
}

TEST(ProtocolV1, PosicaoSemVelocidadeOmiteOCampo) {
    Encoder encoder = makeEncoder();
    (void)encoder.encodeStartRun(1, 12000, "4x4");
    const std::string msg = encoder.encodePosition(12100, 2, 1, Direction::East, 3, std::nullopt);
    EXPECT_EQ(
        msg,
        R"({"versao":1,"tipo":"posicao","corrida":"r9f3a1c-1","sequencia":2,"tempo_ms":12100,"x":2,"y":1,"orientacao":"LESTE","celulas":3})");
    EXPECT_EQ(msg.find("velocidade_media_mps"), std::string::npos);
}

TEST(ProtocolV1, FimCorridaResultado) {
    Encoder encoder1 = makeEncoder();
    (void)encoder1.encodeStartRun(1, 12000, "4x4");
    EXPECT_EQ(
        encoder1.encodeRunResult(95500, RunResult::Success),
        R"({"versao":1,"tipo":"fim_corrida","corrida":"r9f3a1c-1","sequencia":2,"tempo_ms":95500,"resultado":"sucesso"})");
    Encoder encoder2 = makeEncoder();
    (void)encoder2.encodeStartRun(1, 0, "4x4");
    EXPECT_EQ(
        encoder2.encodeRunResult(100, RunResult::Failure),
        R"({"versao":1,"tipo":"fim_corrida","corrida":"r9f3a1c-1","sequencia":2,"tempo_ms":100,"resultado":"falha"})");
}

TEST(ProtocolV1, FimCorridaComDetalheEscapa) {
    Encoder encoder = makeEncoder();
    (void)encoder.encodeStartRun(1, 0, "4x4");
    EXPECT_EQ(
        encoder.encodeRunResult(100, RunResult::Failure, R"(aspa " e barra \)"),
        R"({"versao":1,"tipo":"fim_corrida","corrida":"r9f3a1c-1","sequencia":2,"tempo_ms":100,"resultado":"falha","detalhe":"aspa \" e barra \\"})");
}

TEST(ProtocolV1, FimCorridaDetalheTruncaEm200Caracteres) {
    Encoder encoder = makeEncoder();
    (void)encoder.encodeStartRun(1, 0, "4x4");
    const std::string entrada(250, 'a');
    const std::string esperado(200, 'a');
    EXPECT_EQ(
        encoder.encodeRunResult(100, RunResult::Failure, entrada),
        R"({"versao":1,"tipo":"fim_corrida","corrida":"r9f3a1c-1","sequencia":2,"tempo_ms":100,"resultado":"falha","detalhe":")" +
            esperado + R"("})");
}

TEST(ProtocolV1, FimCorridaDetalheLimiteExato200Caracteres) {
    Encoder encoder = makeEncoder();
    (void)encoder.encodeStartRun(1, 0, "4x4");
    const std::string entrada(200, 'a');
    EXPECT_EQ(
        encoder.encodeRunResult(100, RunResult::Failure, entrada),
        R"({"versao":1,"tipo":"fim_corrida","corrida":"r9f3a1c-1","sequencia":2,"tempo_ms":100,"resultado":"falha","detalhe":")" +
            entrada + R"("})");
}

TEST(ProtocolV1, FimCorridaDetalheTruncaUtf8MultibyteSemQuebrar) {
    Encoder encoder = makeEncoder();
    (void)encoder.encodeStartRun(1, 0, "4x4");
    std::string entrada;
    for (int i = 0; i < 250; ++i) {
        entrada += "é";
    }
    std::string esperado;
    for (int i = 0; i < 200; ++i) {
        esperado += "é";
    }
    EXPECT_EQ(
        encoder.encodeRunResult(100, RunResult::Failure, entrada),
        R"({"versao":1,"tipo":"fim_corrida","corrida":"r9f3a1c-1","sequencia":2,"tempo_ms":100,"resultado":"falha","detalhe":")" +
            esperado + R"("})");
}

TEST(ProtocolV1, FimCorridaDetalheEscapaControleEPreservaUtf8) {
    Encoder encoder = makeEncoder();
    (void)encoder.encodeStartRun(1, 0, "4x4");
    const std::string entrada = std::string("teste ") + "é" + "\001\n\t" + "\037" + " fim";
    EXPECT_EQ(
        encoder.encodeRunResult(100, RunResult::Failure, entrada),
        R"({"versao":1,"tipo":"fim_corrida","corrida":"r9f3a1c-1","sequencia":2,"tempo_ms":100,"resultado":"falha","detalhe":"teste é\u0001\n\t\u001f fim"})");
}

TEST(ProtocolV1, MapeamentoDeEstados) {
    EXPECT_EQ(phaseToString(SessionPhase::SelfTest), "INICIALIZANDO");
    EXPECT_EQ(phaseToString(SessionPhase::Idle), "AGUARDANDO");
    EXPECT_EQ(phaseToString(SessionPhase::Exploring), "MAPEANDO");
    EXPECT_EQ(phaseToString(SessionPhase::Returning), "MAPEANDO");
    EXPECT_EQ(phaseToString(SessionPhase::FastRun), "RESOLVENDO");
    EXPECT_EQ(phaseToString(SessionPhase::Finished), "CONCLUIDO");
    EXPECT_EQ(phaseToString(SessionPhase::Fault), "ERRO");
}

TEST(ProtocolV1, OrientacaoPorExtenso) {
    EXPECT_EQ(directionToString(Direction::North), "NORTE");
    EXPECT_EQ(directionToString(Direction::East), "LESTE");
    EXPECT_EQ(directionToString(Direction::South), "SUL");
    EXPECT_EQ(directionToString(Direction::West), "OESTE");
}

TEST(ProtocolV1, LabirintoToString) {
    EXPECT_EQ(mazeToString(MazeType::Small4x4), "4x4");
    EXPECT_EQ(mazeToString(MazeType::Medium8x4), "8x4");
    EXPECT_EQ(mazeToString(MazeType::Large12x4), "12x4");
}

}  // namespace

}  // namespace micromouse::protocol
