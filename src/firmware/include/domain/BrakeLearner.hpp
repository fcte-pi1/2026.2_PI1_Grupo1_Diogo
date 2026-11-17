#pragma once

#include <algorithm>
#include <cmath>

namespace micromouse::domain {

// Autoajuste do freio das curvas (16/11). A curva freia `brakeDeg()` graus antes do alvo, porque o
// robô ainda gira depois de frear. Quanto ele gira depende do piso, da bateria e da velocidade: em
// 16/11 foram ~7 graus no arco e ~17 no giro no lugar, medidos à mão. Aqui o robô mede sozinho: de
// cada curva que termina bem sai "quanto girou depois do freio" (final - parou), e o freio da
// próxima curva vai para o meio do caminho entre o valor em uso e o medido. Os limites seguram um
// valor absurdo (curva que bateu, leitura ruim).
class BrakeLearner {
private:
    double brakeDeg_;
    double minDeg_;
    double maxDeg_;
    int learned_{0};

public:
    constexpr BrakeLearner(double startDeg, double minDeg, double maxDeg) noexcept
        : brakeDeg_(std::clamp(startDeg, minDeg, maxDeg)), minDeg_(minDeg), maxDeg_(maxDeg) {}

    [[nodiscard]] constexpr double brakeDeg() const noexcept { return brakeDeg_; }
    [[nodiscard]] constexpr int learned() const noexcept { return learned_; }

    // `stopDeg`: ângulo em que o controle freou; `finalDeg`: ângulo depois de o robô parar (os
    // dois em módulo). False se a medida não serviu e nada mudou.
    constexpr bool update(double stopDeg, double finalDeg) noexcept {
        const double coast = finalDeg - stopDeg;
        // Menos de 0 (voltou) ou mais do que o dobro do limite: a curva não foi normal.
        if (!(coast >= 0.0) || coast > 2.0 * maxDeg_) {
            return false;
        }
        brakeDeg_ = std::clamp(0.5 * (brakeDeg_ + coast), minDeg_, maxDeg_);
        ++learned_;
        return true;
    }

    constexpr void reset(double startDeg) noexcept {
        brakeDeg_ = std::clamp(startDeg, minDeg_, maxDeg_);
        learned_ = 0;
    }
};

}  // namespace micromouse::domain
