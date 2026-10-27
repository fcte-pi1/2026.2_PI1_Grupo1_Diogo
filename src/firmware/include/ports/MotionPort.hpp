#pragma once

namespace micromouse::ports {

class IMotionPort {
public:
    virtual ~IMotionPort() = default;
    virtual void advanceCell() = 0;
    virtual void turnLeft() = 0;
    virtual void turnRight() = 0;
    virtual void turnAround() = 0;
};

}  // namespace micromouse::ports
