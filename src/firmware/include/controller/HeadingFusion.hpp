#pragma once

namespace micromouse::controller {

// Rumo da reta pela fusão do giroscópio com os encoders (filtro complementar, 19/11).
// O giroscópio dá a taxa de giro, mas tem desvio e acumula erro com o tempo; os encoders dão o rumo
// pela diferença entre as rodas, sem desvio, mas mentem quando a roda patina. A fusão integra o
// giroscópio e puxa o resultado, devagar (`weight` por segundo), para o rumo dos encoders: o desvio do
// giroscópio fica limitado em ~desvio/peso, e um giro de verdade (que o giroscópio vê e a roda patinando
// não) quase não é perdido se o peso for baixo.
// peso 0 = só o giroscópio (o comportamento de antes).
class HeadingFusion {
public:
    // `gyroRateDegPerS`: taxa do giroscópio; `wheelHeadingDeg`: rumo pelas rodas (graus); retorna o rumo
    // fundido (graus, positivo para a esquerda).
    [[nodiscard]] double step(double gyroRateDegPerS, double wheelHeadingDeg, double dtSeconds,
                              double weightPerS) noexcept {
        heading_ += gyroRateDegPerS * dtSeconds;
        if (weightPerS > 0.0) {
            const double gain = weightPerS * dtSeconds;
            heading_ += (gain < 1.0 ? gain : 1.0) * (wheelHeadingDeg - heading_);
        }
        return heading_;
    }

    void reset() noexcept { heading_ = 0.0; }
    [[nodiscard]] double heading() const noexcept { return heading_; }

private:
    double heading_{0.0};
};

// Rumo pelas rodas (graus, positivo para a esquerda): (direita - esquerda) / bitola. `direction` é +1 para
// frente e -1 de ré (nos dois, `leftMm` e `rightMm` já vêm no sentido do movimento, sempre positivos).
[[nodiscard]] inline double wheelHeadingDeg(double leftMm, double rightMm, double trackMm,
                                            double direction) noexcept {
    constexpr double kRadToDeg = 57.29577951308232;
    return direction * (rightMm - leftMm) / trackMm * kRadToDeg;
}

}  // namespace micromouse::controller
