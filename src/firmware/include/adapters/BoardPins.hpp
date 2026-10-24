#pragma once

#include "driver/gpio.h"
#include "sdkconfig.h"

namespace micromouse::adapters::pins {

#if CONFIG_IDF_TARGET_ESP32

// Mapa de BANCADA para o ESP32 clássico (DevKit ESP-WROOM-32), só para testar a
// telemetria enquanto a placa oficial não chega. Não corresponde ao esquemático.
// Evita os GPIO 6-11 (flash SPI) e os 34-39 (só entrada, sem pull-up interno).

// Barramento I²C (pinos padrão do ESP32)
constexpr gpio_num_t kI2cSda = GPIO_NUM_21;
constexpr gpio_num_t kI2cScl = GPIO_NUM_22;

// XSHUT dos VL53L1X
constexpr gpio_num_t kTofFrontXshut = GPIO_NUM_25;
constexpr gpio_num_t kTofLeftXshut = GPIO_NUM_26;
constexpr gpio_num_t kTofRightXshut = GPIO_NUM_27;

// DRV8833 (motor 1 = roda direita, motor 2 = roda esquerda)
constexpr gpio_num_t kMotorLeftIn1 = GPIO_NUM_32;
constexpr gpio_num_t kMotorLeftIn2 = GPIO_NUM_33;
constexpr gpio_num_t kMotorRightIn1 = GPIO_NUM_13;
constexpr gpio_num_t kMotorRightIn2 = GPIO_NUM_14;

// Encoders em quadratura
constexpr gpio_num_t kEncLeftA = GPIO_NUM_16;
constexpr gpio_num_t kEncLeftB = GPIO_NUM_17;
constexpr gpio_num_t kEncRightA = GPIO_NUM_18;
constexpr gpio_num_t kEncRightB = GPIO_NUM_19;

// Interface local
constexpr gpio_num_t kLedReady = GPIO_NUM_2;   // LED azul da DevKit
constexpr gpio_num_t kLedError = GPIO_NUM_4;
constexpr gpio_num_t kBuzzer = GPIO_NUM_12;    // strapping: não ligar carga com pull-up
constexpr bool kBuzzerActiveHigh = true;       // BC547 NPN: nível alto liga (#392)
constexpr gpio_num_t kButton = GPIO_NUM_0;     // botão BOOT da DevKit (pull-up na placa)

// DIP switch (todas abertas = pull-up interno em nível alto)
constexpr gpio_num_t kDip1 = GPIO_NUM_5;
constexpr gpio_num_t kDip2 = GPIO_NUM_15;
constexpr gpio_num_t kDip3 = GPIO_NUM_23;

// Interrupção da MPU-6050 (não usada; o firmware faz polling)
constexpr gpio_num_t kImuInt = GPIO_NUM_39;

#else

// Mapa de pinos do "Rato Borrachudo" (ESP32-S3-N16R8). Ponto único de verdade.

// Barramento I²C (compartilhado: ToF + MPU-6050 + INA219)
constexpr gpio_num_t kI2cSda = GPIO_NUM_2;  // SDA (pino 40)
constexpr gpio_num_t kI2cScl = GPIO_NUM_1;  // SCL (pino 41)

// XSHUT dos VL53L1X (1 GPIO por sensor, para reendereçamento sequencial)
constexpr gpio_num_t kTofFrontXshut = GPIO_NUM_18;  // X_FRENTE (pino 11)
constexpr gpio_num_t kTofLeftXshut = GPIO_NUM_17;   // X_ESQ    (pino 10)
constexpr gpio_num_t kTofRightXshut = GPIO_NUM_3;   // X_DIR    (pino 13, strapping JTAG)

// DRV8833 - convenção do hardware: motor 1 = roda direita, motor 2 = roda esquerda
constexpr gpio_num_t kMotorLeftIn1 = GPIO_NUM_6;    // M2_IN1 (pino 6)
constexpr gpio_num_t kMotorLeftIn2 = GPIO_NUM_5;    // M2_IN2 (pino 5)
constexpr gpio_num_t kMotorRightIn1 = GPIO_NUM_16;  // M1_IN1 (pino 9)
constexpr gpio_num_t kMotorRightIn2 = GPIO_NUM_15;  // M1_IN2 (pino 8)

// Encoders em quadratura (ENC1 = direito, ENC2 = esquerdo)
constexpr gpio_num_t kEncLeftA = GPIO_NUM_41;   // ENC2_A (pino 38)
constexpr gpio_num_t kEncLeftB = GPIO_NUM_40;   // ENC2_B (pino 37)
constexpr gpio_num_t kEncRightA = GPIO_NUM_38;  // ENC1_A (pino 35)
constexpr gpio_num_t kEncRightB = GPIO_NUM_39;  // ENC1_B (pino 36)

// Interface local
constexpr gpio_num_t kLedReady = GPIO_NUM_9;   // LED_STATUS (pino 15)
constexpr gpio_num_t kLedError = GPIO_NUM_10;  // LED_DEBUG  (pino 16)
constexpr gpio_num_t kBuzzer = GPIO_NUM_11;    // BUZZER     (pino 17)
// BC547 NPN em corte-baixo (low-side), como no esquemático: nível alto liga o transistor. O
// buzzer é passivo e toca por PWM (#392). Com um PNP seria o contrário: troque para false.
constexpr bool kBuzzerActiveHigh = true;
constexpr gpio_num_t kButton = GPIO_NUM_4;     // START_BUTTON (pino 4, pull-up externo)

// DIP switch de 3 vias: vias 1 e 2 = tipo de labirinto; via 3 = canto de partida
constexpr gpio_num_t kDip1 = GPIO_NUM_7;   // DIP_SW1 (pino 7)
constexpr gpio_num_t kDip2 = GPIO_NUM_8;   // DIP_SW2 (pino 12)
constexpr gpio_num_t kDip3 = GPIO_NUM_46;  // DIP_SW3 (pino 14, canto de partida)

// Interrupção da MPU-6050 (disponível na placa; o firmware usa polling por ora)
constexpr gpio_num_t kImuInt = GPIO_NUM_42;  // INT_MPU (pino 39)

#endif

}  // namespace micromouse::adapters::pins
