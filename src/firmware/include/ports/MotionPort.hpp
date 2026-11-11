#pragma once

namespace micromouse::ports {

class IMotionPort {
public:
    virtual ~IMotionPort() = default;
    virtual void advanceCell() = 0;
    virtual void turnLeft() = 0;
    virtual void turnRight() = 0;
    // Giro de 180 graus NO LUGAR. O Navigator não usa mais (10/11): o robô, com o eixo na traseira e
    // a frente longa, não cabe girando no lugar dentro de um corredor. Fica na porta só para testes
    // de manobra em área aberta. Para voltar pelo caminho de onde veio, use reverseCell().
    virtual void turnAround() = 0;
    // Anda UMA célula para trás, sem girar: o robô continua virado para o mesmo lado. É como o
    // Navigator sai de um beco (10/11).
    virtual void reverseCell() = 0;
};

}  // namespace micromouse::ports
