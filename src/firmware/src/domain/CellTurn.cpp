#include "domain/CellTurn.hpp"

#include <algorithm>
#include <array>
#include <cmath>

#include "domain/RobotParameters.hpp"

namespace micromouse::domain {
namespace {

// Contas em float: no ESP32-S3 o float é feito pela FPU e o double por software (a busca roda no robô, entre dois passos).
constexpr float kPi = 3.14159265F;
constexpr float kFace = 84.0F;    // face interna da parede, a partir do centro da célula
constexpr float kWall = 12.0F;    // espessura da parede e lado do poste
constexpr float kPost = 90.0F;    // centro do poste
constexpr float kCorridorLength = 270.0F;
constexpr float kEdgeStep = 3.0F;     // passo da amostragem do contorno do robô
constexpr float kAngleStep = 2.0F;    // graus
constexpr float kMoveStep = 4.0F;     // mm
constexpr float kExitCheckMm = 60.0F; // quanto entra no corredor de saída na conferência
constexpr float kCableRearToFrontMm = 20.0F;

struct Box {
    float x0, x1, y0, y1;
};

struct Obstacles {
    std::array<Box, 9> box{};
    int count{0};
    void add(const Box& b) { box[static_cast<size_t>(count++)] = b; }
};

// Paredes e postes no referencial da curva à esquerda (rumo antigo +x, saída +y).
Obstacles obstacles(const CellTurnWalls& walls) {
    Obstacles o;
    const float h = kWall / 2.0F;
    for (const float sx : {-1.0F, 1.0F}) {
        for (const float sy : {-1.0F, 1.0F}) {
            o.add({sx * kPost - h, sx * kPost + h, sy * kPost - h, sy * kPost + h});
        }
    }
    if (walls.front) o.add({kFace, kFace + kWall, -kPost, kPost});
    if (walls.exitInner) o.add({-kFace - kWall, -kFace, kPost, kCorridorLength});
    if (walls.exitOuter) o.add({kFace, kFace + kWall, kPost, kCorridorLength});
    if (walls.entrySides) {
        o.add({-kCorridorLength, -kPost, kFace, kFace + kWall});
        o.add({-kCorridorLength, -kPost, -kFace - kWall, -kFace});
    }
    return o;
}

// Distância com sinal de um ponto a uma caixa: positiva fora, negativa dentro (profundidade).
float signedDistance(float px, float py, const Box& b) {
    const float dx = std::max({b.x0 - px, 0.0F, px - b.x1});
    const float dy = std::max({b.y0 - py, 0.0F, py - b.y1});
    if (dx > 0.0F || dy > 0.0F) {
        return std::sqrt(dx * dx + dy * dy);
    }
    return -std::min({px - b.x0, b.x1 - px, py - b.y0, b.y1 - py});
}

struct BodyRect {
    float u0, u1, v0, v1;  // no referencial do robô: u para a frente, v para a esquerda
};

struct Shape {
    std::array<BodyRect, 2> rect{};
    int count{0};
};

// No referencial da curva à esquerda. Na curva à direita o mundo é espelhado (y -> -y), e o cabo, que fica à esquerda do robô,
// passa para o lado -v.
Shape shape(const CellTurnBody& body, bool turnLeft) {
    Shape s;
    s.rect[0] = {static_cast<float>(-body.rearMm), static_cast<float>(body.frontMm), static_cast<float>(-body.halfWidthMm),
                 static_cast<float>(body.halfWidthMm)};
    s.count = 1;
    if (body.cableMm > 0.0) {
        const float a = static_cast<float>(body.halfWidthMm);
        const float b = static_cast<float>(body.halfWidthMm + body.cableMm);
        s.rect[1] = turnLeft ? BodyRect{static_cast<float>(-body.rearMm), kCableRearToFrontMm, a, b}
                             : BodyRect{static_cast<float>(-body.rearMm), kCableRearToFrontMm, -b, -a};
        s.count = 2;
    }
    return s;
}

// Menor folga do robô numa pose (eixo em ax, ay; rumo phi em rad) contra os obstáculos.
float poseClearance(const Shape& s, const Obstacles& o, float ax, float ay, float phi, float reach) {
    const float c = std::cos(phi);
    const float sn = std::sin(phi);
    float worst = 1e9F;
    // Só os obstáculos ao alcance do robô (círculo de raio `reach` em volta do eixo) podem dar a menor folga; os outros ficam
    // de fora da conta (a busca roda no robô).
    std::array<int, 9> near{};
    int nearCount = 0;
    for (int i = 0; i < o.count; ++i) {
        if (signedDistance(ax, ay, o.box[static_cast<size_t>(i)]) < reach + 20.0F) {
            near[static_cast<size_t>(nearCount++)] = i;
        }
    }
    if (nearCount == 0) {
        return 20.0F;  // nada a menos de 20 mm do contorno
    }
    for (int r = 0; r < s.count; ++r) {
        const BodyRect& br = s.rect[static_cast<size_t>(r)];
        // Contorno do retângulo do robô contra cada obstáculo.
        auto visit = [&](float u, float v) {
            const float x = ax + u * c - v * sn;
            const float y = ay + u * sn + v * c;
            for (int k = 0; k < nearCount; ++k) {
                worst = std::min(worst, signedDistance(x, y, o.box[static_cast<size_t>(near[static_cast<size_t>(k)])]));
            }
        };
        for (float u = br.u0; u <= br.u1 + 1e-3F; u += kEdgeStep) {
            visit(u, br.v0);
            visit(u, br.v1);
        }
        for (float v = br.v0; v <= br.v1 + 1e-3F; v += kEdgeStep) {
            visit(br.u0, v);
            visit(br.u1, v);
        }
        // Cantos dos obstáculos dentro do robô (um poste inteiro pode caber dentro do contorno).
        for (int k = 0; k < nearCount; ++k) {
            const Box& b = o.box[static_cast<size_t>(near[static_cast<size_t>(k)])];
            for (const float wx : {b.x0, b.x1}) {
                for (const float wy : {b.y0, b.y1}) {
                    const float dx = wx - ax;
                    const float dy = wy - ay;
                    const float u = dx * c + dy * sn;
                    const float v = -dx * sn + dy * c;
                    if (u > br.u0 && u < br.u1 && v > br.v0 && v < br.v1) {
                        worst = std::min(worst, -std::min({u - br.u0, br.u1 - u, v - br.v0, br.v1 - v}));
                    }
                }
            }
        }
    }
    return worst;
}

float rad(float deg) { return deg * kPi / 180.0F; }

// Folga do movimento inteiro; para assim que ficar abaixo de `stopBelow`.
float maneuverClearance(const Shape& s, const Obstacles& o, float axle, float firstDeg, float diagonal, float stopBelow,
                        float side = 0.0F) {
    float worst = 1e9F;
    float reach = 0.0F;  // raio do robô em volta do eixo
    for (int r = 0; r < s.count; ++r) {
        const BodyRect& br = s.rect[static_cast<size_t>(r)];
        for (const float u : {br.u0, br.u1}) {
            for (const float v : {br.v0, br.v1}) {
                reach = std::max(reach, std::sqrt(u * u + v * v));
            }
        }
    }
    auto check = [&](float ax, float ay, float phiDeg) {
        worst = std::min(worst, poseClearance(s, o, ax, ay + side, rad(phiDeg), reach));
        return worst >= stopBelow;
    };
    for (float a = 0.0F; a < firstDeg; a += kAngleStep) {
        if (!check(axle, 0.0F, a)) return worst;
    }
    if (!check(axle, 0.0F, firstDeg)) return worst;
    const float dirX = std::cos(rad(firstDeg));
    const float dirY = std::sin(rad(firstDeg));
    for (float d = kMoveStep; d < diagonal; d += kMoveStep) {
        if (!check(axle + d * dirX, d * dirY, firstDeg)) return worst;
    }
    const float x1 = axle + diagonal * dirX;
    const float y1 = diagonal * dirY;
    for (float a = firstDeg; a < 90.0F; a += kAngleStep) {
        if (!check(x1, y1, a)) return worst;
    }
    for (float d = 0.0F; d <= kExitCheckMm + 1e-3F; d += 6.0F) {
        if (!check(x1, y1 + d, 90.0F)) return worst;
    }
    return worst;
}

}  // namespace

CellTurnBody cellTurnBody(const Calibration& calibration) noexcept {
    return {std::max(calibration.axleToFrontMm, calibration.axleToFrontTofMm), robot::kAxleToRearMm,
            calibration.frontWidthMm / 2.0, calibration.cableLeftMm};
}

double cellTurnClearanceMm(const CellTurnBody& body, bool turnLeft, const CellTurnWalls& walls, double axleMm,
                           double firstTurnDeg, double diagonalMm, double entryLateralMm) noexcept {
    return maneuverClearance(shape(body, turnLeft), obstacles(walls), static_cast<float>(axleMm),
                             static_cast<float>(firstTurnDeg), static_cast<float>(diagonalMm), -1e9F,
                             static_cast<float>(entryLateralMm));
}

CellTurnPlan planCellTurn(const CellTurnBody& body, bool turnLeft, const CellTurnWalls& walls, double marginMm,
                          double maxBetaDeg, double entryUncertaintyMm) noexcept {
    const Shape s = shape(body, turnLeft);
    const Obstacles o = obstacles(walls);
    const float uncertainty = static_cast<float>(std::max(entryUncertaintyMm, 0.0));
    CellTurnPlan best;
    float bestRobust = 0.0F;  // só aceita planos que cabem (folga >= 0) no pior caso do desvio de entrada
    // Folga no pior caso do desvio lateral de entrada (o robô entra numa célula aberta sem saber onde está de lado): avalia o lado
    // mais perigoso primeiro e corta assim que não pode mais ganhar do melhor plano já achado.
    auto robust = [&](float axle, float first, float diagonal, float stopBelow) {
        float worst = maneuverClearance(s, o, axle, first, diagonal, stopBelow, uncertainty);
        if (worst < stopBelow) return worst;
        worst = std::min(worst, maneuverClearance(s, o, axle, first, diagonal, stopBelow, 0.0F));
        if (worst < stopBelow) return worst;
        return std::min(worst, maneuverClearance(s, o, axle, first, diagonal, stopBelow, -uncertainty));
    };
    for (float beta = 0.0F; beta <= static_cast<float>(maxBetaDeg) + 1e-3F; beta += 5.0F) {
        const float first = 90.0F - beta;
        // Saída no meio do corredor ou até 10 mm para o lado de dentro (a reta seguinte, com as paredes do corredor, corrige).
        for (const float lateral : {0.0F, 5.0F, 10.0F}) {
            if (beta == 0.0F && lateral != 0.0F) continue;
            for (float axle = 0.0F; axle >= -60.0F; axle -= 2.0F) {  // do centro para trás (a parede da frente corta os primeiros)
                float diagonal = 0.0F;
                if (beta > 0.0F) {
                    diagonal = (-lateral - axle) / std::sin(rad(beta));  // x1 = axle + diagonal * sin(beta) = -lateral
                    if (diagonal < 5.0F || diagonal > 200.0F) continue;  // diagonal ~0 é o giro simples
                }
                const float clearance = robust(axle, first, diagonal, bestRobust);
                if (clearance < 0.0F || (best.found && clearance <= bestRobust)) continue;
                best.found = true;
                best.axleMm = axle;
                best.firstTurnDeg = first;
                best.diagonalMm = diagonal;
                best.exitLateralMm = beta > 0.0F ? lateral : -axle;  // giro simples: sai deslocado o quanto o eixo recuou
                best.exitAheadMm = diagonal * std::sin(rad(first));
                best.clearanceMm = clearance;
                bestRobust = clearance;
            }
        }
    }
    // Abaixo da folga desejada o plano ainda vale se couber (>= 0): quem decide usá-lo é o firmware, com o log da folga.
    (void)marginMm;
    return best;
}

}  // namespace micromouse::domain
