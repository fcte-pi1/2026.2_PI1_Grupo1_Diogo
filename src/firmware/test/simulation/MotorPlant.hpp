#pragma once

#include <cmath>

#include "controller/PivotMove.hpp"
#include "controller/RobotMotion.hpp"
#include "controller/StraightMove.hpp"
#include "controller/VoltageSlew.hpp"
#include "controller/WheelLoop.hpp"

namespace micromouse::test {

// Roda N20 com redução, em volts no motor:
// - parada, só sai do lugar com |tensão| acima de `breakawayVolts` (atrito estático);
// - andando, velocidade de regime = (|tensão| - frictionVolts) / voltsPerMmPerS, alcançada com
//   constante de tempo `timeConstantS`;
// - o encoder conta pulsos inteiros de 0,375 mm, como o PCNT.
struct MotorWheel {
    double voltsPerMmPerS;  // com a carga do robô no chão
    double frictionVolts;   // atrito andando
    double breakawayVolts;  // atrito para sair do lugar
    double timeConstantS{0.03};
    double speed{0.0};      // mm/s
    double position{0.0};   // mm (contínuo)

    void step(double volts, double dt) {
        if (std::fabs(speed) < 1.0 && std::fabs(volts) < breakawayVolts) {
            speed = 0.0;
            return;
        }
        const double drive = std::fmax(0.0, std::fabs(volts) - frictionVolts) / voltsPerMmPerS;
        const double target = volts >= 0.0 ? drive : -drive;
        speed += (target - speed) * dt / timeConstantS;
        position += speed * dt;
    }
    [[nodiscard]] double encoderMm() const {
        const double pulse = controller::robot::kMmPerPulse;
        return std::floor(position / pulse) * pulse;
    }
};

// Roda "boa" e roda "dura" (a direita de 07/11, que não saía do lugar a ~50%).
inline MotorWheel easyWheel() { return {0.0080, 0.6, 1.0}; }
inline MotorWheel stiffWheel() { return {0.0100, 1.2, 2.5}; }

struct StraightResult {
    double leftMm{0.0};
    double rightMm{0.0};
    double maxDifferenceMm{0.0};
    double maxVolts{0.0};
    double maxRiseVoltsPerS{0.0};  // maior subida do módulo da tensão entre dois passos (V/s)
    double seconds{0.0};
    bool done{false};
};

// Anda uma reta com o laço do adaptador (passo de 2 ms, velocidade pela janela dos encoders).
// `rampVoltsPerS` > 0 liga a rampa de tensão (controller::VoltageSlew) entre o controle e o motor.
inline StraightResult simulateStraight(MotorWheel left, MotorWheel right, double distanceMm,
                                       double offsetMm = 0.0, double limitSeconds = 3.0,
                                       double rampVoltsPerS = 0.0) {
    constexpr double kDt = 0.002;
    controller::StraightMove move(distanceMm, controller::robot::kStraightMove);
    controller::SpeedEstimator leftSpeed;
    controller::SpeedEstimator rightSpeed;
    leftSpeed.reset(0.0, 0.0);
    rightSpeed.reset(0.0, 0.0);
    controller::VoltageSlew leftSlew(rampVoltsPerS);
    controller::VoltageSlew rightSlew(rampVoltsPerS);
    StraightResult result;
    double previousLeft = 0.0;
    double previousRight = 0.0;
    for (double t = kDt; t <= limitSeconds; t += kDt) {
        const double l = left.encoderMm();
        const double r = right.encoderMm();
        controller::StraightMove::Output out = move.step(
            kDt, l, r, leftSpeed.update(l, t), rightSpeed.update(r, t), offsetMm);
        out.leftVolts = leftSlew.step(out.leftVolts, kDt);
        out.rightVolts = rightSlew.step(out.rightVolts, kDt);
        result.maxRiseVoltsPerS = std::fmax(
            result.maxRiseVoltsPerS,
            std::fmax((std::fabs(out.leftVolts) - std::fabs(previousLeft)) / kDt,
                      (std::fabs(out.rightVolts) - std::fabs(previousRight)) / kDt));
        previousLeft = out.leftVolts;
        previousRight = out.rightVolts;
        result.maxDifferenceMm = std::fmax(result.maxDifferenceMm, std::fabs(l - r));
        result.maxVolts =
            std::fmax(result.maxVolts, std::fmax(std::fabs(out.leftVolts), std::fabs(out.rightVolts)));
        if (out.done) {
            result.done = true;
            result.seconds = t;
            break;
        }
        left.step(out.leftVolts, kDt);
        right.step(out.rightVolts, kDt);
    }
    // Depois do freio a roda para onde está.
    result.leftMm = left.position;
    result.rightMm = right.position;
    return result;
}

// Quanto o robô ainda gira depois que o controle do pivô manda frear (graus), medido no chão.
// Medido a 300 °/s (pivô de 16/11); a inércia cai junto com a velocidade do perfil atual.
inline constexpr double kBrakeCoastDeg16Nov = 10.7;
inline constexpr double kPivotSpeed16Nov = 300.0;
inline constexpr double kBrakeCoastDeg =
    kBrakeCoastDeg16Nov * controller::robot::kPivotMove.limits.maxSpeed / kPivotSpeed16Nov;
// O mesmo na curva em arco (kArcTurn), medido em 16/11 (B5d/B5e, 3 vezes de cada lado): ~6,5-7°.
// Medido a 120 °/s; escala com a velocidade do arco atual.
inline constexpr double kArcBrakeCoastDeg16Nov = 6.8;
inline constexpr double kArcSpeed16Nov = 120.0;
inline constexpr double kArcBrakeCoastDeg =
    kArcBrakeCoastDeg16Nov * controller::robot::kArcTurn.limits.maxSpeed / kArcSpeed16Nov;

struct PivotResult {
    double trueDeg{0.0};   // quanto o robô girou de verdade
    double gyroDeg{0.0};   // quanto o giroscópio somou
    double seconds{0.0};
    double maxVolts{0.0};
    double maxRiseVoltsPerS{0.0};  // maior subida do módulo da tensão entre dois passos (V/s)
    bool done{false};
    bool crept{false};
};

// Curva no lugar: o robô gira (vE - vD) / bitola x `slip` (rodas patinando: < 1); o giroscópio lê
// o giro verdadeiro mais `biasDegPerS`. Suspenso (`suspended`), o robô não gira.
inline PivotResult simulatePivot(MotorWheel left, MotorWheel right, double targetDeg,
                                 controller::PivotMove::Direction direction, double slip,
                                 double biasDegPerS, bool suspended = false,
                                 double limitSeconds = 3.0, double rampVoltsPerS = 0.0) {
    constexpr double kDt = 0.002;
    constexpr double kRadToDeg = 57.29577951308232;
    controller::PivotMove move(targetDeg, direction, controller::robot::kPivotMove);
    controller::SpeedEstimator leftSpeed;
    controller::SpeedEstimator rightSpeed;
    leftSpeed.reset(0.0, 0.0);
    rightSpeed.reset(0.0, 0.0);
    controller::VoltageSlew leftSlew(rampVoltsPerS);
    controller::VoltageSlew rightSlew(rampVoltsPerS);
    double previousLeft = 0.0;
    double previousRight = 0.0;
    PivotResult result;
    double trueRate = 0.0;
    for (double t = kDt; t <= limitSeconds; t += kDt) {
        const double l = left.encoderMm();
        const double r = right.encoderMm();
        controller::PivotMove::Output out =
            move.step(kDt, trueRate + biasDegPerS, l, r, leftSpeed.update(l, t),
                      rightSpeed.update(r, t));
        out.leftVolts = leftSlew.step(out.leftVolts, kDt);
        out.rightVolts = rightSlew.step(out.rightVolts, kDt);
        result.maxRiseVoltsPerS = std::fmax(
            result.maxRiseVoltsPerS,
            std::fmax((std::fabs(out.leftVolts) - std::fabs(previousLeft)) / kDt,
                      (std::fabs(out.rightVolts) - std::fabs(previousRight)) / kDt));
        previousLeft = out.leftVolts;
        previousRight = out.rightVolts;
        result.maxVolts =
            std::fmax(result.maxVolts, std::fmax(std::fabs(out.leftVolts), std::fabs(out.rightVolts)));
        if (out.done) {
            result.done = true;
            result.seconds = t;
            // Depois do freio o robô ainda gira: medido em 16/11 no chão, ~10,7° (freou aos 88,4° e
            // parou em ~99°), nos dois pivôs de 90°. O ângulo do giroscópio (`gyroDeg`) é o de
            // quando o controle freou; o giro verdadeiro ganha essa inércia, no sentido do giro.
            if (!suspended) {
                result.trueDeg += std::copysign(kBrakeCoastDeg, result.trueDeg);
            }
            break;
        }
        left.step(out.leftVolts, kDt);
        right.step(out.rightVolts, kDt);
        // Giro com sinal: positivo quando a esquerda vai mais para a frente (curva à direita).
        trueRate = suspended ? 0.0
                             : (left.speed - right.speed) / domain::robot::kWheelTrackMm *
                                   kRadToDeg * slip;
        result.trueDeg += trueRate * kDt;
    }
    result.gyroDeg = move.angle();
    result.crept = move.crept();
    return result;
}

}  // namespace micromouse::test
