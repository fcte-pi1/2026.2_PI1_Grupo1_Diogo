#include "domain/Pid.hpp"

namespace micromouse::domain {

Pid::Pid(const PidGains& gains) : gains_(gains) {}

double Pid::update(double error, double dt) {
    integral_ += error * dt;
    return gains_.kp * error + gains_.ki * integral_;
}

}  // namespace micromouse::domain
