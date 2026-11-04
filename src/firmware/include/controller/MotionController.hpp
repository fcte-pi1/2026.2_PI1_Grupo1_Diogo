#pragma once

#include <limits>

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
    double maxCorrection_;

public:
    // maxCorrection limita o quanto a correção tira de uma roda e dá à outra. Sem limite, um erro
    // grande zera uma roda e o robô gira sobre a outra em vez de seguir reto (teste de 04/11).
    MotionController(const domain::PidGains& gains, double baseSpeed, double maxSpeed,
                     double maxCorrection = std::numeric_limits<double>::infinity());
    [[nodiscard]] WheelSpeeds correct(double error, double deltaTimeSeconds);
    void reset() noexcept;
};

}  // namespace micromouse::controller
