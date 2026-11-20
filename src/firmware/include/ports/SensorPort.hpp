#pragma once

namespace micromouse::ports {

struct WallsAhead {
    bool front{};
    bool left{};
    bool right{};
    // O sensor daquele lado falhou nesta leitura: front/left/right valem "parede" (conservador),
    // mas o mapa NÃO deve guardar essa parede, e o robô não deve avançar por um lado que não viu.
    bool frontUnknown{};
    bool leftUnknown{};
    bool rightUnknown{};
};

class ISensorPort {
public:
    virtual ~ISensorPort() = default;
    [[nodiscard]] virtual WallsAhead sense() const = 0;
    // Leitura com o robô ANDANDO (reta contínua, 20/11): as paredes da célula cujo centro os ToF
    // laterais estão cruzando, com o eixo `axleBehindCenterMm` atrás desse centro (o frontal vê a
    // parede da frente dessa célula mais longe por esse recuo). Não espera medida nova. O padrão é a
    // leitura parada.
    [[nodiscard]] virtual WallsAhead senseMoving(double axleBehindCenterMm) const {
        (void)axleBehindCenterMm;
        return sense();
    }
};

}  // namespace micromouse::ports
