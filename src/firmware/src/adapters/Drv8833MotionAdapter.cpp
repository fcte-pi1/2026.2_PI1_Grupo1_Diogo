#include "adapters/Drv8833MotionAdapter.hpp"

#include <cmath>

#include "domain/SoftStart.hpp"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace micromouse::adapters {

namespace {
uint32_t elapsedMsSince(TickType_t start) {
    return static_cast<uint32_t>((xTaskGetTickCount() - start) * portTICK_PERIOD_MS);
}

constexpr double kBaseSpeed = 0.45;
constexpr double kMaxSpeed = 1.0;
constexpr double kTurnSpeed = 0.40;
constexpr double kTurnToleranceDeg = 2.0;
constexpr double kDeltaTimeSeconds = 0.001;
constexpr TickType_t kControlPeriod = pdMS_TO_TICKS(1);
}  // namespace

Drv8833MotionAdapter::Drv8833MotionAdapter(const domain::WheelConfig& wheels,
                                           const domain::TurnConfig& turnConfig,
                                           const domain::PidGains& straightGains,
                                           Mpu6050& imu)
    : imu_(imu),
      wheels_(wheels),
      turnConfig_(turnConfig),
      straight_(straightGains, kBaseSpeed, kMaxSpeed) {}

void Drv8833MotionAdapter::begin() {
    motors_.begin();
    encoders_.begin();
}

void Drv8833MotionAdapter::advanceCell() {
    domain::Odometry odometry(wheels_);
    encoders_.reset();
    straight_.reset();

    long previousAverage = 0;
    const TickType_t start = xTaskGetTickCount();
    while (odometry.distanceMm() < wheels_.cellSizeMm) {
        const long left = encoders_.left();
        const long right = encoders_.right();
        const long average = (left + right) / 2;
        odometry.onEncoderPulses(average - previousAverage);
        previousAverage = average;

        const double error = static_cast<double>(left - right);
        const controller::WheelSpeeds speeds = straight_.correct(error, kDeltaTimeSeconds);
        // Partida suave: a potência sobe em rampa no começo de cada célula.
        const double ramp = domain::softStartFactor(elapsedMsSince(start));
        motors_.setNormalized(ramp * speeds.left, ramp * speeds.right);
        vTaskDelay(kControlPeriod);
    }
    motors_.brake();
    vTaskDelay(pdMS_TO_TICKS(40));
}

void Drv8833MotionAdapter::pivot(double degrees, double leftSpeed, double rightSpeed) {
    encoders_.reset();
    // Um controlador novo por curva: a referência angular parte de zero a cada manobra, e o erro
    // da deriva do giroscópio não se propaga entre curvas consecutivas (RNF-34).
    domain::GyroTurnController gyro(degrees, kTurnToleranceDeg);
    const double targetPulses = domain::pulsesForTurn(turnConfig_, degrees);
    const TickType_t start = xTaskGetTickCount();

    while (!gyro.reached()) {
        // Partida suave dentro do laço: o giro já é integrado durante a rampa.
        const double ramp = domain::softStartFactor(elapsedMsSince(start));
        motors_.setNormalized(ramp * leftSpeed, ramp * rightSpeed);
        const double turned =
            (std::fabs(encoders_.left()) + std::fabs(encoders_.right())) / 2.0;
        if (turned >= targetPulses) {
            break;
        }
        gyro.integrate(imu_.gyroZDegPerSec(), kDeltaTimeSeconds);
        vTaskDelay(kControlPeriod);
    }
    motors_.brake();
    vTaskDelay(pdMS_TO_TICKS(40));
}

void Drv8833MotionAdapter::turnLeft() { pivot(90.0, -kTurnSpeed, kTurnSpeed); }

void Drv8833MotionAdapter::turnRight() { pivot(90.0, kTurnSpeed, -kTurnSpeed); }

void Drv8833MotionAdapter::turnAround() { pivot(180.0, kTurnSpeed, -kTurnSpeed); }

}  // namespace micromouse::adapters
