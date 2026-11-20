#include "domain/ArcClearance.hpp"

#include <algorithm>
#include <cmath>

namespace micromouse::domain {
namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr double kStepMm = 2.0;

template <typename Visit>
void forEachEdge(double u0, double u1, double v0, double v1, Visit&& visit) {
    for (double u = u0; u <= u1 + 1e-9; u += kStepMm) {
        visit(u, v0);
        visit(u, v1);
    }
    for (double v = v0; v <= v1 + 1e-9; v += kStepMm) {
        visit(u0, v);
        visit(u1, v);
    }
}

}  // namespace

double arcMinClearanceMm(const ArcBody& body, double lateralMm, double longitudinalMm, double corridorMm,
                         double radiusMm) noexcept {
    const double half = corridorMm / 2.0;
    double worst = 1e9;
    auto check = [&](double px, double py, double fx, double fy, double lx, double ly, double u, double v) {
        const double x = px + u * fx + v * lx;
        const double y = py + u * fy + v * ly;
        double clearance = std::min(x + half, half - y);  // parede da esquerda e parede da frente
        if (x >= half && y <= -half) {
            clearance = std::min(clearance, -std::min(x - half, -half - y));  // dentro do bloco de dentro
        } else if (x < half && y > -half) {
            clearance = std::min(clearance, std::hypot(half - x, y + half));  // distância à quina de dentro
        }
        worst = std::min(worst, clearance);
    };
    for (int degrees = 0; degrees <= 90; ++degrees) {
        const double phi = degrees * kPi / 180.0;
        const double px = radiusMm - radiusMm * std::cos(phi) + lateralMm;
        const double py = -radiusMm + radiusMm * std::sin(phi) + longitudinalMm;
        const double fx = std::sin(phi), fy = std::cos(phi);   // para onde aponta
        const double lx = -std::cos(phi), ly = std::sin(phi);  // para a esquerda
        forEachEdge(-body.rearMm, body.frontMm, -body.halfWidthMm, body.halfWidthMm,
                    [&](double u, double v) { check(px, py, fx, fy, lx, ly, u, v); });
        if (body.leftExtraMm > 0.0) {
            forEachEdge(-body.rearMm, 20.0, body.halfWidthMm, body.halfWidthMm + body.leftExtraMm,
                        [&](double u, double v) { check(px, py, fx, fy, lx, ly, u, v); });
        }
    }
    return worst;
}

ArcWindow arcStartWindow(const ArcBody& body, double corridorMm, double radiusMm) noexcept {
    ArcWindow window;
    bool first = true;
    for (int lat = -30; lat <= 30; lat += 2) {
        for (int lon = -24; lon <= 24; lon += 2) {
            const double clearance = arcMinClearanceMm(body, lat, lon, corridorMm, radiusMm);
            if (clearance < 0.0) continue;
            if (first) {
                window.found = true;
                window.latMinMm = window.latMaxMm = lat;
                first = false;
            }
            window.latMinMm = std::min(window.latMinMm, static_cast<double>(lat));
            window.latMaxMm = std::max(window.latMaxMm, static_cast<double>(lat));
        }
    }
    if (!window.found) return window;
    bool firstLong = true;
    for (int lon = -24; lon <= 24; lon += 1) {
        const double clearance = arcMinClearanceMm(body, 0.0, lon, corridorMm, radiusMm);
        if (clearance < 0.0) continue;
        if (firstLong) {
            window.longMinMm = window.longMaxMm = lon;
            window.bestClearanceMm = clearance;
            window.bestLongMm = lon;
            firstLong = false;
        }
        window.longMinMm = std::min(window.longMinMm, static_cast<double>(lon));
        window.longMaxMm = std::max(window.longMaxMm, static_cast<double>(lon));
        if (clearance > window.bestClearanceMm) {
            window.bestClearanceMm = clearance;
            window.bestLongMm = lon;
        }
    }
    return window;
}

double arcStartPlanOffsetMm(const Calibration& calibration, double corridorMm, double radiusMm) noexcept {
    const double lateral = radiusMm + calibration.frontWidthMm / 2.0;
    const double cornerRadius = std::sqrt(lateral * lateral + calibration.axleToFrontMm * calibration.axleToFrontMm);
    return (corridorMm / 2.0 + radiusMm) - (cornerRadius + calibration.arcClearanceMm);
}

}  // namespace micromouse::domain
