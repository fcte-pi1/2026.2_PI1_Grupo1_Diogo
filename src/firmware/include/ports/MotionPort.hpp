#pragma once

namespace micromouse::ports {

// Quem decide, durante uma reta contínua, se o robô passa de uma célula sem parar (20/11). O trecho que
// chega a uma curva para no centro da célula da curva: a curva é sempre parada (23/11).
class IStraightRunObserver {
public:
    virtual ~IStraightRunObserver() = default;
    // `cellIndex`: 1 = a primeira célula à frente de onde o trecho começou. Chamado antes de o robô
    // passar pelo centro dela, com o eixo `axleBehindCenterMm` atrás do centro (andando: os ToF
    // laterais sobre o centro, ~59 mm; na implementação padrão, parado no centro, 0). true = segue
    // além dela; false = para no centro dela.
    virtual bool continuePast(int cellIndex, double axleBehindCenterMm) = 0;
};

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
    // Reta contínua (20/11): anda até `maxCells` células para a frente SEM parar entre elas. Antes de
    // cada centro de célula pergunta ao observador se continua, e para no centro da célula em que ele
    // disser não (ou na última). Devolve quantas células andou.
    // A implementação padrão anda uma célula por vez, parando, e pergunta parada no centro: o mesmo
    // caminho, sem a continuidade (simuladores e bancada).
    // Ré contínua (20/11): anda `cells` células para trás sem parar entre elas (células já percorridas, conhecidas).
    // O padrão anda uma por vez. Devolve quantas andou.
    virtual int reverseCells(int cells) {
        for (int i = 0; i < cells; ++i) {
            reverseCell();
        }
        return cells;
    }
    virtual int advanceCells(int maxCells, IStraightRunObserver& observer) {
        int moved = 0;
        while (moved < maxCells) {
            advanceCell();
            ++moved;
            if (moved >= maxCells || !observer.continuePast(moved, 0.0)) {
                break;
            }
        }
        return moved;
    }
};

}  // namespace micromouse::ports
