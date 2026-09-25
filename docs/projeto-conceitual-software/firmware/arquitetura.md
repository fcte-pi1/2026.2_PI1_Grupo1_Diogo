# Decisão de Arquitetura - Stack Tecnológica

- **Atividade:** 3.1 - Decidir e justificar a stack - [issue #251](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/251)
- **Épico:** Arquitetura (4+1)
- **Responsáveis:** Gustavo Oki / Samuel
- **Entrega da etapa (AP5):** 28/09/2026
- **Projeto:** Rato Borrachudo
- **Grupo 1 - PI1 2026/2**

---

## 1. Objetivo e escopo

Este documento **decide e justifica** a stack tecnológica do software - padrão arquitetural, linguagens, frameworks/bibliotecas e banco de dados -, conforme exigido pelo `4.4 - Projeto conceitual de software.md`. As decisões aqui são a base das **visões 4+1** (atividades 3.2, 3.4, 3.5) e do **modelo de dados MER/DER** (atividade 3.3, que apenas detalha o banco escolhido aqui).

Cada decisão está fundamentada em requisitos de `2 - Requisitos.md`. As escolhas são **recomendações da Gerência a serem ratificadas** por cada subfrente antes da AP5; os pontos que ainda dependem de confirmação estão na seção 11.

## 2. Visão geral da arquitetura

O sistema é **cliente-servidor distribuído**, em **rede local isolada** (RNF-41), com três subsistemas de software e um protocolo de comunicação comum:

- **Firmware (ESP32):** navegação autônoma e emissão de telemetria. Opera como **cliente Wi-Fi (STA)** e emissor unidirecional (RF-51, RF-53).
- **Backend:** servidor que recebe, valida, persiste, deriva métricas e distribui a telemetria aos painéis.
- **Frontend:** painel web (_dashboard_) que exibe a tentativa em tempo real e o histórico.
- **Protocolo:** mensagens **JSON sobre WebSocket**, com esquema versionado.

```
[ESP32/Firmware] --WebSocket/JSON--> [Backend] --WebSocket/JSON--> [Frontend(s)]
   (cliente STA)                      (servidor)                     (painéis)
```

## 3. Padrão arquitetural (por subfrente)

O padrão MVC/MVP se aplica a sistemas com interface e interação de usuário; por isso ele é adotado no frontend, mas **não** no firmware nem no backend, que têm naturezas diferentes. As escolhas por subfrente:

| Subfrente    | Padrão adotado                                                                                 | Justificativa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| :----------- | :--------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Firmware** | **Camadas + Máquina de Estados Finita (FSM) sobre tarefas FreeRTOS**                           | O comportamento já é definido por seis estados de navegação (RF-54), o que torna a FSM o núcleo natural. As camadas (HAL → _drivers_ de sensores/atuadores → domínio: sensoriamento, mapeamento, Flood Fill, controle de movimento, telemetria) isolam responsabilidades. Duas tarefas FreeRTOS separam **navegação** e **telemetria**, atendendo diretamente ao isolamento exigido pelo RNF-33 (falha de Wi-Fi não pode afetar a navegação). MVC não se aplica: não há interface gráfica embarcada. |
| **Backend**  | **Monólito modular em camadas** (ingestão → validação → domínio → persistência → distribuição) | O escopo (1 robô, ~10 painéis, RNF-51) não justifica microsserviços, cujo overhead operacional contraria a implantação simples exigida (RNF-58: subir com um único comando em ≤ 2 min). Um monólito modular em camadas mantém baixo acoplamento entre ingestão WebSocket, validação de esquema/domínio (RF-75, RF-76), derivação de métricas (RF-82…85) e persistência (RF-79, RF-80), e é mais simples de testar (RNF-53).                                                                          |
| **Frontend** | **Componentizado (padrão MVVM/Flux)**                                                          | O React organiza a interface em componentes reutilizáveis, com um _view-model_ (hooks/store) que separa o tratamento do fluxo WebSocket da apresentação. Essa separação sustenta a atualização reativa em tempo real (RF-58) e o desempenho exigido (RNF-38: ≥ 30 fps a 10 msg/s).                                                                                                                                                                                                                   |

## 4. Linguagens de programação

| Subfrente    | Linguagem                             | Justificativa                                                                                                                                                                                                                                                                                                                                                                                         |
| :----------- | :------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Firmware** | **C++** (padrão do ecossistema ESP32) | Acesso de baixo nível a I²C, PWM/LEDC, interrupções de encoder (RF-42, RF-47) e controle determinístico de tempo real, com amplo suporte de bibliotecas para os sensores do projeto.                                                                                                                                                                                                                  |
| **Backend**  | **TypeScript** sobre **Node.js**      | Os requisitos já pressupõem Node: _event loop_ não bloqueante (RNF-49), simulador de robô **em Node** (RNF-53) e implantação com um comando (RNF-58). O modelo assíncrono orientado a eventos do Node é ideal para muitas conexões WebSocket simultâneas (RNF-51). O TypeScript adiciona tipagem estática, que reduz erros ao lidar com o esquema do protocolo e as regras de domínio (RF-75, RF-76). |
| **Frontend** | **TypeScript** (+ HTML/CSS)           | Mesma linguagem do backend reduz troca de contexto e permite compartilhar os tipos do protocolo. Tipagem estática ajuda na consistência dos dados de telemetria exibidos.                                                                                                                                                                                                                             |

> Observação: se a equipe julgar o prazo apertado para adotar TypeScript no front/back, JavaScript puro é aceitável; a recomendação é TypeScript pela segurança de tipos no protocolo.

## 5. Frameworks e bibliotecas

**Firmware (ESP32)**

- **PlatformIO + framework Arduino-ESP32** (sobre FreeRTOS): ambiente de build reprodutível, com gerenciamento de bibliotecas e testes integrados. Alternativa: ESP-IDF puro (mais controle, curva de aprendizado maior).
- **Bibliotecas:** **VL53L1X** (Pololu) para os ToF; **MPU6050** (Adafruit) para o IMU; **INA219** (Adafruit) para energia; **ESP32Encoder** para odometria; **arduinoWebSockets** (Links2004) para a emissão de telemetria; **PID** (Arduino-PID) para a malha de equalização (RF-43).
- **Testes:** **Unity** (ou Google Test) via PlatformIO em ambiente _native_, para a lógica de Flood Fill e derivações desacopladas do hardware.

**Backend (Node.js)**

- **`ws`**: servidor WebSocket leve, para ingestão do robô e distribuição aos painéis (RF-72, RF-88).
- **Fastify** (ou Express): API REST de consulta - histórico, filtros, paginação, _leaderboard_ (RF-93, RF-95).
- **Ajv** (JSON Schema): validação de cada mensagem contra o esquema da versão do protocolo (RF-75).
- **better-sqlite3**: acesso ao banco (ver seção 6).
- **Testes:** **Vitest** (ou Jest) + o **simulador de robô em Node** (RNF-53), com cobertura ≥ 80% nos módulos de validação e derivação.

**Frontend (web)**

- **React + Vite**: o Vite empacota todos os assets localmente no _build_, o que atende ao requisito crítico de **operação offline sem CDNs/fontes/APIs externas** (RNF-41).
- **Canvas 2D**: renderização da malha do labirinto e do trajeto (RF-60, RF-61) - melhor desempenho que SVG para atualização contínua e retenção de 6.000 amostras (RNF-38, RNF-40).
- **uPlot**: gráficos de consumo (tensão/corrente/potência) leves e rápidos (RF-68); alternativa mais simples: Chart.js.
- **Zustand (ou Context API):** estado da aplicação e buffer da tentativa.

## 6. Banco de dados e persistência

**Decisão: banco relacional - SQLite** (via `better-sqlite3`), com o esquema a ser detalhado em **MER/DER na atividade 3.3**.

**Justificativa:**

- Os dados têm forte estrutura relacional e regras de integridade: log _append-only_ por corrida (RF-79), _snapshots_ periódicos (RF-80), idempotência por (corrida, sequência) (RF-77), imutabilidade da corrida finalizada (RNF-54) e consultas com filtros, paginação e _leaderboard_ ordenado (RF-93, RF-95). Restrições e ordenação são naturais em SQL.
- **SQLite** é _serverless_ e de arquivo único: atende à implantação com um único comando em ≤ 2 min (RNF-58) e à operação em rede local isolada (RNF-41), sem instalar/gerenciar um servidor de banco.
- A escala é pequena (1 robô, ~10 painéis; ~6.000 registros por tentativa a 10 Hz), bem dentro da capacidade do SQLite, com latência adequada aos alvos (RNF-48).
- Sendo **relacional**, o entregável de persistência é **MER + DER** (conforme o 4.4), coerente com o escopo da atividade 3.3.

Alternativa considerada: **PostgreSQL** - mais robusto e concorrente, porém exige servidor e configuração, contrariando a simplicidade de implantação; fica como opção caso a equipe queira um banco cliente-servidor. **NoSQL/documento** (ex.: MongoDB) foi descartado: embora o fluxo _append-only_ combine com log de eventos, as consultas relacionais (leaderboard, filtros, integridade/imutabilidade) e a exigência de implantação simples favorecem o relacional embarcado.

## 7. Protocolo de comunicação

- **Transporte:** WebSocket (protocolo leve de aplicação previsto no RNF-6), sobre a rede local Wi-Fi.
- **Formato:** mensagens **JSON**, cada uma carregando a **versão do protocolo** (RF-57); o backend aceita a versão atual e a anterior, com o **esquema publicado no repositório** (RNF-57).
- **Sentido:** o robô é **emissor unidirecional** (RF-53); os painéis são somente leitura (RNF-55).
- **Confiabilidade:** numeração de sequência, confirmação cumulativa (_ack_) e idempotência garantem 0 duplicatas e 0 lacunas após quedas (RF-74, RF-77, RNF-50).

## 8. Resumo da stack

| Camada           | Padrão                       | Linguagem          | Principais frameworks/bibliotecas                                                        | Persistência            |
| :--------------- | :--------------------------- | :----------------- | :--------------------------------------------------------------------------------------- | :---------------------- |
| Firmware (ESP32) | Camadas + FSM sobre FreeRTOS | C++                | PlatformIO/Arduino-ESP32, VL53L1X, MPU6050, INA219, ESP32Encoder, arduinoWebSockets, PID | - (estado em memória)   |
| Backend          | Monólito modular em camadas  | TypeScript/Node.js | ws, Fastify, Ajv, better-sqlite3, Vitest                                                 | **SQLite (relacional)** |
| Frontend         | Componentizado (MVVM/Flux)   | TypeScript         | React, Vite, Canvas 2D, uPlot, Zustand                                                   | Buffer em memória       |
| Comunicação      | Cliente-servidor             | JSON               | WebSocket, JSON Schema (Ajv)                                                             | -                       |

## 9. Rastreabilidade das decisões (decisão → requisitos)

| Decisão                               | Requisitos que a fundamentam                      |
| :------------------------------------ | :------------------------------------------------ |
| FSM + tarefas FreeRTOS no firmware    | RF-54, RNF-33                                     |
| Node.js no backend                    | RNF-49, RNF-51, RNF-53, RNF-58                    |
| Monólito modular (não microsserviços) | RNF-58, RNF-51                                    |
| React + Vite, empacotamento local     | RNF-41, RNF-44, RNF-45                            |
| Canvas + uPlot (desempenho)           | RNF-38, RNF-40, RF-60, RF-61, RF-68               |
| Banco relacional / SQLite             | RF-77, RF-79, RF-80, RF-93, RF-95, RNF-54, RNF-58 |
| WebSocket + JSON versionado           | RNF-6, RF-57, RF-75, RNF-57                       |

## 10. Riscos e mitigações

- **`better-sqlite3` é síncrono** e pode, em teoria, bloquear o _event loop_ (RNF-49). Mitigação: operações são pequenas e rápidas nesta escala; agrupar escritas em transação e mover cargas pesadas (ex.: exportações) para fora do caminho crítico.
- **Desempenho de renderização** com 6.000 amostras (RNF-40). Mitigação: Canvas + _downsampling_ nos gráficos (uPlot) e limite de 10 atualizações contínuas/s já imposto pelo backend (RF-90).
- **Curva de TypeScript/PlatformIO** para parte da equipe. Mitigação: começar pelos módulos desacoplados de hardware (Flood Fill, derivações) e usar o simulador em Node.
