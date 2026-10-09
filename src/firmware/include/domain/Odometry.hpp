#pragma once

namespace micromouse::domain {

struct WheelConfig {
    double wheelDiameterMm{};
    int countsPerRevolution{};
    double cellSizeMm{};
};

class Odometry {
private:
    WheelConfig wheelConfig_;
    long pulses_{0};

public:
    explicit Odometry(const WheelConfig& wheelConfig);

    [[nodiscard]] long pulses() const noexcept;
    [[nodiscard]] double distanceMm() const;
};

}  // namespace micromouse::domain
