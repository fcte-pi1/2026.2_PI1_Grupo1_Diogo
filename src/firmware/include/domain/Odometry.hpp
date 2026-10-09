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
    void onEncoderPulses(long ticks) noexcept;
    [[nodiscard]] int cellsTraveled() const;
    [[nodiscard]] double averageSpeedMmPerS(double elapsedSeconds) const;
    void reset() noexcept;
};

}  // namespace micromouse::domain
