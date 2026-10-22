#pragma once

namespace micromouse::ports {

class ISignalPort {
public:
    virtual ~ISignalPort() = default;
    virtual void signalReady() = 0;
    virtual void signalRunning() = 0;
    virtual void signalError() = 0;
};

}  // namespace micromouse::ports
