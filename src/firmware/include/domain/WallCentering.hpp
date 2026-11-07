#pragma once

namespace micromouse::domain {

// Centralização pelas paredes laterais (RF-44): converte as leituras dos ToF laterais num erro em
// "pulsos equivalentes", somado ao erro dos encoders do controle de reta (esquerda - direita).
// Ver docs/rf44-centralizacao.md.

// Uma leitura lateral: `valid` só para medida de distância (não "sem alvo" nem falha).
struct SideReading {
    bool valid{false};
    double mm{0.0};
};

struct WallCenteringConfig {
    double centerMm;         // leitura de um ToF lateral com o robô no centro da célula (a medir)
    double useBelowMm;       // só usa uma parede com leitura abaixo disto (a parede da própria célula)
    double gainPulsesPerMm;  // pulsos equivalentes por mm fora do centro
    double maxPulses;        // limite do termo, para a parede não dominar o controle
};

// Positivo: o robô está mais perto da parede DIREITA. Como no erro dos encoders, positivo acelera a
// roda direita e o robô vira para a esquerda, de volta ao centro. Com as duas paredes, usa a
// diferença entre elas (não depende do centerMm); com uma só, a distância a ela comparada com o
// centro; sem nenhuma, 0 (só os encoders).
[[nodiscard]] double wallCenteringError(const SideReading& left, const SideReading& right,
                                        const WallCenteringConfig& config) noexcept;

}  // namespace micromouse::domain
