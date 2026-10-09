#pragma once

namespace micromouse::domain {

struct PidGains {
    double kp{};
    double ki{};
    double kd{};
};

class Pid {
private:
    PidGains gains_;
    double integral_{0.0};

public:
    explicit Pid(const PidGains& gains);
    double update(double error, double dt);
};

}  // namespace micromouse::domain
