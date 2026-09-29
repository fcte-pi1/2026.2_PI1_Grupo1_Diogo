# Mapeamento de Pinos do ESP32-S3 (Pinout)

A tabela a seguir apresenta o mapeamento completo de pinos do microcontrolador ESP32-S3, indicando a identificação física, net ports, sentido dos sinais e as respectivas conexões no circuito eletrônico do robô.

|  Pino  | Identificação | Net Port       | Direção | Função e Circuito Conectado                           |
| :----: | :------------ | :------------- | :-----: | :---------------------------------------------------- |
| **1**  | 3V3           | `3V3`          |  Saída  | Barramento lógico de alimentação de 3,3 V             |
| **2**  | 3V3           | `3V3`          |  Saída  | Interligação de 3,3 V para módulos                    |
| **3**  | RST           | —              | Entrada | Reset do microcontrolador (desconectado externamente) |
| **4**  | GPIO4         | `START_BUTTON` | Entrada | Botão de largada com pull-up de 10 kΩ (R4)            |
| **5**  | GPIO5         | `M2_IN2`       |  Saída  | Motor 2 (Esquerdo) - entrada IN4 (DRV8833)            |
| **6**  | GPIO6         | `M2_IN1`       |  Saída  | Motor 2 (Esquerdo) - entrada IN3 (DRV8833)            |
| **7**  | GPIO7         | `DIP_SW1`      | Entrada | Chave seletora DIP switch (Bit 0)                     |
| **8**  | GPIO15        | `M1_IN2`       |  Saída  | Motor 1 (Direito) - entrada IN2 (DRV8833)             |
| **9**  | GPIO16        | `M1_IN1`       |  Saída  | Motor 1 (Direito) - entrada IN1 (DRV8833)             |
| **10** | GPIO17        | `X_ESQ`        |  Saída  | Controle XSHUT do ToF lateral esquerdo                |
| **11** | GPIO18        | `X_FRENTE`     |  Saída  | Controle XSHUT do ToF frontal                         |
| **12** | GPIO8         | `DIP_SW2`      | Entrada | Chave seletora DIP switch (Bit 1)                     |
| **13** | GPIO3         | `X_DIR`        |  Saída  | Controle XSHUT do ToF lateral direito                 |
| **14** | GPIO46        | —              |    —    | Pino livre                                            |
| **15** | GPIO9         | `LED_STATUS`   |  Saída  | LED indicador de estado (resistor R1 de 330 Ω)        |
| **16** | GPIO10        | `LED_DEBUG`    |  Saída  | LED de depuração (resistor R2 de 330 Ω)               |
| **17** | GPIO11        | `BUZZER`       |  Saída  | Transistor BC547 para acionamento do buzzer           |
| **21** | 5V            | `5V`           | Entrada | Alimentação regulada 5 V (step-down MP1584)           |
| **22** | GND           | `GND`          |  Ref.   | Plano de terra comum de referência                    |
| **35** | GPIO38        | `ENC1_A`       | Entrada | Encoder Motor Direito - Canal A (odometria)           |
| **36** | GPIO39        | `ENC1_B`       | Entrada | Encoder Motor Direito - Canal B (sentido)             |
| **37** | GPIO40        | `ENC2_B`       | Entrada | Encoder Motor Esquerdo - Canal B (sentido)            |
| **38** | GPIO41        | `ENC2_A`       | Entrada | Encoder Motor Esquerdo - Canal A (odometria)          |
| **39** | GPIO42        | `INT_MPU`      | Entrada | Interrupção externa da MPU-6050                       |
| **40** | GPIO2         | `SDA`          |   I/O   | Barramento I²C - Linha de Dados                       |
| **41** | GPIO1         | `SCL`          |  Saída  | Barramento I²C - Linha de Clock                       |
| **42** | U0RXD         | `RXD`          | Entrada | Comunicação serial de depuração (UART0)               |
| **43** | U0TXD         | `TXD`          |  Saída  | Comunicação serial de depuração (UART0)               |
| **44** | GND           | `GND`          |  Ref.   | Plano de terra comum                                  |

---

# Endereçamento e Topologia do Barramento I²C

## Tabela de Endereçamento dos Dispositivos

Todos os periféricos I²C compartilham as mesmas linhas de comunicação **SDA (GPIO2)** e **SCL (GPIO1)**. A tabela abaixo detalha as atribuições de endereços no barramento:

| Componente           | Net/Ref   | Função                                       | End. Padrão | End. Operacional | Configuração / Inicialização                            |
| :------------------- | :-------- | :------------------------------------------- | :---------: | :--------------: | :------------------------------------------------------ |
| **INA219**           | `INA219`  | Monitoramento de Tensão e Corrente (Bateria) |   `0x40`    |    **`0x40`**    | Endereço fixo via hardware (pinos A0 e A1 ao GND)       |
| **MPU-6050**         | `MPU6050` | Unidade de Medição Inercial (IMU 6 Eixos)    |   `0x68`    |    **`0x68`**    | Endereço fixo via hardware (pino AD0 ao GND)            |
| **VL53L1X (Esq)**    | `TOF_1`   | Sensor de Proximidade Lateral Esquerdo       |   `0x29`    |    **`0x30`**    | Inicialização sequencial controlada via pino `X_ESQ`    |
| **VL53L1X (Frente)** | `TOF_3`   | Sensor de Proximidade Frontal                |   `0x29`    |    **`0x31`**    | Inicialização sequencial controlada via pino `X_FRENTE` |
| **VL53L1X (Dir)**    | `TOF_2`   | Sensor de Proximidade Lateral Direito        |   `0x29`    |    **`0x32`**    | Inicialização sequencial controlada via pino `X_DIR`    |

---
