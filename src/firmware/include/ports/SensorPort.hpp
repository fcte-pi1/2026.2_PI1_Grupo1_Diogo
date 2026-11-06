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
};

}  // namespace micromouse::ports
