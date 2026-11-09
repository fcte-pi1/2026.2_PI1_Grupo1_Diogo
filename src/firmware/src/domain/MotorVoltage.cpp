#include "domain/MotorVoltage.hpp"

#include <algorithm>
#include <cmath>

namespace micromouse::domain {

namespace {
// Faixa plausível de uma LiPo 2S (6,0 V já é abaixo do corte do BatteryMonitor; 9,0 V é acima da
// carga máxima de 8,4 V). Fora disso a leitura está errada.
constexpr double kMinPlausibleVolts = 6.0;
constexpr double kMaxPlausibleVolts = 9.0;
}  // namespace

double usableBatteryVolts(double measuredVolts, double nominalVolts) noexcept {
    if (std::isfinite(measuredVolts) && measuredVolts >= kMinPlausibleVolts &&
        measuredVolts <= kMaxPlausibleVolts) {
        return measuredVolts;
    }
    return nominalVolts;
}

double commandForVolts(double volts, double batteryVolts, DecayMode mode) noexcept {
    if (!(batteryVolts > 0.0) || !std::isfinite(volts) || volts == 0.0) {
        return 0.0;
    }
    const double fraction = std::min(std::fabs(volts) / batteryVolts, 1.0);
    const double magnitude = mode == DecayMode::Slow ? fraction : (fraction + 1.0) / 2.0;
    return volts > 0.0 ? magnitude : -magnitude;
}

}  // namespace micromouse::domain
