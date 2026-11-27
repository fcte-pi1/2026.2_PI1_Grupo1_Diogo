#include <gtest/gtest.h>

#include <string>

#include "domain/ThermalWatch.hpp"

namespace micromouse::domain {
namespace {

ThermalSample sample(double timeS, double espC, double imuC = 40.0, double currentA = 0.1) {
    return ThermalSample{timeS, espC, true, imuC, true, currentA, true};
}

TEST(ThermalWatch, SteadyReadingsRaiseNothing) {
    ThermalWatch watch;
    for (int t = 0; t <= 60; ++t) {
        const ThermalReport report = watch.add(sample(t, 45.0 + 0.2 * (t % 2)));
        EXPECT_EQ(report.active, 0u);
        EXPECT_EQ(report.raised, 0u);
    }
}

TEST(ThermalWatch, FastEspRiseIsRaisedOnceWhileItLasts) {
    ThermalWatch watch;
    for (int t = 0; t <= 10; ++t) (void)watch.add(sample(t, 45.0));
    // +1 grau por segundo (limite: +3 em 10 s): dispara quando a subida chega a 3
    EXPECT_FALSE(watch.add(sample(11, 46.0)).active & kAlarmEspRise);
    EXPECT_FALSE(watch.add(sample(12, 47.0)).active & kAlarmEspRise);
    const ThermalReport first = watch.add(sample(13, 48.0));
    EXPECT_TRUE(first.active & kAlarmEspRise);
    EXPECT_TRUE(first.raised & kAlarmEspRise);
    EXPECT_DOUBLE_EQ(first.espRiseC, 3.0);
    const ThermalReport next = watch.add(sample(14, 49.0));
    EXPECT_TRUE(next.active & kAlarmEspRise);
    EXPECT_FALSE(next.raised & kAlarmEspRise);  // só avisa na subida, não a cada amostra
    EXPECT_DOUBLE_EQ(next.espRiseC, 4.0);
}

TEST(ThermalWatch, SlowWarmUpIsNotARise) {
    ThermalWatch watch;
    // +6 graus em 60 s: aquecimento normal do chip depois de ligar
    for (int t = 0; t <= 60; ++t) {
        const ThermalReport report = watch.add(sample(t, 40.0 + 0.1 * t));
        EXPECT_FALSE(report.active & kAlarmEspRise) << "t=" << t;
    }
}

TEST(ThermalWatch, EspAboveTheLimitIsOverTemperature) {
    ThermalWatch watch;
    EXPECT_FALSE(watch.add(sample(0, 74.0)).active & kAlarmEspHot);
    const ThermalReport report = watch.add(sample(1, 76.0));
    EXPECT_TRUE(report.active & kAlarmEspHot);
    EXPECT_TRUE(report.raised & kAlarmEspHot);
}

TEST(ThermalWatch, ImuRiseIsSeparateFromEsp) {
    ThermalWatch watch;
    for (int t = 0; t <= 10; ++t) (void)watch.add(sample(t, 45.0, 40.0));
    const ThermalReport report = watch.add(sample(12, 45.0, 44.0));
    EXPECT_TRUE(report.active & kAlarmImuRise);
    EXPECT_FALSE(report.active & kAlarmEspRise);
    EXPECT_DOUBLE_EQ(report.imuRiseC, 4.0);
}

TEST(ThermalWatch, CurrentMustStayHighForTheHoldTime) {
    ThermalWatch watch;
    (void)watch.add(sample(0.0, 45.0, 40.0, 0.1));
    EXPECT_FALSE(watch.add(sample(0.1, 45.0, 40.0, 2.0)).active & kAlarmCurrent);  // pico isolado
    EXPECT_FALSE(watch.add(sample(0.3, 45.0, 40.0, 0.1)).active & kAlarmCurrent);
    (void)watch.add(sample(1.0, 45.0, 40.0, 2.0));
    EXPECT_FALSE(watch.add(sample(1.3, 45.0, 40.0, 2.0)).active & kAlarmCurrent);
    const ThermalReport report = watch.add(sample(1.6, 45.0, 40.0, 2.0));  // 0,6 s acima de 1,5 A
    EXPECT_TRUE(report.active & kAlarmCurrent);
    EXPECT_TRUE(report.raised & kAlarmCurrent);
    EXPECT_DOUBLE_EQ(report.currentA, 2.0);
}

TEST(ThermalWatch, InvalidReadingsAreIgnored) {
    ThermalWatch watch;
    for (int t = 0; t <= 10; ++t) (void)watch.add(sample(t, 45.0));
    ThermalSample broken = sample(11, 200.0, 200.0, 9.0);
    broken.espValid = false;
    broken.imuValid = false;
    broken.currentValid = false;
    const ThermalReport report = watch.add(broken);
    EXPECT_EQ(report.active, 0u);
    // e o lixo não entra na janela: a próxima leitura boa compara com 45
    EXPECT_EQ(watch.add(sample(12, 45.5)).active, 0u);
}

TEST(ThermalWatch, AlarmClearsAndCanBeRaisedAgain) {
    ThermalWatch watch;
    EXPECT_TRUE(watch.add(sample(0, 80.0)).raised & kAlarmEspHot);
    const ThermalReport cleared = watch.add(sample(1, 60.0));
    EXPECT_FALSE(cleared.active & kAlarmEspHot);
    EXPECT_TRUE(cleared.cleared & kAlarmEspHot);
    EXPECT_TRUE(watch.add(sample(2, 80.0)).raised & kAlarmEspHot);
}

TEST(ThermalWatch, AlarmNamesForTheLog) {
    char text[96];
    describeThermalAlarms(0, text, sizeof text);
    EXPECT_STREQ(text, "nenhum");
    describeThermalAlarms(kAlarmEspRise | kAlarmCurrent, text, sizeof text);
    EXPECT_STREQ(text, "ESP subindo, corrente alta");
    char tiny[8];
    describeThermalAlarms(kAlarmEspRise | kAlarmImuHot, tiny, sizeof tiny);  // corta sem estourar
    EXPECT_EQ(std::string(tiny).size(), sizeof tiny - 1);
}

}  // namespace
}  // namespace micromouse::domain
