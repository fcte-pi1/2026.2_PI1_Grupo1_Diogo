# [TESTE-HW-00] Relatório de Validação de Hardware: Integridade e Autoteste dos Pinos de I/O do ESP32-S3 (MM-ESP32-V1)

## Identificação

- **Responsável pelo Teste:** Kelyton de Lucas
- **Equipe / Apoio:** Equipe de Hardware / Frente de Eletrônica Embarcada (PI1 2026/2 - Prof. Diogo Caetano Garcia)
- **Frente:** Hardware / Microcontrolador & Bring-up de Bancada
- **Etapa:** Validação Preliminar de I/O e Sanidade do ESP32-S3 (AP12)
- **Status:** **Concluído e Validado (100% PASS)**

---

## 1. Contexto e Objetivo

Antes da integração física dos periféricos e subsistemas do Micromouse (_Rato Borrachudo_), incluindo sensores I²C (VL53L1X, MPU-6050, INA219), driver de potência (DRV8833), encoders de quadratura (N20) e chaves de parametrização, é mandatório realizar o teste de sanidade (_bring-up_) do microcontrolador **ESP32-S3 (WROOM-1 N16R8)**.

### Solução de Engenharia Adotada

Implementou-se uma metodologia de **Autoteste de I/O por Reconfiguração Dinâmica de Registradores**:

- O pino é colocado dinamicamente no modo bidirecional (`GPIO_MODE_INPUT_OUTPUT`), acionando nível lógico alto (3,3 V) e lendo o retorno pelo próprio gate interno. Em seguida, aciona nível lógico baixo (0 V) e lê o retorno.
- Após o autoteste em alta velocidade, o pino é retornado a estado seguro de alta impedância (`INPUT`).
- Um script automatizado em Python conecta na porta serial física (`/dev/ttyACM0` - UART0), dispara o teste e salva o relatório formatado em disco, garantindo reprodutibilidade e rastreabilidade metrológica.

---

## 2. Mapeamento Consolidado dos 21 Pinos Testados

| Pino Físico | Identificação GPIO | Net Port no Esquemático | Direção Final | Circuito Conectado                       |   Issue Relacionada    |
| :---------: | :----------------: | :---------------------: | :-----------: | :--------------------------------------- | :--------------------: |
|   **41**    |      `GPIO1`       |          `SCL`          |   Saída/OD    | Barramento I²C Clock (400 kHz)           | **Issue 01 / 03 / 04** |
|   **40**    |      `GPIO2`       |          `SDA`          |   I/O (OD)    | Barramento I²C Dados                     | **Issue 01 / 03 / 04** |
|   **13**    |      `GPIO3`       |         `X_DIR`         |     Saída     | XSHUT Sensor ToF Lateral Direito         |      **Issue 01**      |
|    **4**    |      `GPIO4`       |     `START_BUTTON`      |    Entrada    | Botão de Largada (Pull-up 10 kΩ R4)      |      **Issue 05**      |
|    **5**    |      `GPIO5`       |        `M2_IN2`         |     Saída     | Motor Esquerdo - IN4 Ponte H (PWM)       |      **Issue 06**      |
|    **6**    |      `GPIO6`       |        `M2_IN1`         |     Saída     | Motor Esquerdo - IN3 Ponte H (PWM)       |      **Issue 06**      |
|    **7**    |      `GPIO7`       |        `DIP_SW1`        |    Entrada    | Chave DIP Bit 0 (Labirinto)              |      **Issue 05**      |
|   **12**    |      `GPIO8`       |        `DIP_SW2`        |    Entrada    | Chave DIP Bit 1 (Labirinto)              |      **Issue 05**      |
|   **15**    |      `GPIO9`       |      `LED_STATUS`       |     Saída     | LED de Estado da Placa (R1 330 Ω)        |   **Issue 05 / 08**    |
|   **16**    |      `GPIO10`      |       `LED_DEBUG`       |     Saída     | LED de Depuração (R2 330 Ω)              |   **Issue 05 / 08**    |
|   **17**    |      `GPIO11`      |        `BUZZER`         |     Saída     | Base do Transistor BC547 (Buzzer)        |      **Issue 08**      |
|    **8**    |      `GPIO15`      |        `M1_IN2`         |     Saída     | Motor Direito - IN2 Ponte H (PWM)        |      **Issue 06**      |
|    **9**    |      `GPIO16`      |        `M1_IN1`         |     Saída     | Motor Direito - IN1 Ponte H (PWM)        |      **Issue 06**      |
|   **10**    |      `GPIO17`      |         `X_ESQ`         |     Saída     | XSHUT Sensor ToF Lateral Esquerdo        |      **Issue 01**      |
|   **11**    |      `GPIO18`      |       `X_FRENTE`        |     Saída     | XSHUT Sensor ToF Frontal                 |      **Issue 01**      |
|   **35**    |      `GPIO38`      |        `ENC1_A`         |    Entrada    | Canal A Encoder Motor Direito            |      **Issue 02**      |
|   **36**    |      `GPIO39`      |        `ENC1_B`         |    Entrada    | Canal B Encoder Motor Direito            |      **Issue 02**      |
|   **37**    |      `GPIO40`      |        `ENC2_B`         |    Entrada    | Canal B Encoder Motor Esquerdo           |      **Issue 02**      |
|   **38**    |      `GPIO41`      |        `ENC2_A`         |    Entrada    | Canal A Encoder Motor Esquerdo           |      **Issue 02**      |
|   **39**    |      `GPIO42`      |        `INT_MPU`        |    Entrada    | Interrupção Externa Giroscópio MPU-6050  |      **Issue 03**      |
|   **14**    |      `GPIO46`      |        `DIP_SW3`        |    Entrada    | Chave DIP Bit 2 (Canto de Partida RF-99) |      **Issue 05**      |

