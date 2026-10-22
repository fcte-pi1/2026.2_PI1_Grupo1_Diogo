#include "ports/SignalPort.hpp"

namespace micromouse::test {

class SpySignal final : public ports::ISignalPort {
public:
    int ready{0};
    int running{0};
    int error{0};
    void signalReady() override { ++ready; }
    void signalRunning() override { ++running; }
    void signalError() override { ++error; }
};

}  // namespace micromouse::test
