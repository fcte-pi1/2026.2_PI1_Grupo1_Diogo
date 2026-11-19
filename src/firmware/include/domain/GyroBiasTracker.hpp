#pragma once

#include <algorithm>
#include <cmath>

namespace micromouse::domain {

// Recalibração do desvio do giroscópio com o robô parado (19/11). O desvio medido ao ligar (~0,5 s depois do
// botão) muda com a temperatura e com o tempo (H4: -0,09 graus/s em 3 min, mas o chip é clone). Cada parada
// de uma célula é uma chance de medi-lo de novo: se o robô está mesmo parado (variação baixa) e o valor é
// parecido com o em uso, o desvio em uso anda uma fração do caminho. Um robô ainda balançando depois do
// freio, ou mexido à mão, passa do limite de variação e é descartado.
inline constexpr int kGyroBiasMinSamples = 10;
inline constexpr double kGyroBiasMaxSpreadDps = 3.0;  // o mesmo limite do repouso no boot
inline constexpr double kGyroBiasMaxJumpDps = 5.0;    // além disto é movimento, não desvio
inline constexpr double kGyroBiasBlend = 0.3;         // quanto do medido entra a cada parada

// Janela de leituras brutas do giroscópio (graus/s), sem guardar as amostras.
class GyroBiasWindow {
public:
    void add(double rateDps) noexcept {
        sum_ += rateDps;
        low_ = count_ == 0 ? rateDps : std::min(low_, rateDps);
        high_ = count_ == 0 ? rateDps : std::max(high_, rateDps);
        ++count_;
    }
    void reset() noexcept { *this = GyroBiasWindow{}; }
    [[nodiscard]] int count() const noexcept { return count_; }
    [[nodiscard]] double meanDps() const noexcept { return count_ > 0 ? sum_ / count_ : 0.0; }
    [[nodiscard]] double spreadDps() const noexcept { return count_ > 0 ? high_ - low_ : 0.0; }

private:
    int count_{0};
    double sum_{0.0};
    double low_{0.0};
    double high_{0.0};
};

struct GyroBiasUpdate {
    bool accepted{false};
    double biasDps{0.0};  // o desvio a usar (o atual, se não aceitou)
};

[[nodiscard]] inline GyroBiasUpdate updateGyroBias(double currentBiasDps,
                                                   const GyroBiasWindow& window) noexcept {
    GyroBiasUpdate result{false, currentBiasDps};
    if (window.count() < kGyroBiasMinSamples || window.spreadDps() > kGyroBiasMaxSpreadDps ||
        std::fabs(window.meanDps() - currentBiasDps) > kGyroBiasMaxJumpDps) {
        return result;
    }
    result.accepted = true;
    result.biasDps = currentBiasDps + kGyroBiasBlend * (window.meanDps() - currentBiasDps);
    return result;
}

}  // namespace micromouse::domain
