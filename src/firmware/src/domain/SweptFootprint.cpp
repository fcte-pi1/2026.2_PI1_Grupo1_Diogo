#include "domain/SweptFootprint.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

namespace micromouse::domain {

namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr double kHalfCorridorMm = robot::kCorridorWidthMm / 2.0;  // 84
constexpr double kWallMm = 12.0;
constexpr double kFarMm = 400.0;
constexpr double kFrontCornerRadiusMm = 10.0;  // R10 do desenho do chassi (M4)
constexpr double kStepDeg = 0.5;

struct Point {
    double x;
    double y;
};
using Polygon = std::vector<Point>;

Polygon rectangle(double x0, double x1, double y0, double y1) {
    return {{x0, y0}, {x1, y0}, {x1, y1}, {x0, y1}};
}

// Chassi: retângulo da traseira à frente, com as duas quinas da frente arredondadas (R10).
Polygon chassis(const Calibration& c) {
    const double rear = -robot::kAxleToRearMm;
    const double front = std::max(c.axleToFrontMm, c.axleToFrontTofMm);
    const double half = c.frontWidthMm / 2.0;
    Polygon polygon{{rear, -half}, {front - kFrontCornerRadiusMm, -half}};
    for (int i = 1; i <= 6; ++i) {  // quina direita da frente (y < 0)
        const double a = -kPi / 2.0 + (kPi / 2.0) * i / 6.0;
        polygon.push_back({front - kFrontCornerRadiusMm + kFrontCornerRadiusMm * std::cos(a),
                           -half + kFrontCornerRadiusMm + kFrontCornerRadiusMm * std::sin(a)});
    }
    for (int i = 0; i <= 6; ++i) {  // quina esquerda da frente (y > 0)
        const double a = (kPi / 2.0) * i / 6.0;
        polygon.push_back({front - kFrontCornerRadiusMm + kFrontCornerRadiusMm * std::cos(a),
                           half - kFrontCornerRadiusMm + kFrontCornerRadiusMm * std::sin(a)});
    }
    polygon.push_back({rear, half});
    return polygon;
}

// Rodas: diâmetro 32 (16 de cada lado do eixo), da face interna (33,8) à externa (metade da largura
// com rodas), nos dois lados.
std::array<Polygon, 2> wheels(const Calibration& c) {
    const double outer = c.widthWithWheelsMm / 2.0;
    const double inner = outer - robot::kWheelWidthMm;
    const double r = robot::kWheelDiameterMm / 2.0;
    return {rectangle(-r, r, inner, outer), rectangle(-r, r, -outer, -inner)};
}

// Teorema dos eixos separadores para polígonos convexos.
bool overlaps(const Polygon& a, const Polygon& b) {
    for (const Polygon* poly : {&a, &b}) {
        for (std::size_t i = 0; i < poly->size(); ++i) {
            const Point p = (*poly)[i];
            const Point q = (*poly)[(i + 1) % poly->size()];
            const Point axis{-(q.y - p.y), q.x - p.x};
            double minA = 1e300;
            double maxA = -1e300;
            double minB = 1e300;
            double maxB = -1e300;
            for (const Point& v : a) {
                const double d = v.x * axis.x + v.y * axis.y;
                minA = std::min(minA, d);
                maxA = std::max(maxA, d);
            }
            for (const Point& v : b) {
                const double d = v.x * axis.x + v.y * axis.y;
                minB = std::min(minB, d);
                maxB = std::max(maxB, d);
            }
            if (maxA <= minB + 1e-9 || maxB <= minA + 1e-9) {
                return false;  // eixo separador: tocar de raspão não conta
            }
        }
    }
    return true;
}

// Paredes do L (face interna em +-84, espessura 12): direita da entrada, frente (que também é a
// direita da saída), esquerda da entrada (só para trás da abertura) e esquerda da saída.
std::array<Polygon, 4> walls() {
    const double h = kHalfCorridorMm;
    return {rectangle(-kFarMm, h + kWallMm, -h - kWallMm, -h),          // direita da entrada
            rectangle(h, h + kWallMm, -h - kWallMm, kFarMm),            // frente / direita da saída
            rectangle(-kFarMm, -h, h, h + kWallMm),                     // esquerda da entrada
            rectangle(-h - kWallMm, -h, h, kFarMm)};                    // esquerda da saída
}

Polygon moved(const Polygon& polygon, Point pivot, double angleRad, Point origin) {
    const double cs = std::cos(angleRad);
    const double sn = std::sin(angleRad);
    Polygon out;
    out.reserve(polygon.size());
    for (const Point& p : polygon) {
        // p está no referencial do robô com o eixo no zero; o pivô está no referencial do robô.
        const double rx = p.x - pivot.x;
        const double ry = p.y - pivot.y;
        out.push_back({origin.x + pivot.x + rx * cs - ry * sn,
                       origin.y + pivot.y + rx * sn + ry * cs});
    }
    return out;
}

}  // namespace

bool oneWheelTurnClears(const Calibration& calibration, double axleBeforeCenterMm) noexcept {
    const Polygon body = chassis(calibration);
    const std::array<Polygon, 2> wheel = wheels(calibration);
    const std::array<Polygon, 4> wall = walls();
    const Point pivot{0.0, robot::kWheelTrackMm / 2.0};  // roda esquerda, no referencial do robô
    const Point origin{-axleBeforeCenterMm, 0.0};
    for (double deg = 0.0; deg <= 90.0 + 1e-9; deg += kStepDeg) {
        const double rad = deg * kPi / 180.0;
        const std::array<Polygon, 3> parts{moved(body, pivot, rad, origin),
                                           moved(wheel[0], pivot, rad, origin),
                                           moved(wheel[1], pivot, rad, origin)};
        for (const Polygon& part : parts) {
            for (const Polygon& w : wall) {
                if (overlaps(part, w)) {
                    return false;
                }
            }
        }
    }
    return true;
}

OneWheelStartBand oneWheelStartBand(const Calibration& calibration) noexcept {
    OneWheelStartBand band;
    constexpr double kStepMm = 1.0;  // ~1 s no ESP32: calculado uma vez, ao aplicar o `calib`
    for (double d = 0.0; d <= 200.0; d += kStepMm) {
        if (!oneWheelTurnClears(calibration, d)) {
            continue;
        }
        if (!band.found) {
            band.found = true;
            band.minMm = d;
        }
        band.maxMm = d;
    }
    if (band.found) {
        band.exitOffsetMinMm = oneWheelEnd(band.minMm).inwardOffsetMm;
        band.exitOffsetMaxMm = oneWheelEnd(band.maxMm).inwardOffsetMm;
    }
    return band;
}

OneWheelEnd oneWheelEnd(double axleBeforeCenterMm) noexcept {
    // O eixo gira 90 graus em volta da roda esquerda (a T/2 do eixo): termina T/2 além do centro da
    // célula na nova direção e a (d - T/2) do eixo do corredor de saída, d = quanto começou antes do
    // centro. Positivo = para o lado de DENTRO da curva (o da roda que ficou parada).
    const double half = robot::kWheelTrackMm / 2.0;
    return {half, axleBeforeCenterMm - half};
}

double oneWheelStartTargetMm(const Calibration& calibration) noexcept {
    const OneWheelStartBand band = oneWheelStartBand(calibration);
    if (!band.found || band.maxMm - band.minMm < 2.0 * robot::kOneWheelStartMarginMm) {
        return -1.0;  // a curva com uma roda não cabe com estas medidas
    }
    return 0.5 * (band.minMm + band.maxMm);
}

}  // namespace micromouse::domain