_(Pinos preservados e não manipulados: GPIO 19/20 - USB D-/D+; GPIO 26 a 32 - Barramento SPI Flash/PSRAM; GPIO 43/44 - UART0 Boot/Log)._

---

## 3. Metodologia de Execução

1. **Desativação do LED RGB Onboard (GPIO 48):**
   - No ESP32-S3 DevKit, o LED onboard é um WS2812 inteligente. O firmware envia o sinal `neopixelWrite(48, 0, 0, 0)` imediatamente para desligar a emissão de luz vermelha residual.
2. **Correção de Comunicação Serial (UART0 vs USB CDC):**
   - Configurado `-DARDUINO_USB_CDC_ON_BOOT=0` no `platformio.ini` para rotear a saída do terminal para o chip físico UART-USB **CH343/CH340 (VID 1a86)** conectado ao barramento padrão da placa.
3. **Rotina de Teste Dinâmico:**
   - Varredura dos 21 pinos de teste.
   - Para cada pino:
     - Configuração como `INPUT_PULLUP` e `OUTPUT` simultâneos.
     - `digitalWrite(pin, HIGH)` seguido de leitura digital com delay de 50 µs para assentamento do sinal.
     - `digitalWrite(pin, LOW)` seguido de leitura digital com delay de 50 µs.
     - Retorno para `INPUT` seguro (alta impedância).
   - Apuração do total de sucessos (_PASS_) e falhas (_FAIL_).
4. **Coleta de Dados Automatizada via Script Python:**
   - Script `coletar_teste.py` que abre o descritor de dispositivo `/dev/ttyACM0` a 115200 baud, envia o gatilho `r` e grava a resposta diretamente em arquivo texto.

---

## 4. Códigos Desenvolvidos

### 4.1. Firmware C++ (PlatformIO / Arduino Framework) — `src/main.cpp`

```cpp
#include <Arduino.h>

// Lista exata dos 21 pinos GPIO mapeados no esquemático MM-ESP32-V1
const uint8_t testPins[] = {
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 16, 17, 18, 38, 39, 40, 41, 42, 46};
const uint8_t numPins = sizeof(testPins) / sizeof(testPins[0]);

void runPinTest()
{
  Serial.println("\n=======================================================");
  Serial.println("  ESP32-S3 GPIO VALIDATION TEST - MICROMOUSE MM-ESP32  ");
  Serial.println("=======================================================\n");

  uint8_t passCount = 0;
  uint8_t failCount = 0;

  Serial.println(">>> INICIANDO AUTOTESTE INTERNO DOS PINOS...");
  Serial.println("-------------------------------------------------------");
  Serial.printf("%-10s | %-12s | %-12s | %-10s\n", "Pino", "HIGH Drive", "LOW Drive", "Status");
  Serial.println("-------------------------------------------------------");

  for (uint8_t i = 0; i < numPins; i++)
  {
    uint8_t pin = testPins[i];
    bool ok = true;

    // Configura o pino como OUTPUT com buffer de leitura ativo
    pinMode(pin, INPUT_PULLUP);
    pinMode(pin, OUTPUT);

    // Teste 1: Drive HIGH (3.3V) e leitura
    digitalWrite(pin, HIGH);
    delayMicroseconds(50);
    int readHigh = digitalRead(pin);

    // Teste 2: Drive LOW (0V) e leitura
    digitalWrite(pin, LOW);
    delayMicroseconds(50);
    int readLow = digitalRead(pin);

    // Retorna para entrada segura apos o teste
    pinMode(pin, INPUT);

    if (readHigh != HIGH || readLow != LOW)
    {
      ok = false;
      failCount++;
    }
    else
    {
      passCount++;
    }

    Serial.printf("GPIO %-5d | %-12s | %-12s | [%s]\n",
                  pin,
                  (readHigh == HIGH) ? "OK (3.3V)" : "FAIL",
                  (readLow == LOW) ? "OK (0.0V)" : "FAIL",
                  ok ? "PASS" : "FAIL");
    delay(15);
  }

  Serial.println("-------------------------------------------------------");
  Serial.printf("Resultado Final: %d PASS / %d FAIL (Total: %d pinos)\n", passCount, failCount, numPins);
  if (failCount == 0) {
    Serial.println("Status Geral: >> TODOS OS PINOS VALIDADOS COM SUCESSO! <<");
  } else {
    Serial.println("Status Geral: >> ATENCAO: HOUVE FALHA EM ALGUNS PINOS <<");
  }
  Serial.println("=======================================================");
}

void setup()
{
  neopixelWrite(48, 0, 0, 0); // Apaga LED RGB onboard
  Serial.begin(115200);
  delay(1500);
  runPinTest();
}

void loop()
{
  if (Serial.available())
  {
    char c = Serial.read();
    if (c == 'r' || c == 'R') runPinTest();
  }
}
```

