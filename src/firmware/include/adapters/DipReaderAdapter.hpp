#pragma once

#include "domain/DipDecoder.hpp"

namespace micromouse::adapters {

class DipReaderAdapter {
private:
    domain::DipDecoder decoder_;

public:
    void begin();
    [[nodiscard]] domain::MazeSetup read() const;
};

}  // namespace micromouse::adapters
