#pragma once

namespace micromouse::domain {

struct PidGains {
    double kp{};
    double ki{};
    double kd{};
};

class Pid {
public:
    explicit Pid(const PidGains& gains);
    double update(double error, double dt);

private:
    PidGains gains_;
};

}  // namespace micromouse::domain
