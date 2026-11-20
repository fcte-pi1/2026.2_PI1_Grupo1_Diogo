#include <gtest/gtest.h>

#include <cstdlib>

#include "controller/OffsetFilter.hpp"
#include "simulation/MotorPlant.hpp"

namespace micromouse::controller {
namespace {

// O termo da parede (RF-44) chegava à reta em DEGRAUS a cada leitura do ToF (a cada 30 ms, com ruído, e com o ToF
// direito a 7-13 mm do limite de alcance alternando entre válido e "perto"). Cada degrau desloca o alvo de uma roda
// para a frente e o da outra para trás, e a roda dava um tranco: no E15 de 20/11, a velocidade ia de 0 a 270 mm/s e
// voltava a 0 a cada ~0,4 s com a referência em 120 mm/s.

TEST(OffsetFilter, AStepIsFollowedSmoothlyAndSettles) {
    OffsetFilter filter(0.3, 1000.0);
    double value = 0.0;
    value = filter.step(10.0, 0.01);
    EXPECT_LT(value, 1.0);   // 1/31 do degrau no primeiro passo, e não 10 de uma vez
    for (int i = 0; i < 300; ++i) {
        value = filter.step(10.0, 0.01);
    }
    EXPECT_NEAR(value, 10.0, 0.05);
}

TEST(OffsetFilter, TheRateOfChangeIsLimited) {
    OffsetFilter filter(0.05, 20.0);  // filtro rápido, mas no máximo 20 mm/s
    double previous = 0.0;
    for (int i = 0; i < 50; ++i) {
        const double value = filter.step(50.0, 0.01);
        EXPECT_LE(value - previous, 20.0 * 0.01 + 1e-9);
        previous = value;
    }
}

TEST(OffsetFilter, AlternatingNoiseBarelyMovesTheOutput) {
    OffsetFilter filter(0.3, 1000.0);
    double lo = 1e9, hi = -1e9;
    for (int i = 0; i < 600; ++i) {
        const double target = (i / 3) % 2 == 0 ? 8.0 : -8.0;  // +-8 mm a cada 30 ms
        const double value = filter.step(target, 0.01);
        if (i > 200) {
            lo = std::fmin(lo, value);
            hi = std::fmax(hi, value);
        }
    }
    EXPECT_LT(hi - lo, 4.0);  // de 16 mm de oscilação de entrada a menos de 4 mm na saída
}

TEST(OffsetFilter, ResetGoesBackToZero) {
    OffsetFilter filter(0.3, 1000.0);
    for (int i = 0; i < 100; ++i) (void)filter.step(10.0, 0.01);
    filter.reset();
    EXPECT_DOUBLE_EQ(filter.value(), 0.0);
}

// No simulador, com o ruído e o ganho do E15 (leitura +-5 mm x 1,76 mm/mm de offset), a velocidade das rodas no
// meio da reta fica perto do cruzeiro com o filtro e oscila muito sem ele.
double cruiseRipple(bool filtered, double* minSpeed, double* maxSpeed) {
    constexpr double kDt = 0.002;
    test::MotorWheel left = test::realLeftWheel();
    test::MotorWheel right = test::realRightWheel();
    StraightMove move(540.0, robot::kStraightMove);
    SpeedEstimator ls, rs;
    ls.reset(0, 0);
    rs.reset(0, 0);
    VoltageSlew sl(50), sr(50);
    OffsetFilter filter(robot::kWallOffsetTauS, robot::kWallOffsetMaxRateMmPerS);
    std::srand(7);
    double offset = 0.0, nextPoll = 0.0;
    *minSpeed = 1e9;
    *maxSpeed = 0.0;
    for (double t = kDt; t < 8.0; t += kDt) {
        const double l = left.encoderMm(), r = right.encoderMm();
        if (t >= nextPoll) {
            nextPoll += 0.03;
            offset = 1.76 * (5.0 * (2.0 * std::rand() / RAND_MAX - 1.0));
        }
        const double applied = filtered ? filter.step(offset, kDt) : offset;
        StraightMove::Output out = move.step(kDt, l, r, ls.update(l, t), rs.update(r, t), applied);
        out.leftVolts = sl.step(out.leftVolts, kDt);
        out.rightVolts = sr.step(out.rightVolts, kDt);
        if (out.done) break;
        left.step(out.leftVolts, kDt);
        right.step(out.rightVolts, kDt);
        const double travelled = 0.5 * (left.position + right.position);
        if (travelled > 80 && travelled < 460) {
            *minSpeed = std::fmin(*minSpeed, std::fmin(left.speed, right.speed));
            *maxSpeed = std::fmax(*maxSpeed, std::fmax(left.speed, right.speed));
        }
    }
    return *maxSpeed - *minSpeed;
}

TEST(OffsetFilterSimulation, TheWallTermNoLongerMakesTheWheelsJerk) {
    double rawMin = 0, rawMax = 0, smoothMin = 0, smoothMax = 0;
    const double raw = cruiseRipple(false, &rawMin, &rawMax);
    const double smooth = cruiseRipple(true, &smoothMin, &smoothMax);
    EXPECT_GT(raw, 100.0);          // sem filtro: 47 a 196 mm/s
    EXPECT_GT(smoothMin, 100.0);    // com filtro: nenhuma roda perto de parar
    EXPECT_LT(smoothMax, 145.0);    // e nenhum arranco
    EXPECT_LT(smooth, 0.4 * raw);
}

}  // namespace
}  // namespace micromouse::controller
