#pragma once

#include <string>

namespace micromouse::protocol {

class Encoder {
private:
    std::string device_;
    std::string token_;
    std::string boot_;
    std::string run_;
    long sequence_{0};

public:
    Encoder(std::string device, std::string token, std::string boot);
    std::string encodeHello() const;
    [[nodiscard]] std::string encodeStartRun(int runIndex, int time, const std::string& maze);
    [[nodiscard]] long sequence() const noexcept;
};

}  // namespace micromouse::protocol
