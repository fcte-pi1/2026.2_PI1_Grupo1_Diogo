#pragma once

#include <atomic>
#include <cstddef>
#include <optional>

#include "adapters/Encoders.hpp"
#include "adapters/Ina219.hpp"
#include "adapters/MotorDriver.hpp"
#include "adapters/Mpu6050.hpp"
#include "adapters/Vl53l1xSensorAdapter.hpp"
#include "controller/ArcUndo.hpp"
#include "controller/PivotMove.hpp"
#include "controller/StraightMove.hpp"
#include "domain/BrakeLearner.hpp"
#include "domain/Calibration.hpp"
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
    const std::atomic<bool>* abort_{nullptr};       // parada pedida de fora (comando "parar")
    const Vl53l1xSensorAdapter* front_{nullptr};    // parada pela parede da frente
    double lastShortMm_{0.0};  // quanto a última reta parou antes do fim, pela parede da frente
    double aheadMm_{0.0};      // quanto o robô já está à frente do centro (fim de uma curva em arco)
    double batteryVolts_;
    bool lastMoveOk_{true};
    const char* lastMoveName_{"nenhum"};
    const char* lastMoveFailure_{""};  // por que o último movimento falhou (vazio se não falhou)
    char undoFailure_[112]{};          // texto de "curva travada e o desfazer nao voltou"
    char headingFailure_[64]{};        // texto de "rumo perdido: desviou N graus"
    // Retrato do fim do último movimento, para o motivo de uma falha (corrida na bateria, sem
    // cabo: é o único jeito de saber se as rodas giraram e se os encoders contaram).
    long endLeftCount_{0};
    long endRightCount_{0};
    double endLeftVolts_{0.0};
    double endRightVolts_{0.0};
    bool lastMoveWasTurn_{false};
    double lastTurnDeg_{0.0};  // ângulo da última curva medido pelo giroscópio, depois do freio
    // Erro de rumo acumulado (graus, pelo giroscópio, em relação ao eixo do corredor; positivo = para
    // a esquerda): o que cada curva deixou de girar (ou girou a mais) em relação aos 90 graus, mais
    // o que cada reta girou. A reta seguinte parte dele no `calib ganho_rumo`, para o erro não se
    // acumular de curva em curva (D1 de 18/11: 4 curvas a direita, ~2 graus a menos cada, 8 graus
    // no passo 7). Zera na largada e quando o robô fica parado e some do caminho (mexido à mão).
    double headingResidualDeg_{0.0};
    int64_t lastMoveEndUs_{0};
    bool lastTurnJammed_{false};  // a última curva travou ou esgotou o tempo (vale tentar de novo)
    int gyroMisses_{0};           // leituras seguidas do giroscópio perdidas
    double lastGyroRate_{0.0};
    double gyroBias_{0.0};        // desvio em repouso descontado de cada leitura (graus/s)
    bool gyroBiasMeasured_{false};
    const Ina219* power_{nullptr};  // corrente e tensão nos testes de motor (setPowerMonitor)
    // Contadores da corrida, para o resumo no fim (resetRunCounters() na largada).
    int arcRetriesUsed_{0};
    int frontStops_{0};
    int gyroMissesTotal_{0};
    // Valores trocáveis pelo comando `calib` (16/11) e o autoajuste do freio de cada tipo de curva.
    domain::Calibration calibration_{};
    domain::BrakeLearner arcBrake_{calibration_.arcBrakeDeg, 2.0, 15.0};
    domain::BrakeLearner pivotBrake_{calibration_.pivotBrakeDeg, 2.0, 25.0};
    domain::BrakeLearner oneWheelBrake_{calibration_.oneWheelBrakeDeg, 2.0, 15.0};
    // Curva com uma roda (item 1): onde o eixo começa o giro, antes do centro da célula (mm), pela
    // geometria do corpo em uso. Calculado ao aplicar o `calib` (leva ~1 s); negativo = não cabe.
    double oneWheelTargetMm_{-1.0};
    bool oneWheelActive_{false};  // a curva em andamento é de uma roda (escolhe o freio aprendido)
    [[nodiscard]] controller::PivotMoveConfig oneWheelConfig() const noexcept;
    void oneWheelTurn(controller::PivotMove::Direction direction);

    // kArcTurn e kPivotMove com o freio em uso: o do `calib` ou, com o autoajuste, o aprendido.
    [[nodiscard]] controller::PivotMoveConfig arcConfig() const noexcept;
    [[nodiscard]] controller::PivotMoveConfig pivotConfig() const noexcept;
    // Leitura do frontal com que o arco começa, pela geometria do corpo em uso.
    [[nodiscard]] double arcStartFrontMm() const noexcept;

    void drive(double leftVolts, double rightVolts);
    void stopAndSettle();
    bool aborted();  // a flag de parada está ligada: marca a falha
    void pivot(double degrees, controller::PivotMove::Direction direction,
               const controller::PivotMoveConfig& config);
    void arcTurn(controller::PivotMove::Direction direction);
    void dropStaleHeading();
    void trimArc(controller::PivotMove::Direction direction);
    // Posiciona o robô para o arco começar com o frontal em `frontTargetMm` (ou pelo recuo fixo,
    // sem parede à frente) e confere com uma segunda leitura.
    void positionForArc(double frontTargetMm);
    // Depois de um arco travado: volta de ré pelo mesmo arco até o giroscópio marcar ~0. False se
    // não conseguiu voltar.
    bool undoArc(controller::PivotMove::Direction direction);
    // Medida NOVA do ToF frontal com o robô parado (descarta a que já estava pronta e espera a
    // seguinte). Vazio se não houver distância válida no prazo.
    [[nodiscard]] std::optional<int> settledFrontMm() const;
    // Giroscópio com as leituras perdidas contadas: devolve a última taxa válida numa falha.
    double gyroRate();
    bool gyroLost();  // leituras demais perdidas em seguida: marca a falha
    void logTofAfter(const char* what) const;  // linha "tof" com os 3 sensores, robô parado
    // Reta de `distanceMm` (negativa = para trás); `centerOnWalls` usa o RF-44 se estiver ligado.
    void straight(double distanceMm, const char* name, bool centerOnWalls);

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
    // Valores do comando `calib` (domain::Calibration). O autoajuste do freio recomeça deles.
    void setCalibration(const domain::Calibration& calibration) noexcept;
    [[nodiscard]] const domain::Calibration& calibration() const noexcept { return calibration_; }
    // Freio em uso agora em cada tipo de curva (graus antes do alvo) e quantas curvas já ensinaram.
    [[nodiscard]] double arcBrakeDeg() const noexcept;
    [[nodiscard]] double pivotBrakeDeg() const noexcept;
    [[nodiscard]] double oneWheelBrakeDeg() const noexcept;
    // Leitura do ToF frontal com que o arco começa, pelas medidas do corpo em uso (só para o log).
    [[nodiscard]] double arcStartTargetMm() const noexcept { return arcStartFrontMm(); }
    [[nodiscard]] int brakeTurnsLearned() const noexcept {
        return arcBrake_.learned() + pivotBrake_.learned();
    }
    // Com a flag ligada, o movimento em curso freia na hora e falha ("parado pelo operador"); os
    // seguintes falham logo no começo. Só nos builds de teste (comando "parar" pelo BLE).
    void setAbortFlag(const std::atomic<bool>& flag) noexcept { abort_ = &flag; }
    // Para a reta antes da parede da frente pelo ToF frontal (controller::robot::kFrontStopMm).
    void enableFrontStop(const Vl53l1xSensorAdapter& sensor) noexcept { front_ = &sensor; }
    // Teste sem controle (comando "frente" pelo BLE, builds de teste): as duas rodas com o mesmo
    // comando de PWM (fração em [-1, 1], como no firmware de teste do hardware, com a mesma rampa
    // de 80 ms) por `ms`, e o log "teste" dos pulsos de cada roda a cada 100 ms.
    void openLoopTest(double command, uint32_t ms);
    // Manobras avulsas para teste (comandos pelo BLE, builds de teste), com o robô parado esperando a
    // largada: "virar d|e" (curva completa da corrida), "arco d|e" (só o arco), "pivo d|e" (90° no
    // lugar) e "andar" (uma célula). Cada uma loga a linha "curva" ou "reta".
    // "re" (10/11): uma célula de ré, como na saída de um beco.
    enum class Maneuver {
        None, TurnLeft, TurnRight, ArcLeft, ArcRight, PivotLeft, PivotRight, Advance, Reverse
    };
    void testManeuver(Maneuver maneuver);
    // O laço da corrida chama antes de cada passo do Navigator. Uma falha fica registrada até aqui:
    // num passo, o Navigator faz curva E reta, e a reta não pode apagar a falha da curva (09/11: com
    // o robô suspenso, a curva esgotava o tempo e a corrida seguia como se tivesse virado).
    void clearLastMove() noexcept {
        lastMoveOk_ = true;
        lastMoveFailure_ = "";
    }
    void resetRunCounters() noexcept {
        arcRetriesUsed_ = 0;
        frontStops_ = 0;
        gyroMissesTotal_ = 0;
        headingResidualDeg_ = 0.0;
    }
    [[nodiscard]] int arcRetriesUsed() const noexcept { return arcRetriesUsed_; }
    [[nodiscard]] int frontStops() const noexcept { return frontStops_; }
    [[nodiscard]] int gyroMissesTotal() const noexcept { return gyroMissesTotal_; }
    // Média do giroscópio com o robô parado (graus/s), em `samples` leituras: a deriva. Só log.
    [[nodiscard]] double gyroRestRate(int samples);
    // O mesmo, com a menor e a maior leitura (BRUTAS, sem descontar o desvio): se variam muito, o
    // robô não estava parado.
    struct GyroRest {
        double mean;
        double min;
        double max;
        int valid;
        int missed;
    };
    [[nodiscard]] GyroRest measureGyroRest(int samples);
    // Mede o desvio em repouso e passa a descontá-lo (controller::robot::kGyroRest*). Com o robô
    // PARADO. False se a medida não serviu (o robô se mexeu): continua valendo o desvio anterior.
    // Com `quiet`, não loga (medida de fundo, enquanto o robô espera a largada).
    bool calibrateGyro(int samples, bool quiet = false);
    [[nodiscard]] double gyroBias() const noexcept { return gyroBias_; }
    [[nodiscard]] bool gyroBiasMeasured() const noexcept { return gyroBiasMeasured_; }

    // ---- Testes de hardware (12/11), builds de teste, robô SUSPENSO com as rodas no ar ----
    // Corrente e tensão do INA219 nos testes de motor.
    void setPowerMonitor(const Ina219& power) noexcept { power_ = &power; }
    // Uma roda (ou as duas) com tensão fixa, sem controle, por `ms`: pulsos a cada 100 ms,
    // velocidade no fim, corrente e queda da bateria. Comando "motor e|d|ed <volts> <ms>".
    void wheelTest(bool left, bool right, double volts, uint32_t ms);
    // Varredura das duas rodas nos dois sentidos: tensão em que a roda parte, velocidade e corrente
    // a 3 V e a 6 V, sentido do encoder e se a OUTRA roda contou pulsos. Termina com um veredito.
    // Comando "rodas" (~12 s).
    void wheelSweep();
    // Motores soltos por `seconds`: os pulsos de cada encoder a cada segundo, para girar as rodas
    // à mão (uma volta = 285 pulsos). Comando "enc".
    void encoderWatch(int seconds);
    void readEncoders(long& left, long& right) const;
    void resetEncoders();
    void advanceCell() override;
    void turnLeft() override;
    void turnRight() override;
    void turnAround() override;
    void reverseCell() override;

    // False se algum movimento desde o último clearLastMove() falhou: estourou o tempo limite (motor
    // travado, robô suspenso na curva) ou, na reta, uma roda ficou parada ou não chegou ao fim.
    // Depois de uma falha, os movimentos seguintes do mesmo passo não são feitos. Leva ao Erro.
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
