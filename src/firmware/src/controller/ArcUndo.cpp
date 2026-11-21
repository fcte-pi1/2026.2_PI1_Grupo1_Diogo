#include "controller/ArcUndo.hpp"

#include <cmath>

#include "controller/RobotMotion.hpp"

namespace micromouse::controller {

ArcUndo::ArcUndo(double startAngleDeg, bool rightArc) noexcept
    : ArcUndo(startAngleDeg, rightArc,
              ArcUndoConfig{robot::kArcUndoOuterVolts, robot::kArcUndoInnerVolts, robot::kArcUndoTimeoutS}) {}

ArcUndo::ArcUndo(double startAngleDeg, bool rightArc, const ArcUndoConfig& config) noexcept
    : config_(config),
      startAngle_(startAngleDeg),
      rightArc_(rightArc),
      angle_(startAngleDeg),
      progress_(robot::kTurnStall) {}

ArcUndo::Output ArcUndo::step(double dtSeconds, double gyroDegPerS) noexcept {
    const double outer = -config_.outerVolts;
    const double inner = -config_.innerVolts;
    const double leftVolts = rightArc_ ? outer : inner;
    const double rightVolts = rightArc_ ? inner : outer;

    time_ += dtSeconds;
    angle_ += gyroDegPerS * dtSeconds;
    // Chegou perto de zero, ou passou para o outro lado.
    if (std::fabs(angle_) <= robot::kArcUndoDoneDeg || angle_ * startAngle_ < 0.0) {
        return {0.0, 0.0, State::Done};
    }
    if (time_ > config_.timeoutS) {
        return {0.0, 0.0, State::Timeout};
    }
    // O ângulo se afastou do zero além da tolerância: o desfazer não está desfazendo (robô calçado, ou sentido
    // trocado). Para na hora, em vez de continuar a sacudir as rodas.
    if (std::fabs(angle_) > std::fabs(startAngle_) + robot::kArcUndoWrongWayDeg) {
        return {0.0, 0.0, State::WrongWay};
    }
    // Mesmo critério da curva travada (kTurnStall): menos de 3 graus numa janela de 0,4 s.
    if (progress_.update(time_, angle_)) {
        return {0.0, 0.0, State::NoProgress};
    }
    return {leftVolts, rightVolts, State::Running};
}

}  // namespace micromouse::controller
