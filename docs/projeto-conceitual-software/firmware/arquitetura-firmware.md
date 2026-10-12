# Arquitetura do Firmware - Visões Lógica, de Processos e de Implementação (4+1)

- **Atividade:** 3.2 - Visões do firmware (lógica / processos / implementação)
- **Épico:** Arquitetura da Solução (4+1)
- **Responsável:** Gustavo Oki / Samuel
- **Entrega da etapa (AP5):** 28/09/2026
- **Projeto:** Rato Borrachudo
- **Grupo 1 - PI1 2026/2**

---

## 1. Contexto e escopo

Este documento apresenta **três das cinco visões 4+1** aplicadas ao subsistema de **firmware** (ESP32): **lógica**, **de processos** e **de implementação**. As visões de **dados** (MER/DER) e de **implantação** são tratadas nas atividades 3.3 e 3.5, respectivamente. As decisões de stack são as do documento `arquitetura-stack.md`: C++ com **ESP-IDF v5.x sobre FreeRTOS** (pilha BLE **NimBLE**), arquitetura de **monólito modular em camadas** (tendo a máquina de estados finita (FSM) como núcleo de controle e tarefas FreeRTOS para o paralelismo) e bibliotecas dedicadas de sensores/atuadores.

Os diagramas estão em **Mermaid**, renderizado nativamente pelo GitHub.

## 2. Visão Lógica

A visão lógica mostra a decomposição do firmware em **módulos/classes** e suas responsabilidades. Trata-se de um **monólito modular em camadas**: **HAL/Drivers** (acesso ao hardware) $\rightarrow$ **Domínio** (sensoriamento, mapa, navegação, movimento, odometria, telemetria) $\rightarrow$ **Controle** (máquina de estados e inicialização).

```mermaid
classDiagram
  class SystemInit {
    +runSelfTest()
    +initSensors()
    +initMap()
    +startBleAdvertising()
  }
  class NavigationFSM {
    +update()
    +transition()
    +currentState()
  }
  class Navigator {
    +step()
    +recomputeRoute()
  }
  class SensingModule {
    +readToF()
    +readIMU()
    +readPower()
    +classifyWalls()
  }
  class MazeMap {
    +setWall()
    +getCell()
    +reset()
  }
  class FloodFill {
    +propagate()
    +nextCell()
  }
  class MotionController {
    +moveOneCell()
    +turn()
    +pidEqualize()
  }
  class Odometry {
    +onEncoderPulse()
    +distance()
    +cellCount()
    +avgSpeed()
  }
  class TelemetryEmitter {
    +buildPayload()
    +send()
  }
  class ToFArray {
    +reassignAddresses()
    +readAll()
  }
  class IMU {
    +read()
  }
  class PowerMonitor {
    +read()
  }
  class MotorDriver {
    +setPWM()
  }
  class Encoders {
    +count()
  }
  class LocalInterface {
    +signalReady()
    +signalError()
    +readDip()
    +readButton()
  }
  class I2CBus {
    +transfer()
  }

  NavigationFSM --> SystemInit : usa na inicializacao
  NavigationFSM --> Navigator : orquestra
  NavigationFSM --> TelemetryEmitter : alimenta
  NavigationFSM --> LocalInterface : sinaliza
  Navigator --> SensingModule
  Navigator --> MazeMap
  Navigator --> FloodFill
  Navigator --> MotionController
  FloodFill --> MazeMap
  SensingModule --> ToFArray
  SensingModule --> IMU
  SensingModule --> PowerMonitor
  MotionController --> MotorDriver
  MotionController --> Odometry
  MotionController --> IMU
  Odometry --> Encoders
  ToFArray --> I2CBus
  IMU --> I2CBus
  PowerMonitor --> I2CBus
  TelemetryEmitter --> Odometry
  TelemetryEmitter --> PowerMonitor
  TelemetryEmitter --> MazeMap
```

**Responsabilidades e rastreabilidade:**

