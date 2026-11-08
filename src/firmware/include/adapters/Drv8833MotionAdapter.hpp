#pragma once

#include <cstddef>

#include "adapters/Encoders.hpp"
#include "adapters/MotorDriver.hpp"
#include "adapters/Mpu6050.hpp"
#include "adapters/Vl53l1xSensorAdapter.hpp"
#include "controller/MotionController.hpp"
#include "controller/PivotTurn.hpp"
#include "domain/Maneuver.hpp"
#include "domain/Odometry.hpp"
#include "domain/Pid.hpp"
#include "ports/MotionPort.hpp"

namespace micromouse::adapters {

// Executa comandos de célula/giro em MALHA FECHADA:
//  - advanceCell: anda 1 célula igualando as rodas pela diferença de pulsos
//    (MotionController, RF-43) e para pela odometria (Odometry).
//  - giros: pivô parando só pelo ângulo do giroscópio (PivotTurn + IMU, RF-45/46).
class Drv8833MotionAdapter final : public ports::IMotionPort {
private:
    MotorDriver motors_;
    Encoders encoders_;
    Mpu6050& imu_;
    domain::WheelConfig wheels_;
    domain::TurnConfig turnConfig_;
    controller::MotionController straight_;
    const Vl53l1xSensorAdapter* walls_{nullptr};  // RF-44: só com enableWallCentering()
    bool lastMoveOk_{true};
    const char* lastMoveName_{"nenhum"};
    const char* lastMoveFailure_{""};  // por que o último movimento falhou (vazio se não falhou)
    // Retrato do fim do último movimento, para o motivo de uma falha (corrida na bateria, sem
    // cabo: é o único jeito de saber se as rodas giraram e se os encoders contaram).
    long endLeftCount_{0};
    long endRightCount_{0};
    double endLeftCmd_{0.0};
    double endRightCmd_{0.0};
    bool lastMoveWasTurn_{false};
    double lastTurnDeg_{0.0};  // ângulo da última curva medido pelo giroscópio, depois do freio

    void pivot(double degrees, controller::PivotTurn::Direction direction);

public:
    Drv8833MotionAdapter(const domain::WheelConfig& wheels,
                         const domain::TurnConfig& turnConfig,
                         const domain::PidGains& straightGains, double maxCorrection,
                         Mpu6050& imu);
    void begin();
    // RF-44 (opção RATO_CENTRALIZAR_PAREDES, desligada por padrão): na reta, soma ao erro dos
    // encoders o deslocamento lateral lido pelos ToF laterais (docs/rf44-centralizacao.md).
    void enableWallCentering(const Vl53l1xSensorAdapter& sensor) noexcept { walls_ = &sensor; }
    void advanceCell() override;
    void turnLeft() override;
    void turnRight() override;
    void turnAround() override;

    // False se o último movimento falhou: estourou o tempo limite (motor travado, roda solta, robô
    // suspenso sem os encoders contarem) ou, na reta, uma roda ficou parada enquanto a outra
    // andava. O laço da navegação leva ao estado Erro.
    [[nodiscard]] bool lastMoveOk() const noexcept { return lastMoveOk_; }
    // Por que o último movimento falhou: "tempo de 3 s esgotado" ou "roda esquerda parada".
    [[nodiscard]] const char* lastMoveFailure() const noexcept { return lastMoveFailure_; }
    // O último movimento feito ("andar 1 celula", "curva de 90 graus", "meia-volta").
    [[nodiscard]] const char* lastMoveName() const noexcept { return lastMoveName_; }
    // Pulsos de cada encoder e potência mandada a cada motor no fim do último movimento (e, numa
    // curva, o ângulo medido pelo giroscópio).
    void describeLastMove(char* out, size_t size) const;
};

}  // namespace micromouse::adapters
