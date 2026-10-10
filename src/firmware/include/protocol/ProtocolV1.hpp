#pragma once

#include <string>

namespace micromouse::protocol {

class Encoder {
private:
    std::string device_;
    std::string token_;
    std::string boot_;

public:
    Encoder(std::string device, std::string token, std::string boot);
    std::string encodeHello() const;
};

}  // namespace micromouse::protocol
