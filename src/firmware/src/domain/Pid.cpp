#include "domain/Pid.hpp"

namespace micromouse::domain {

Pid::Pid(const PidGains& gains) : gains_(gains) {}

double Pid::update(double error, double /*dt*/) { return gains_.kp * error; }

}  // namespace micromouse::domain