| Módulo                                                                               | Responsabilidade                                                                             | RF                   |
| :----------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------- | :------------------- |
| SystemInit                                                                           | Auto-teste, reendereçamento ToF, verificação IMU/INA219, leitura do DIP (3 vias), mapa inicial, **anúncio BLE** | RF-27 a RF-31, RF-51 |
| NavigationFSM                                                                        | Máquina de estados; sinalização de prontidão/erro                                            | RF-32, RF-54, RF-55  |
| SensingModule                                                                        | Leitura dos ToF/IMU/INA219 e classificação de paredes                                        | RF-33 a RF-36        |
| MazeMap                                                                              | Estado do mapa e paredes (bidirecional)                                                      | RF-31, RF-37         |
| FloodFill                                                                            | Propagação de valores e escolha da próxima célula                                            | RF-38, RF-39, RF-40  |
| Navigator                                                                            | Orquestra o ciclo de navegação e o recálculo de rota                                         | RF-40, RF-41         |
| MotionController                                                                     | PWM, PID, correção de trajetória, curvas                                                     | RF-42 a RF-46        |
| Odometry                                                                             | Pulsos $\rightarrow$ distância, células, velocidade média                                               | RF-47 a RF-50        |
| TelemetryEmitter                                                                     | Monta e envia a carga útil (emissor unidirecional)                                           | RF-52, RF-53         |
| Drivers (ToFArray, IMU, PowerMonitor, MotorDriver, Encoders, LocalInterface, I2CBus) | Acesso ao hardware                                                                           | -                    |

## 3. Visão de Processos

O ESP32 é _dual-core_ e roda FreeRTOS. O firmware separa **duas tarefas** e as **interrupções de encoder**, para garantir tempo real na navegação e o **isolamento entre navegação e telemetria** (RNF-33): a telemetria apenas **lê** o estado compartilhado e **envia**, nunca bloqueando ou influenciando a navegação.

```mermaid
flowchart TB
  subgraph ISR["Interrupcoes de hardware (ISR)"]
    isrE["ISR dos encoders:<br/>conta pulsos (RF-47)"]
  end

  subgraph CORE["ESP32 dual-core - FreeRTOS"]
    subgraph TN["Tarefa: Nucleo de Navegacao (prioridade alta)"]
      tn1["FSM + ciclo de navegacao:<br/>sensoriamento, Flood Fill,<br/>controle de movimento<br/>(RF-33 a RF-50, RF-54)"]
    end
    subgraph TT["Tarefa: Emissor de Telemetria (prioridade baixa)"]
      tt1["Monta payload e notifica<br/>via BLE (NUS)<br/>(RF-52, RF-53)"]
    end
    q1[["Fila de telemetria<br/>(queue FreeRTOS)"]]
    st[["Estado compartilhado:<br/>mapa, posicao, metricas<br/>(protegido por mutex)"]]
  end

  ble[/"BLE (NUS) -> Ponte (PC) -> Backend"/]

  isrE -. incrementa contadores .-> st
  tn1 --> st
  tn1 -->|snapshot periodico| q1
  q1 --> tt1
  st -. leitura .-> tt1
  tt1 --> ble
```

**Características dos processos:**

- **Núcleo de Navegação (alta prioridade):** executa a FSM e o ciclo de sensoriamento $\rightarrow$ mapeamento $\rightarrow$ Flood Fill $\rightarrow$ movimento em cadência determinística. É o caminho crítico de tempo real.
- **Emissor de Telemetria (baixa prioridade):** consome _snapshots_ de uma fila e lê o estado compartilhado para montar e notificar a carga útil por BLE. Se o enlace BLE cair, esta tarefa apenas acumula no buffer de retenção sem afetar a navegação (RNF-33); a telemetria retoma sozinha ao reconectar e reenvia o buffer (RF-74).
- **ISR dos encoders:** rotinas de interrupção contam pulsos sem perda mesmo em alta velocidade (RF-47), atualizando contadores no estado compartilhado.
- **Sincronização:** _queue_ FreeRTOS para os _snapshots_ e _mutex_ para o estado compartilhado, evitando condição de corrida entre as tarefas e a ISR.

