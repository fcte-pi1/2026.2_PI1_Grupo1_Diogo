#pragma once

#include <cmath>

#include "controller/PivotMove.hpp"
#include "controller/RobotMotion.hpp"
#include "controller/StraightMove.hpp"
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
    double seconds{0.0};
    bool done{false};
};

// Anda uma reta com o laço do adaptador (passo de 2 ms, velocidade pela janela dos encoders).
inline StraightResult simulateStraight(MotorWheel left, MotorWheel right, double distanceMm,
                                       double offsetMm = 0.0, double limitSeconds = 3.0) {
    constexpr double kDt = 0.002;
    controller::StraightMove move(distanceMm, controller::robot::kStraightMove);
    controller::SpeedEstimator leftSpeed;
    controller::SpeedEstimator rightSpeed;
    leftSpeed.reset(0.0, 0.0);
    rightSpeed.reset(0.0, 0.0);
    StraightResult result;
    for (double t = kDt; t <= limitSeconds; t += kDt) {
        const double l = left.encoderMm();
        const double r = right.encoderMm();
        const controller::StraightMove::Output out = move.step(
            kDt, l, r, leftSpeed.update(l, t), rightSpeed.update(r, t), offsetMm);
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

struct PivotResult {
    double trueDeg{0.0};   // quanto o robô girou de verdade
    double gyroDeg{0.0};   // quanto o giroscópio somou
    double seconds{0.0};
    double maxVolts{0.0};
    bool done{false};
    bool crept{false};
};

// Curva no lugar: o robô gira (vE - vD) / bitola x `slip` (rodas patinando: < 1); o giroscópio lê
// o giro verdadeiro mais `biasDegPerS`. Suspenso (`suspended`), o robô não gira.
inline PivotResult simulatePivot(MotorWheel left, MotorWheel right, double targetDeg,
                                 controller::PivotMove::Direction direction, double slip,
                                 double biasDegPerS, bool suspended = false,
                                 double limitSeconds = 3.0) {
    constexpr double kDt = 0.002;
    constexpr double kRadToDeg = 57.29577951308232;
    controller::PivotMove move(targetDeg, direction, controller::robot::kPivotMove);
    controller::SpeedEstimator leftSpeed;
    controller::SpeedEstimator rightSpeed;
    leftSpeed.reset(0.0, 0.0);
    rightSpeed.reset(0.0, 0.0);
    PivotResult result;
    double trueRate = 0.0;
    for (double t = kDt; t <= limitSeconds; t += kDt) {
        const double l = left.encoderMm();
        const double r = right.encoderMm();
        const controller::PivotMove::Output out =
            move.step(kDt, trueRate + biasDegPerS, l, r, leftSpeed.update(l, t),
                      rightSpeed.update(r, t));
        result.maxVolts =
            std::fmax(result.maxVolts, std::fmax(std::fabs(out.leftVolts), std::fabs(out.rightVolts)));
        if (out.done) {
            result.done = true;
            result.seconds = t;
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
