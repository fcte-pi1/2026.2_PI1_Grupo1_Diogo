#include <gtest/gtest.h>

#include <cmath>

#include "controller/RunProfile.hpp"
#include "controller/TrapezoidProfile.hpp"

namespace micromouse::controller {
namespace {

constexpr ProfileLimits kLimits{120.0, 225.0};

// Do repouso, o perfil é o mesmo trapézio de sempre (a reta de uma célula não muda).
TEST(RunProfile, FromRestItIsTheSameTrapezoid) {
    const TrapezoidProfile trapezoid(180.0, kLimits);
    const RunProfile run(180.0, kLimits);
    EXPECT_NEAR(run.duration(), trapezoid.duration(), 1e-9);
    for (double t = 0.0; t <= trapezoid.duration() + 0.1; t += 0.05) {
        EXPECT_NEAR(run.at(t).position, trapezoid.at(t).position, 1e-6) << t;
        EXPECT_NEAR(run.at(t).speed, trapezoid.at(t).speed, 1e-6) << t;
        EXPECT_EQ(run.at(t).finished, trapezoid.at(t).finished) << t;
    }
}

// Três células de uma vez: um só trapézio de 540 mm, com uma só partida e uma só frenagem.
TEST(RunProfile, SeveralCellsAreOneAccelerationAndOneStop) {
    const RunProfile run(540.0, kLimits);
    int stops = 0;
    double previous = 0.0;
    for (double t = 0.01; t < run.duration() - 0.1; t += 0.01) {  // até antes da frenagem final
        const double speed = run.at(t).speed;
        if (speed < 1.0 && previous >= 1.0) {
            ++stops;
        }
        previous = speed;
    }
    EXPECT_EQ(stops, 0);  // não passa por velocidade zero no meio
    EXPECT_NEAR(run.at(run.duration()).position, 540.0, 1e-9);
    EXPECT_LT(run.duration(), 3.0 * RunProfile(180.0, kLimits).duration());  // mais rápido que parar 3 vezes
}

// Em cruzeiro, encurtar o alvo para o centro da célula que está chegando: freia e para lá.
TEST(RunProfile, RetargetWhileCruisingStopsAtTheNewTarget) {
    RunProfile run(540.0, kLimits);
    const double t0 = 1.2;  // já em cruzeiro
    const RunProfile::Sample here = run.at(t0);
    ASSERT_NEAR(here.speed, 120.0, 1e-9);
    const double newTarget = here.position + 59.0;  // os ToF laterais acabaram de passar o centro
    ASSERT_TRUE(run.retarget(newTarget, t0));
    EXPECT_NEAR(run.at(t0).position, here.position, 1e-9);  // continuidade de posição
    EXPECT_NEAR(run.at(t0).speed, here.speed, 1e-9);        // e de velocidade
    EXPECT_NEAR(run.at(run.duration()).position, newTarget, 1e-9);
    EXPECT_TRUE(run.at(run.duration() + 0.01).finished);
    for (double t = t0; t <= run.duration(); t += 0.01) {
        EXPECT_LE(run.at(t).position, newTarget + 1e-9);  // nunca passa do alvo
    }
}

// Alvo perto demais para frear na aceleração permitida: recusa e não muda nada.
TEST(RunProfile, RetargetThatCannotStopInTimeIsRefused) {
    RunProfile run(540.0, kLimits);
    const double t0 = 1.2;
    const double before = run.duration();
    // A 120 mm/s, parar exige 32 mm a 225 mm/s2 (21 mm com a margem de 1,5x): 10 mm não dá.
    EXPECT_FALSE(run.retarget(run.at(t0).position + 10.0, t0));
    EXPECT_DOUBLE_EQ(run.duration(), before);
}

// Estender o alvo também funciona (fase 2: o caminho continua reto além do previsto).
TEST(RunProfile, RetargetFurtherKeepsGoingWithoutStopping) {
    RunProfile run(180.0, kLimits);
    const double t0 = 0.8;
    const RunProfile::Sample here = run.at(t0);
    ASSERT_TRUE(run.retarget(360.0, t0));
    EXPECT_NEAR(run.at(run.duration()).position, 360.0, 1e-9);
    double minSpeed = 1e9;
    for (double t = t0; t < run.duration() - 0.6; t += 0.01) {
        minSpeed = std::fmin(minSpeed, run.at(t).speed);
    }
    EXPECT_GT(minSpeed, here.speed * 0.99);  // não freia no meio
}

}  // namespace
}  // namespace micromouse::controller
