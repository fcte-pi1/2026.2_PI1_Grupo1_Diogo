#pragma once

namespace micromouse::ports {

class ISignalPort {
public:
    virtual ~ISignalPort() = default;
    virtual void signalReady() = 0;
    virtual void signalRunning() = 0;
    virtual void signalError() = 0;
    virtual void signalGoal() = 0;  // objetivo cumprido (RF-8)
};

}  // namespace micromouse::ports
