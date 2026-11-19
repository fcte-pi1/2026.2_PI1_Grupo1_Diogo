#include <gtest/gtest.h>

#include <stdexcept>

#include "domain/SensorHealthMonitor.hpp"

namespace micromouse::domain {

namespace {

TEST(SensorHealthMonitor, HealthySensorNeverFails) {
    SensorHealthMonitor monitor(3);
    for (int i = 0; i < 20; ++i) {
        EXPECT_FALSE(monitor.update(true));
    }
}

TEST(SensorHealthMonitor, IsolatedFailureIsTolerated) {
    SensorHealthMonitor monitor(3);
    EXPECT_FALSE(monitor.update(false));  // um NACK isolado no I²C
    EXPECT_FALSE(monitor.update(true));   // respondeu de novo: zera a contagem
    EXPECT_FALSE(monitor.update(false));
    EXPECT_FALSE(monitor.update(false));
    EXPECT_FALSE(monitor.hasFailed());
}

TEST(SensorHealthMonitor, ConfirmsAfterConsecutiveFailures) {
    SensorHealthMonitor monitor(3);
    EXPECT_FALSE(monitor.update(false));
    EXPECT_FALSE(monitor.update(false));
    EXPECT_TRUE(monitor.update(false));
    EXPECT_TRUE(monitor.hasFailed());
}

TEST(SensorHealthMonitor, ConfirmedFailureStaysUntilReset) {
    SensorHealthMonitor monitor(2);
    (void)monitor.update(false);
    EXPECT_TRUE(monitor.update(false));
    EXPECT_TRUE(monitor.update(true));
    monitor.reset();
    EXPECT_FALSE(monitor.hasFailed());
}

TEST(SensorHealthMonitor, DefaultToleratesTwoFailures) {
    SensorHealthMonitor monitor;
    EXPECT_FALSE(monitor.update(false));
    EXPECT_FALSE(monitor.update(false));
    EXPECT_TRUE(monitor.update(false));
}

TEST(SensorHealthMonitor, RejectsInvalidConfiguration) {
    EXPECT_THROW(SensorHealthMonitor(0), std::invalid_argument);
}

}  // namespace


// ToF direito de 16/11 (3V3 oscilando, 672-732 erros de I2C): o religamento pelo XSHUT só roda com o
// robô PARADO (no sense(), entre passos, ou no comando tofrec). Automático, desiste depois de 3
// reinícios seguidos sem sucesso, para não gastar ~0,3 s por passo com um sensor desligado.
TEST(SensorRecovery, AutomaticRecoveryGivesUpAfterThreeFailedRestarts) {
    EXPECT_TRUE(shouldRestartSensor(/*answers=*/false, /*pollFault=*/false, 0, true));
    EXPECT_TRUE(shouldRestartSensor(false, false, 2, true));
    EXPECT_FALSE(shouldRestartSensor(false, false, 3, true));
    // O comando tofrec tenta sempre.
    EXPECT_TRUE(shouldRestartSensor(false, false, 3, false));
    EXPECT_TRUE(shouldRestartSensor(false, false, 50, false));
    // Sensor que responde e mediu bem não é reiniciado; com a última medida em falha, é.
    EXPECT_FALSE(shouldRestartSensor(true, false, 0, true));
    EXPECT_TRUE(shouldRestartSensor(true, true, 0, true));
}

// O Erro por sensor diz quem falhou (visto em 16/11: "ToF em falha: direito").
TEST(SensorFailureMessage, NamesTheFaultySensorsAndTheSteps) {
    char text[160];
    describeSensorFailure(text, sizeof text, true, true, "ToF em falha: direito");
    EXPECT_STREQ(text, "falha de sensor por 3 passos: ToF em falha: direito");
    describeSensorFailure(text, sizeof text, false, true, "");
    EXPECT_STREQ(text, "falha de sensor por 3 passos: IMU ");
    describeSensorFailure(text, sizeof text, true, false, "ToF em falha: esquerdo frontal");
    EXPECT_STREQ(text, "falha de sensor por 3 passos: INA219 ToF em falha: esquerdo frontal");
}

}  // namespace micromouse::domain
