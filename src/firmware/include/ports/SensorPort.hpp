#pragma once

namespace micromouse::ports {

struct WallsAhead {
    bool front{};
    bool left{};
    bool right{};
};

class ISensorPort {
public:
    virtual ~ISensorPort() = default;
    [[nodiscard]] virtual WallsAhead sense() const = 0;
};

}  // namespace micromouse::ports
