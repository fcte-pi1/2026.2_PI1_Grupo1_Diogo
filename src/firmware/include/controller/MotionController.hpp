#pragma once

#include "domain/Pid.hpp"

namespace micromouse::controller {

using domain::Pid;
using domain::PidGains;

struct WheelSpeeds {
    double left{};
    double right{};
};

class MotionController {
private:
    Pid pid_;
    double baseSpeed_;
    double maxSpeed_;

public:
    MotionController(const domain::PidGains& gains, double baseSpeed, double maxSpeed);
    [[nodiscard]] WheelSpeeds correct(double error, double deltaTimeSeconds);
    void reset() noexcept;
};

}  // namespace micromouse::controller
