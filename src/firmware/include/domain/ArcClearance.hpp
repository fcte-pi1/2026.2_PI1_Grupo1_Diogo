#pragma once

#include "domain/Calibration.hpp"

namespace micromouse::domain {

// Modelo geométrico da curva em arco numa célula em L (20/11). O robô começa com o eixo `radius` mm antes do centro da
// célula (na borda de entrada), virado para o norte, e percorre um quarto de círculo de raio `radius` em volta do canto de
// dentro, saindo para o leste. Paredes (face interna, a `corridor/2` do centro): a da esquerda, a da frente (norte) e o
// bloco de dentro (o canto das paredes do corredor de entrada e de saída). A conta mostra QUANTO o início do arco pode
// errar: com o robô real (frente 100 mm do eixo, largura 112, cabo à esquerda) a janela é bem mais estreita que a do robô de
// projeto, e é o que travou as curvas da serpentina em 20/11.
// Desvio lateral: + = eixo para a DIREITA (lado de dentro da curva). Longitudinal: + = mais perto da parede da frente.
struct ArcBody {
    double frontMm;      // eixo até a frente
    double rearMm;       // eixo até a traseira
    double halfWidthMm;  // meia largura (maior que a das rodas: os sensores laterais)
    double leftExtraMm;  // o que sobressai a mais na esquerda, na traseira (o cabo da bateria)
};

// Menor folga (mm) entre o robô e as paredes durante o arco; negativa se bate.
[[nodiscard]] double arcMinClearanceMm(const ArcBody& body, double lateralMm, double longitudinalMm,
                                       double corridorMm, double radiusMm) noexcept;

struct ArcWindow {
    bool found{false};
    double latMinMm{0.0}, latMaxMm{0.0};    // desvios laterais em que cabe (com o melhor longitudinal)
    double longMinMm{0.0}, longMaxMm{0.0};  // desvios longitudinais em que cabe (com lateral 0)
    double bestLongMm{0.0};                 // o longitudinal de maior folga (lateral 0)
    double bestClearanceMm{0.0};
};

[[nodiscard]] ArcWindow arcStartWindow(const ArcBody& body, double corridorMm, double radiusMm) noexcept;

// Em que ângulo e em que parede o arco bate pela primeira vez (modelo): o ângulo de travamento diz o que aconteceu.
enum class ArcWall { None, Left, Front, InnerCorner };
struct ArcCollision {
    bool hit{false};
    double angleDeg{0.0};
    ArcWall wall{ArcWall::None};
};
[[nodiscard]] ArcCollision arcFirstCollision(const ArcBody& body, double lateralMm, double longitudinalMm,
                                             double corridorMm, double radiusMm) noexcept;

// Segunda tentativa depois de um arco travado (20/11). Travar ANTES de ~52 graus é bater na parede da frente (começou perto
// demais); depois, na quina de dentro (começou longe demais). O ajuste é de 12 mm e vai para o lado certo: positivo = a leitura
// do frontal no início do arco sobe (começa mais longe da parede da frente). Antes era sempre +12, e na SERPENTINA-3 a 2a
// tentativa cruzou a janela de ~20 mm e bateu na quina.
inline constexpr double kArcRetryShiftMm = 12.0;
inline constexpr double kArcStallFrontWallMaxDeg = 52.0;
[[nodiscard]] inline double arcRetryShiftMm(double stalledAngleDeg) noexcept {
    const double angle = stalledAngleDeg < 0.0 ? -stalledAngleDeg : stalledAngleDeg;
    return angle < kArcStallFrontWallMaxDeg ? kArcRetryShiftMm : -kArcRetryShiftMm;
}

// Onde o plano do firmware coloca o início do arco em relação ao ponto nominal (mm, longitudinal): o eixo fica a
// (raio do canto de fora + folga) da parede da frente. Com `clearance` em mm.
[[nodiscard]] double arcStartPlanOffsetMm(const Calibration& calibration, double corridorMm, double radiusMm) noexcept;

}  // namespace micromouse::domain
