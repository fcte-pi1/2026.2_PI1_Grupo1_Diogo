#pragma once

namespace micromouse::domain {

struct TurnConfig {
    double wheelDiameterMm{};
    int countsPerRevolution{};
    double wheelTrackMm{};  // distância entre as rodas (bitola)
};

[[nodiscard]] double pulsesForTurn(const TurnConfig& config, double degrees);

// Onde a curva em arco começa (10/11). Com parede à frente NESTA célula, o robô se posiciona pelo
// ToF frontal: recua (ou avança) até ele ler `frontTargetMm`. Sem parede à frente, usa o recuo fixo.
struct ArcStartConfig {
    double frontTargetMm{};   // leitura do frontal no início do arco
    double frontWallMaxMm{};  // até esta leitura, a parede é a desta célula; acima, é a da seguinte
    double fixedSetbackMm{};  // recuo quando não há parede à frente
    double toleranceMm{};     // erro de posição aceito depois de reposicionar
    double maxCorrectionMm{}; // maior ajuste feito pela segunda leitura
};

struct ArcStart {
    double setbackMm{};      // positivo = recuar; negativo = avançar
    bool byFrontWall{false}; // posicionado pelo frontal (vale conferir com uma medida nova)
};

// `frontValid` é falso se o frontal não tem distância válida (falha, incerto, nada ao alcance).
[[nodiscard]] ArcStart arcStart(bool frontValid, double frontMm,
                                const ArcStartConfig& config) noexcept;

// Depois de reposicionar, com uma medida NOVA do frontal (robô parado): quanto ainda falta recuar
// (positivo) ou avançar (negativo). Zero se a medida não vale, se o erro está dentro da tolerância
// ou se a parede já não é a desta célula.
[[nodiscard]] double arcStartCorrection(bool frontValid, double frontMm,
                                        const ArcStartConfig& config) noexcept;

// Curva travada (10/11): o giroscópio parou de girar no meio da curva, com os motores ligados. Antes
// a curva só parava pelo tempo limite de 3 s, com as rodas patinando contra a parede.
struct TurnStallConfig {
    double graceS{};   // no começo da curva, o robô ainda está saindo do lugar: não avalia
    double windowS{};  // janela de observação
    double minDeg{};   // giro mínimo na janela; abaixo disto, a curva travou
};

class TurnStallDetector {
private:
    TurnStallConfig config_;
    bool started_{false};
    double windowStartS_{0.0};
    double windowStartDeg_{0.0};

public:
    explicit TurnStallDetector(const TurnStallConfig& config) noexcept : config_(config) {}
    // Chamar a cada volta do laço, com o tempo desde o começo da curva e o ângulo do giroscópio.
    // True quando a curva travou.
    [[nodiscard]] bool update(double timeS, double angleDeg) noexcept;
};

// Medidas do corpo do robô que decidem se uma manobra cabe na célula. Todas a partir do MEIO DO
// EIXO das rodas, que é o ponto em torno do qual o robô gira.
struct BodyGeometry {
    double axleToFrontMm{};     // do eixo até o ponto mais à frente do chassi
    double halfWidthMm{};       // metade da largura do chassi na parte da frente
    double axleToFrontTofMm{};  // do eixo até a face do ToF frontal
};

namespace detail {
constexpr double sqrtNewton(double value) noexcept {
    double x = value > 1.0 ? value : 1.0;
    for (int i = 0; i < 40; ++i) {
        x = 0.5 * (x + value / x);
    }
    return x;
}
}  // namespace detail

// Raio do círculo que a quina da frente descreve num giro NO LUGAR.
[[nodiscard]] constexpr double pivotCornerRadiusMm(const BodyGeometry& body) noexcept {
    return detail::sqrtNewton(body.axleToFrontMm * body.axleToFrontMm +
                              body.halfWidthMm * body.halfWidthMm);
}

// Raio do círculo que a quina da frente do lado de FORA descreve numa curva em arco de raio
// `turnRadiusMm` (do centro do arco ao meio do eixo).
[[nodiscard]] constexpr double arcOuterCornerRadiusMm(const BodyGeometry& body,
                                                      double turnRadiusMm) noexcept {
    const double lateral = turnRadiusMm + body.halfWidthMm;
    return detail::sqrtNewton(lateral * lateral + body.axleToFrontMm * body.axleToFrontMm);
}

// Leitura do ToF frontal com que o arco deve começar para a quina de fora passar a `clearanceMm`
// da parede da frente.
[[nodiscard]] constexpr double arcStartFrontMm(const BodyGeometry& body, double turnRadiusMm,
                                               double clearanceMm) noexcept {
    return arcOuterCornerRadiusMm(body, turnRadiusMm) + clearanceMm - body.axleToFrontTofMm;
}

class GyroTurnController {
private:
    double targetDeg_;
    double toleranceDeg_;
    double angle_{0.0};

public:
    GyroTurnController(double targetDeg, double toleranceDeg);
    [[nodiscard]] double angle() const noexcept;
    [[nodiscard]] bool reached() const noexcept;
    void integrate(double angularVelDegPerS, double deltaTimeSeconds);
    void reset() noexcept;
};

}  // namespace micromouse::domain
