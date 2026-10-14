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

// Espelha o maxLength do esquema fim_corrida (protocolo v1).
constexpr std::size_t kMaxDetailChars = 200;

std::string truncateUtf8(const std::string& str, std::size_t maxCodePoints) {
    std::size_t codePoints = 0;
    std::size_t byteIndex = 0;
    while (byteIndex < str.size()) {
        const auto byte = static_cast<unsigned char>(str[byteIndex]);
        // Byte de início (ou caractere ASCII de 1 byte): não é byte de continuação (10xxxxxx)
        if ((byte & 0xC0) != 0x80) {
            if (codePoints == maxCodePoints) {
                return str.substr(0, byteIndex);
            }
            ++codePoints;
        }
        ++byteIndex;
    }
    return str;
}

std::string jsonEscape(const std::string& in) {
    constexpr char kHexDigits[] = "0123456789abcdef";
    std::string out;
    out.reserve(in.size() + 2);
    for (const char c : in) {
        const auto uc = static_cast<unsigned char>(c);
        switch (uc) {
            case '"':
                out += "\\\"";
                break;
            case '\\':
                out += "\\\\";
                break;
            case '\n':
                out += "\\n";
                break;
            case '\r':
                out += "\\r";
                break;
            case '\t':
                out += "\\t";
                break;
            default:
                if (uc < 0x20) {
                    out += "\\u00";
                    out += kHexDigits[(uc >> 4) & 0x0F];
                    out += kHexDigits[uc & 0x0F];
                } else {
                    out += c;
                }
                break;
        }
    }
    return out;
}

}  // namespace

Encoder::Encoder(std::string device, std::string token, std::string boot)
    : device_(std::move(device)), token_(std::move(token)), boot_(std::move(boot)) {}

std::string Encoder::encodeHello() const {
    return R"({"tipo":"hello","versao":1,"dispositivo":")" + device_ + R"(","token":")" + token_ +
           R"(","boot":")" + boot_ + R"("})";
}

std::string Encoder::encodeStartRun(int runIndex, long time, const std::string& maze) {
    run_ = "r" + boot_ + "-" + std::to_string(runIndex);
    sequence_ = 1;
    return R"({"versao":1,"tipo":"inicio_corrida","corrida":")" + run_ + R"(","sequencia":1,"tempo_ms":)" +
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

std::string mazeToString(domain::MazeType maze) {
    switch (maze) {
        case domain::MazeType::Small4x4:
            return "4x4";
        case domain::MazeType::Medium8x4:
            return "8x4";
        case domain::MazeType::Large12x4:
            return "12x4";
        default:
            return "?";
    }
}

std::string directionToString(domain::Direction direction) {
    switch (direction) {
        case domain::Direction::North:
            return "NORTE";
        case domain::Direction::East:
            return "LESTE";
        case domain::Direction::South:
            return "SUL";
        case domain::Direction::West:
            return "OESTE";
        default:
            return "?";
    }
}

std::string Encoder::encodeState(long time,                      //
                                 use_cases::SessionPhase phase  //
) {
    return R"({"versao":1,"tipo":"estado","corrida":")" + run_ + R"(","sequencia":)" +
           std::to_string(nextSequence()) + R"(,"tempo_ms":)" + std::to_string(time) + R"(,"estado":")" +
           phaseToString(phase) + R"("})";
}

std::string Encoder::encodeCell(long time,   //
                                int x,       //
                                int y,       //
                                bool north,  //
                                bool east,   //
                                bool south,  //
                                bool west    //
) {
    return R"({"versao":1,"tipo":"celula","corrida":")" + run_ + R"(","sequencia":)" +
           std::to_string(nextSequence()) + R"(,"tempo_ms":)" + std::to_string(time) + R"(,"x":)" +
           std::to_string(x) + R"(,"y":)" + std::to_string(y) + R"(,"paredes":{"norte":)" +
           boolJson(north) + R"(,"leste":)" + boolJson(east) + R"(,"sul":)" + boolJson(south) +
           R"(,"oeste":)" + boolJson(west) + R"(}})";
}

std::string Encoder::encodePosition(long time,                     //
                                    int x,                        //
                                    int y,                        //
                                    domain::Direction direction,  //
                                    int cells,                    //
                                    std::optional<double> speed   //
) {
    std::string msg = R"({"versao":1,"tipo":"posicao","corrida":")" + run_ + R"(","sequencia":)" +
                      std::to_string(nextSequence()) + R"(,"tempo_ms":)" + std::to_string(time) +
                      R"(,"x":)" + std::to_string(x) + R"(,"y":)" + std::to_string(y) +
                      R"(,"orientacao":")" + directionToString(direction) +
                      R"(","celulas":)" + std::to_string(cells);
    if (speed.has_value()) {
        msg += R"(,"velocidade_media_mps":)" + num(*speed);
    }
    msg += "}";
    return msg;
}

std::string Encoder::encodeEnergy(long time,        //
                                  double voltage,   //
                                  double amperage,  //
                                  double watts      //
) {
    return R"({"versao":1,"tipo":"energia","corrida":")" + run_ + R"(","sequencia":)" +
           std::to_string(nextSequence()) + R"(,"tempo_ms":)" + std::to_string(time) + R"(,"tensao_v":)" +
           num(voltage) + R"(,"corrente_a":)" + num(amperage) + R"(,"potencia_w":)" + num(watts) +
           R"(})";
}

std::string Encoder::encodeRunResult(long time, RunResult result,
                                     std::optional<std::string> message) {
    const char* resultStr = (result == RunResult::Success) ? "sucesso" : "falha";
    std::string msg = R"({"versao":1,"tipo":"fim_corrida","corrida":")" + run_ + R"(","sequencia":)" +
                      std::to_string(nextSequence()) + R"(,"tempo_ms":)" + std::to_string(time) +
                      R"(,"resultado":")" + std::string(resultStr) + R"(")";
    if (message.has_value()) {
        const std::string truncated = truncateUtf8(*message, kMaxDetailChars);
        msg += R"(,"detalhe":")" + jsonEscape(truncated) + R"(")";
    }
    msg += "}";
    return msg;
}

}  // namespace micromouse::protocol
