#include "protocol/ProtocolV1.hpp"

namespace micromouse::protocol {

namespace {

std::string num(double value) {
    char buffer[32];
    std::snprintf(buffer, sizeof(buffer), "%.3f", value);
    std::string str(buffer);
    const auto dot = str.find('.');
    if (dot != std::string::npos) {
        std::size_t lastNonZero = str.find_last_not_of('0');
        if (lastNonZero == dot) {
            --lastNonZero;
        }
        str.erase(lastNonZero + 1);
    }
    return str;
}

const char* boolJson(bool value) { return value ? "true" : "false"; }

}  // namespace

Encoder::Encoder(std::string device, std::string token, std::string boot)
    : device_(std::move(device)), token_(std::move(token)), boot_(std::move(boot)) {}

std::string Encoder::encodeHello() const {
    return R"({"tipo":"hello","v":1,"dispositivo":")" + device_ + R"(","token":")" + token_ +
           R"(","boot":")" + boot_ + R"("})";
}

std::string Encoder::encodeStartRun(int runIndex, int time, const std::string& maze) {
    run_ = "r" + boot_ + "-" + std::to_string(runIndex);
    sequence_ = 1;
    return R"({"v":1,"tipo":"inicio_corrida","corrida":")" + run_ + R"(","seq":1,"t":)" +
           std::to_string(time) + R"(,"labirinto":")" + maze + R"("})";
}

long Encoder::sequence() const noexcept { return sequence_; };

long Encoder::nextSequence() { return ++sequence_; }

std::string phaseToString(SessionPhase phase) {
    switch (phase) {
        case SessionPhase::SelfTest:
            return "INICIALIZANDO";
        case SessionPhase::Idle:
            return "AGUARDANDO";
        case SessionPhase::Exploring:
            return "MAPEANDO";
        case SessionPhase::Returning:
            return "MAPEANDO";
        case SessionPhase::FastRun:
            return "RESOLVENDO";
        case SessionPhase::Finished:
            return "CONCLUIDO";
        default:
            return "ERRO";
    }
}

char directionToChar(domain::Direction direction) {
    switch (direction) {
        case domain::Direction::North:
            return 'N';
        case domain::Direction::East:
            return 'L';
        case domain::Direction::South:
            return 'S';
        case domain::Direction::West:
            return 'O';
        default:
            return '?';
    }
}

std::string Encoder::encodeState(int time,                      //
                                 use_cases::SessionPhase phase  //
) {
    return R"({"v":1,"tipo":"estado","corrida":")" + run_ + R"(","seq":)" +
           std::to_string(nextSequence()) + R"(,"t":)" + std::to_string(time) + R"(,"estado":")" +
           phaseToString(phase) + R"("})";
}

std::string Encoder::encodeCell(int time,    //
                                int x,       //
                                int y,       //
                                bool north,  //
                                bool east,   //
                                bool south,  //
                                bool west    //
) {
    return R"({"v":1,"tipo":"celula","corrida":")" + run_ + R"(","seq":)" +
           std::to_string(nextSequence()) + R"(,"t":)" + std::to_string(time) + R"(,"x":)" +
           std::to_string(x) + R"(,"y":)" + std::to_string(y) + R"(,"paredes":{"n":)" +
           boolJson(north) + R"(,"l":)" + boolJson(east) + R"(,"s":)" + boolJson(south) +
           R"(,"o":)" + boolJson(west) + R"(}})";
}

std::string Encoder::encodePosition(int time,                     //
                                    int x,                        //
                                    int y,                        //
                                    domain::Direction direction,  //
                                    int cells,                    //
                                    std::optional<double> speed   //
) {
    std::string msg = R"({"v":1,"tipo":"posicao","corrida":")" + run_ + R"(","seq":)" +
                      std::to_string(nextSequence()) + R"(,"t":)" + std::to_string(time) +
                      R"(,"x":)" + std::to_string(x) + R"(,"y":)" + std::to_string(y) +
                      R"(,"orientacao":")" + std::string(1, directionToChar(direction)) +
                      R"(","celulas":)" + std::to_string(cells);
    if (speed.has_value()) {
        msg += R"(,"velocidade_media_mps":)" + num(*speed);
    }
    msg += "}";
    return msg;
}

std::string Encoder::encodeEnergy(int time,         //
                                  double voltage,   //
                                  double amperage,  //
                                  double watts      //
) {
    return R"({"v":1,"tipo":"energia","corrida":")" + run_ + R"(","seq":)" +
           std::to_string(nextSequence()) + R"(,"t":)" + std::to_string(time) + R"(,"tensao_v":)" +
           num(voltage) + R"(,"corrente_a":)" + num(amperage) + R"(,"potencia_w":)" + num(watts) +
           R"(})";
}

std::string Encoder::encodeRunResult(long time, RunResult result) {
    const char* resultStr = (result == RunResult::Success) ? "sucesso" : "falha";
    return R"({"v":1,"tipo":"fim_corrida","corrida":")" + run_ + R"(","seq":)" +
           std::to_string(nextSequence()) + R"(,"t":)" + std::to_string(time) +
           R"(,"resultado":")" + std::string(resultStr) + R"("})";
}

}  // namespace micromouse::protocol
