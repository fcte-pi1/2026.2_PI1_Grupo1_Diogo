#include "protocol/ProtocolV1.hpp"

namespace micromouse::protocol {

Encoder::Encoder(std::string device, std::string token, std::string boot)
    : device_(std::move(device)), token_(std::move(token)), boot_(std::move(boot)) {}

std::string Encoder::encodeHello() const {
    return R"({"tipo":"hello","v":1,"dispositivo":")" + device_ + R"(","token":")" + token_ +
           R"(","boot":")" + boot_ + R"("})";
}

std::string Encoder::encodeStartRun(int runIndex, int time, const std::string& maze) {
    run_ = "r" + boot_ + "-" + std::to_string(runIndex);
    sequence_ = 1;
    return "{\"v\":1,\"tipo\":\"inicio_corrida\",\"corrida\":\"" + run_ +
           "\",\"seq\":1,\"t\":" + std::to_string(time) + ",\"labirinto\":\"" + maze + "\"}";
}

long Encoder::sequence() const noexcept { return sequence_; };

}  // namespace micromouse::protocol
