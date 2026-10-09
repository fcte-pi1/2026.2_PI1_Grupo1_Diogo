#pragma once

namespace micromouse::domain {

struct PidGains {
    double proportionalGain{};  // kp
    double integralGain{};      // ki
    double derivativeGain{};    // kd
};

class Pid {
private:
    PidGains gains_;
    double accumulatedError_{0.0};
    double previousError_{0.0};
    bool hasPreviousError_{false};

public:
    explicit Pid(const PidGains& gains);
    double update(double error, double deltaTimeSeconds);
    void reset() noexcept;
};

}  // namespace micromouse::domain
