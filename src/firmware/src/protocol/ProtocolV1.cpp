#include "protocol/ProtocolV1.hpp"

namespace micromouse::protocol {

Encoder::Encoder(std::string device, std::string token, std::string boot)
    : device_(std::move(device)), token_(std::move(token)), boot_(std::move(boot)) {}

std::string Encoder::encodeHello() const {
    return R"({"tipo":"hello","v":1,"dispositivo":")" + device_ + R"(","token":")" + token_ +
           R"(","boot":")" + boot_ + R"("})";
}

}  // namespace micromouse::protocol
