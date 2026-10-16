#pragma once

#include "adapters/Encoders.hpp"
#include "adapters/MotorDriver.hpp"
#include "adapters/Mpu6050.hpp"
#include "controller/MotionController.hpp"
#include "domain/Maneuver.hpp"
#include "domain/Odometry.hpp"
#include "domain/Pid.hpp"
#include "ports/MotionPort.hpp"

namespace micromouse::adapters {

// Executa comandos de célula/giro em MALHA FECHADA:
//  - advanceCell: anda 1 célula igualando as rodas pela diferença de pulsos
//    (MotionController, RF-43) e para pela odometria (Odometry).
//  - giros: pivô parando pelo ângulo do giroscópio (Maneuver + IMU, RF-45/46).
class Drv8833MotionAdapter final : public ports::IMotionPort {
private:
    MotorDriver motors_;
    Encoders encoders_;
    Mpu6050& imu_;
    domain::WheelConfig wheels_;
    domain::TurnConfig turnConfig_;
    controller::MotionController straight_;

    void pivot(double degrees);

public:
    Drv8833MotionAdapter(const domain::WheelConfig& wheels,
                         const domain::TurnConfig& turnConfig,
                         const domain::PidGains& straightGains, Mpu6050& imu);
    void begin();
    void advanceCell() override;
    void turnLeft() override;
    void turnRight() override;
    void turnAround() override;
};

}  // namespace micromouse::adapters