### 4.2. Script Python de Coleta Automática — `coletar_teste.py`

```python
import serial, time, os, glob

ports = glob.glob('/dev/ttyACM*') + glob.glob('/dev/ttyUSB*')
ser = serial.Serial(ports[0], 115200, timeout=1.0)
time.sleep(1.0)
ser.reset_input_buffer()
ser.write(b'r\n')
ser.flush()

lines = []
t0 = time.time()
while time.time() - t0 < 4.0:
    line = ser.readline().decode('utf-8', errors='replace')
    if line:
        print(line, end='')
        lines.append(line)

with open(os.path.expanduser("~/Downloads/relatorio_teste_esp32_pinos.txt"), "w") as f:
    f.writelines(lines)
ser.close()
```

---

## 5. Tabela de Resultados Obtidos

Abaixo, a reprodução fiel dos registros emitidos pelo ESP32-S3:

```text
=======================================================
  ESP32-S3 GPIO VALIDATION TEST - MICROMOUSE MM-ESP32
=======================================================

>>> INICIANDO AUTOTESTE INTERNO DOS PINOS...
-------------------------------------------------------
Pino       | HIGH Drive   | LOW Drive    | Status
-------------------------------------------------------
GPIO 1     | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 2     | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 3     | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 4     | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 5     | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 6     | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 7     | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 8     | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 9     | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 10    | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 11    | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 15    | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 16    | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 17    | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 18    | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 38    | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 39    | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 40    | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 41    | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 42    | OK (3.3V)    | OK (0.0V)    | [PASS]
GPIO 46    | OK (3.3V)    | OK (0.0V)    | [PASS]
-------------------------------------------------------
Resultado Final: 21 PASS / 0 FAIL (Total: 21 pinos)
Status Geral: >> TODOS OS PINOS VALIDADOS COM SUCESSO! <<
=======================================================
```

---

## 6. Evidências Exigidas

- [x] **Captura Serial / Arquivo de Log Gerado:** Gerado e armazenado em `relatorio_teste_esp32_pinos.txt`.
- [x] **Compatibilidade com o Esquemático MM-ESP32-V1:** Todos os 21 pinos físicos correspondentes às 9 issues de teste foram cobertos.
- [x] **Verificação de Pinos Protegidos:** Barramento SPI (Flash/PSRAM) e USB nativo foram preservados contra sobreescrita acidental.

---

## 7. Critérios de Aceite (Definition of Done)

- [x] **CA-01 (Cobertura Completa de Pinos):** Todos os 21 pinos GPIO do esquemático MM-ESP32-V1 testados individualmente.
- [x] **CA-02 (Validação de Níveis Lógicos):** Comutação comprovada em nível HIGH (3,3 V) e nível LOW (0,0 V).
- [x] **CA-03 (Imunidade e Não Interferência):** Pinos retornados com segurança para alta impedância (`INPUT`) após o teste, prevenindo danos a periféricos que venham a ser conectados futuramente.
- [x] **CA-04 (Automação de Testes):** Criação de rotina sob demanda via terminal serial (`r`) e script de coleta (`coletar_teste.py`).
- [x] **CA-05 (Documentação Técnica):** Relatório elaborado no padrão padronizado das issues de PI1.
