# Firmware - Rato Borrachudo (PI1 Grupo 1)

Firmware do micromouse em **C++17**, organizado em **arquitetura limpa**: o núcleo (domínio, casos de uso, portas) é lógica pura testada no PC, e os *adapters* de hardware (ESP32-S3) ficam na borda, implementando as portas.

## Dois alvos de build

| Alvo                | O que compila                    | Precisa de placa? | Comando                                        |
| :------------------ | :------------------------------- | :---------------: | :--------------------------------------------- |
| **Host**            | núcleo (A–K) + testes            |        não        | `cmake --preset debug && ctest --preset debug` |
| **Placa (ESP-IDF)** | núcleo + adapters (L–P) + `main` |        sim        | `idf.py -C esp32 build`                        |

O build de host **não** compila os adapters (eles dependem de `driver/*.h` do ESP-IDF); por isso os testes rodam em qualquer PC. O build da placa compila **tudo**.

## Início rápido

Testes no PC (rede de segurança - rode sempre):

```bash
cmake --preset debug
cmake --build --preset debug
ctest --preset debug          # 81 testes
```

Firmware na placa (com o ESP-IDF v5.x instalado e ativado):

```bash
. ~/esp/esp-idf/export.sh
idf.py -C esp32 reconfigure        # baixa deps (esp-nimble-cpp)
idf.py -C esp32 set-target esp32s3 # 1ª vez
idf.py -C esp32 build
idf.py -C esp32 -p /dev/ttyACM0 flash monitor
```

## Estrutura (arquitetura limpa, de dentro para fora)

```
include/ · src/          núcleo + adapters (headers / implementação)
├── domain/              Entities - Maze, FloodFill, Odometry, DipDecoder, Pid, Maneuver
├── controller/          MotionController (PID de tração)
├── use_cases/           Navigator, SessionManager (FSM)
├── ports/               fronteiras - Sensor/Motion/Signal/Telemetry
├── protocol/            ProtocolV1 (apresentador - domínio → JSON)
├── telemetry/           TelemetryEmitter, TelemetryBuffer
└── adapters/            hardware (ESP-IDF) - I2C, motores, encoders, ToF, IMU, INA219, BLE
src/main.cpp         composition root (ESP-IDF); src/main.cpp é stub do host
test/                    testes do núcleo + doubles (simulation/, spy/)
esp32/                   subprojeto ESP-IDF (CMakeLists, sdkconfig, partitions)
bridge/                  ponte BLE→WebSocket (roda no PC)
```

Detalhes de build, presets, cobertura e fluxo TDD em [`GUIA_DESENVOLVIMENTO.md`](GUIA_DESENVOLVIMENTO.md).

> **Não acrescente arquivos de _hardware_ (esquemáticos, PCB) nesta pasta** - eles vão na pasta `hw/` do repositório do projeto.
