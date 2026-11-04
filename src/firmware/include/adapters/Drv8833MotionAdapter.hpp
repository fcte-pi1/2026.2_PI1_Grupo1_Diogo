#pragma once

#include <cstddef>

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
    bool lastMoveOk_{true};
    const char* lastMoveName_{"nenhum"};
    // Retrato do fim do último movimento, para o motivo de uma falha (corrida na bateria, sem
    // cabo: é o único jeito de saber se as rodas giraram e se os encoders contaram).
    long endLeftCount_{0};
    long endRightCount_{0};
    double endLeftCmd_{0.0};
    double endRightCmd_{0.0};

    void pivot(double degrees, double leftSpeed, double rightSpeed);

public:
    Drv8833MotionAdapter(const domain::WheelConfig& wheels,
                         const domain::TurnConfig& turnConfig,
                         const domain::PidGains& straightGains, double maxCorrection,
                         Mpu6050& imu);
    void begin();
    void advanceCell() override;
    void turnLeft() override;
    void turnRight() override;
    void turnAround() override;

    // False se o último movimento estourou o tempo limite: a roda não girou (motor travado, roda
    // solta, robô suspenso sem os encoders contarem). O laço da navegação leva ao estado Erro.
    [[nodiscard]] bool lastMoveOk() const noexcept { return lastMoveOk_; }
    // O último movimento feito ("andar 1 celula", "curva de 90 graus", "meia-volta").
    [[nodiscard]] const char* lastMoveName() const noexcept { return lastMoveName_; }
    // Pulsos de cada encoder e potência mandada a cada motor no fim do último movimento.
    void describeLastMove(char* out, size_t size) const;
};

}  // namespace micromouse::adapters
