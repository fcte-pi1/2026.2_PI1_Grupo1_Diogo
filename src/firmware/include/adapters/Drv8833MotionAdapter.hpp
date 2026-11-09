#pragma once

#include <cstddef>

#include "adapters/Encoders.hpp"
#include "adapters/MotorDriver.hpp"
#include "adapters/Mpu6050.hpp"
#include "adapters/Vl53l1xSensorAdapter.hpp"
#include "controller/PivotMove.hpp"
#include "controller/StraightMove.hpp"
#include "ports/MotionPort.hpp"

namespace micromouse::adapters {

// Executa os movimentos do Navigator em MALHA FECHADA, com o controle pedindo TENSÃO no motor:
//  - advanceCell: as duas rodas seguem um perfil trapezoidal de 1 célula, cada uma com o seu
//    controle de posição e velocidade (controller::StraightMove), e param no centro da célula;
//  - giros: as rodas seguem um perfil de ângulo e o giroscópio decide o fim
//    (controller::PivotMove).
// A tensão vira PWM pela bateria lida no INA219 (setBatteryVolts) e pelo modo do PWM.
class Drv8833MotionAdapter final : public ports::IMotionPort {
private:
    MotorDriver motors_;
    Encoders encoders_;
    Mpu6050& imu_;
    const Vl53l1xSensorAdapter* walls_{nullptr};  // RF-44: só com enableWallCentering()
    double batteryVolts_;
    bool lastMoveOk_{true};
    const char* lastMoveName_{"nenhum"};
    const char* lastMoveFailure_{""};  // por que o último movimento falhou (vazio se não falhou)
    // Retrato do fim do último movimento, para o motivo de uma falha (corrida na bateria, sem
    // cabo: é o único jeito de saber se as rodas giraram e se os encoders contaram).
    long endLeftCount_{0};
    long endRightCount_{0};
    double endLeftVolts_{0.0};
    double endRightVolts_{0.0};
    bool lastMoveWasTurn_{false};
    double lastTurnDeg_{0.0};  // ângulo da última curva medido pelo giroscópio, depois do freio

    void drive(double leftVolts, double rightVolts);
    void stopAndSettle();
    void pivot(double degrees, controller::PivotMove::Direction direction);

public:
    explicit Drv8833MotionAdapter(Mpu6050& imu);
    void begin();
    // Tensão da bateria para converter volts em PWM; o laço da corrida passa a do INA219 a cada
    // passo. Uma leitura fora da faixa da 2S é trocada pela nominal.
    void setBatteryVolts(double volts) noexcept;
    [[nodiscard]] double batteryVolts() const noexcept { return batteryVolts_; }
    // RF-44 (opção RATO_CENTRALIZAR_PAREDES, desligada por padrão): na reta, soma à diferença entre
    // as rodas o deslocamento lateral lido pelos ToF laterais (docs/rf44-centralizacao.md).
    void enableWallCentering(const Vl53l1xSensorAdapter& sensor) noexcept { walls_ = &sensor; }
    void advanceCell() override;
    void turnLeft() override;
    void turnRight() override;
    void turnAround() override;

    // False se o último movimento falhou: estourou o tempo limite (motor travado, robô suspenso na
    // curva) ou, na reta, uma roda ficou parada enquanto a outra andava. Leva ao estado Erro.
    [[nodiscard]] bool lastMoveOk() const noexcept { return lastMoveOk_; }
    // Por que o último movimento falhou: "tempo de 3 s esgotado" ou "roda esquerda parada".
    [[nodiscard]] const char* lastMoveFailure() const noexcept { return lastMoveFailure_; }
    // O último movimento feito ("andar 1 celula", "curva de 90 graus", "meia-volta").
    [[nodiscard]] const char* lastMoveName() const noexcept { return lastMoveName_; }
    // Pulsos de cada encoder, tensão pedida a cada motor e bateria no fim do último movimento (e,
    // numa curva, o ângulo medido pelo giroscópio).
    void describeLastMove(char* out, size_t size) const;
};

}  // namespace micromouse::adapters