## 4. Visão de Implementação

A visão de implementação mostra a organização física do código no repositório (projeto ESP-IDF, build de host por CMake), os módulos-fonte e as dependências externas.

```mermaid
flowchart TB
  subgraph REPO["Projeto ESP-IDF (firmware/)"]
    ini["CMakeLists.txt + CMakePresets.json<br/>(build de host) + esp32/ (ESP-IDF)"]
    subgraph SRC["src/"]
      main["app_main.cpp<br/>(composition root, cria tarefas)"]
      appnav["use_cases/ + domain/<br/>(FSM, Navigator, FloodFill, MazeMap)"]
      sense["adapters/<br/>(VL53L1X, MPU-6050, INA219)"]
      motion["controller/ + adapters/<br/>(DRV8833, MotionController, Odometry)"]
      telem["telemetry/ + adapters/<br/>(TelemetryEmitter, BleTelemetryAdapter)"]
      hal["adapters/<br/>(I2cBus, LocalInterface)"]
    end
    subgraph TEST["test/"]
      ut["testes de host (GoogleTest):<br/>FloodFill, MazeMap, derivacoes"]
    end
  end

  subgraph LIBS["Componentes / dependencias"]
    l1["VL53L1X (componente ESP-IDF)"]
    l2["MPU-6050 (driver I2C)"]
    l3["INA219 (driver I2C)"]
    l4["PCNT (encoder, nativo)"]
    l5["esp-nimble-cpp (NimBLE)"]
    l6["PID proprio"]
  end

  main --> appnav
  appnav --> sense
  appnav --> motion
  appnav --> telem
  sense --> hal
  motion --> hal
  telem --> hal
  sense --> l1
  sense --> l2
  sense --> l3
  motion --> l4
  motion --> l6
  telem --> l5
  ut --> appnav
```

**Organização e build:**

- **Dois alvos de build** sobre o mesmo código: **host** (`CMakeLists.txt` + presets, compila o núcleo + testes no PC, sem placa) e **placa** (`esp32/`, ESP-IDF, compila núcleo + adapters + `app_main`).
- **`src/`** e **`include/`** agrupam os módulos por camada da **arquitetura limpa** (domínio, casos de uso, portas, adapters), com os `adapters/` isolando o acesso ao hardware - o que permite testar o núcleo (Flood Fill, mapa, odometria) no build de host.
- **`test/`** contém os testes automatizados (GoogleTest), executáveis via `ctest --preset debug`, alinhados aos casos CT-FW-12, CT-FW-13 e CT-FW-32 do roteiro de testes (`4.4.6`).
- **Dependências** da placa são declaradas em `esp32/main/idf_component.yml` (ex.: `esp-nimble-cpp`) e resolvidas pelo gerenciador de componentes do ESP-IDF; o GoogleTest é baixado por `FetchContent` no build de host.

## 5. Rastreabilidade (visão $\rightarrow$ requisitos)

| Visão                                  | Requisitos que fundamentam                    |
| :------------------------------------- | :-------------------------------------------- |
| Lógica (decomposição em módulos)       | RF-27 a RF-56 (mapeados na tabela da seção 2) |
| Processos (tarefas + ISR + isolamento) | RF-47, RF-52, RF-53, RF-54, RNF-33            |
| Implementação (estrutura e testes)     | RNF-53 (testabilidade), decisões do `4.4.5`   |

## 6. Observações para a integração (atividade 3.5)

- Estas visões conectam-se ao restante do sistema por um único ponto: o **TelemetryEmitter** notifica, via **BLE (NUS)**, a **ponte** no PC, que repassa o mesmo JSON ao **backend** por WebSocket.
- A **visão de dados** (3.3) não se aplica ao firmware (estado em memória, sem banco); o firmware apenas **produz** a carga útil que o backend persiste.
