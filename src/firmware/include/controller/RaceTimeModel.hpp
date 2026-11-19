#pragma once

#include <cstdio>

#include "controller/PivotMove.hpp"
#include "controller/StraightMove.hpp"
#include "controller/TrapezoidProfile.hpp"

namespace micromouse::controller {

// Modelo do tempo de um passo da corrida, a partir dos perfis de movimento (19/11). Os custos fixos
// vêm do D1 de 16/11 (log_robo.txt, linhas "reta:" e "nav: passo"): uma reta longa termina ~0,25 s
// depois do fim do perfil; um movimento curto (recuo, ajuste) espera até 0,3 s para as rodas
// pararem; cada leitura nova do frontal parado leva ~0,15 s.
inline constexpr double kLongMoveOverheadS = 0.25;
inline constexpr double kShortMoveOverheadS = 0.3;
inline constexpr double kFrontSettleS = 0.15;
inline constexpr double kTurnLogAndSettleS = 0.1;
// Distâncias de uma curva em arco (RobotMotion.hpp): recuo de 70 mm, ajuste médio de 26 mm (D1: 6 a
// 30 mm) e meia célula de reta no fim.
inline constexpr double kArcRecuoMm = 70.0;
inline constexpr double kArcAjusteMm = 26.0;
inline constexpr double kArcExitMm = 90.0;
inline constexpr double kCellMm = 180.0;

struct StepTimes {
    double straightStepS;  // um passo de reta de uma célula
    double turnStepS;      // um passo com curva: recuo, ajuste, arco e meia reta
};

// Tempo para o perfil trapezoidal de `distance` chegar à posição `position` (<= distance).
[[nodiscard]] double timeToReach(double position, double distance,
                                 const ProfileLimits& limits) noexcept;

[[nodiscard]] StepTimes stepTimes(const StraightMoveConfig& straight,
                                  const PivotMoveConfig& arc) noexcept;

// Pior caso: `steps` passos, uma fração `turnFraction` deles com curva.
[[nodiscard]] double worstCaseSeconds(int steps, double turnFraction,
                                      const StepTimes& times) noexcept;

// Limite de tempo de segurança da corrida (parada e Erro explícito, já que antes só havia limite de
// passos).
class RaceDeadline {
public:
    explicit RaceDeadline(double limitSeconds) noexcept : limitS_(limitSeconds) {}
    [[nodiscard]] bool expired(double elapsedSeconds) const noexcept {
        return elapsedSeconds > limitS_;
    }
    void describe(char* out, unsigned long size, double elapsedSeconds, int steps,
                  int cells) const noexcept {
        (void)elapsedSeconds;
        std::snprintf(out, size, "tempo limite de %.0f min esgotado: %d passos, %d celulas",
                      limitS_ / 60.0, steps, cells);
    }

private:
    double limitS_;
};

}  // namespace micromouse::controller
