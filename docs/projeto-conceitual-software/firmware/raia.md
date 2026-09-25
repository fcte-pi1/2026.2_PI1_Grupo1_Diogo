# Diagrama de Atividades - Raia do Firmware / Navegação

- **Atividade:** 2.1 - Modelar a raia do firmware/navegação - [issue #246](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/246)
- **Épico:** Diagrama de Atividades UML
- **Responsável:** Gustavo Oki / Samuel
- **Entrega da etapa (AP5):** 28/09/2026
- **Projeto:** Rato Borrachudo
- **Grupo 1 - PI1 2026/2**

---

## 1. Escopo

Este documento modela a **raia (_swimlane_) do firmware embarcado no ESP32** dentro do Diagrama de Atividades UML do sistema. Ele descreve o fluxo de comportamento da navegação autônoma - da inicialização à conclusão da tentativa - e as trocas com os atores vizinhos (**Operador** e **Sistema Web**). Esta raia será integrada às demais (backend, frontend/operador) na **atividade 2.4 - Consolidar diagrama único**.

Os diagramas estão em **Mermaid**, renderizado nativamente pelo GitHub ao visualizar o arquivo `.md`. São três:

- **Diagrama 1 - Visão geral com raias:** o fluxo macro do firmware e suas trocas com Operador e Sistema Web, com bifurcação/sincronização (_fork/join_) da telemetria.
- **Diagrama 2 - Ciclo de navegação (detalhe):** a expansão da atividade "Ciclo de navegação" (sensoriamento -> mapa -> Flood Fill -> movimento -> odometria).
- **Diagrama 3 - Máquina de estados de navegação:** visão complementar dos seis estados (RF-54).

## 2. Notação adotada (mapeamento UML -> Mermaid)

| Elemento UML de atividade                              | Representação no Mermaid                        |
| :----------------------------------------------------- | :---------------------------------------------- |
| Estado inicial / final                                 | Nó estádio `([ ])` - "Início" / "Fim"           |
| Ação / atividade                                       | Retângulo `[ ]`                                 |
| Estado de navegação                                    | Sub-rotina `[[ ]]`                              |
| Nó de decisão                                          | Losango `{ }`                                   |
| Bifurcação / sincronização (_fork/join_)               | Barra escura (`:::bar`)                         |
| Insumo (entrada) / resultado (saída) - fluxo de objeto | Seta tracejada `-. insumo .->` / `-. saída .->` |
| Fluxo de controle                                      | Seta sólida `-->`                               |
| Raia (_swimlane_)                                      | `subgraph` por ator                             |

## 3. Diagrama 1 - Visão geral com raias

```mermaid
flowchart TB
  subgraph OP["Raia: Operador"]
    op1[/"Seleciona tipo de labirinto<br/>no DIP switch"/]
    op2[/"Pressiona botao<br/>de disparo"/]
    op3["Observa prontidao e status<br/>(LEDs / buzzer)"]
  end

  subgraph FW["Raia: Firmware / Navegacao (ESP32)"]
    ini([Inicio])
    a1["Inicializacao e auto-teste:<br/>ESP32, ToF, IMU, INA219,<br/>mapa e Wi-Fi STA<br/>(RF-27 a RF-31, RF-51)"]
    d1{Auto-teste e<br/>sensores OK?}
    a2["Sinalizar prontidao<br/>(RF-32)"]
    sAg[["Aguardando"]]
    d2{Botao de<br/>disparo?}
    sMap[["Mapeando"]]
    fk[" "]:::bar
    cic["Ciclo de navegacao<br/>(ver Diagrama 2)"]:::sub
    tel["Transmitir telemetria periodica<br/>como emissor unidirecional<br/>(RF-52, RF-53)"]
    jn[" "]:::bar
    d3{"Falha<br/>irrecuperavel?<br/>(RF-55)"}
    sCon[["Concluido"]]
    a3["Isolar sessao:<br/>zera mapa, contadores<br/>e temporizador (RF-56)"]
    sErr[["Erro"]]
    a4["Interromper PWM dos motores<br/>e sinalizar falha (RF-55)"]
    fim([Fim])
  end

  subgraph WEB["Raia: Sistema Web (Telemetria)"]
    w1["Recebe carga util<br/>de telemetria"]
  end

  ini --> a1 --> d1
  d1 -- Nao --> sErr
  d1 -- Sim --> a2 --> sAg --> d2
  op1 -. insumo .-> a1
  a2 -. saida .-> op3
  op2 -. insumo .-> d2
  d2 -- Nao --> sAg
  d2 -- Sim --> sMap --> fk
  fk --> cic
  fk --> tel
  tel -. saida .-> w1
  cic --> d3
  tel --> jn
  d3 -- Sim --> sErr
  d3 -- Nao --> jn
  jn --> sCon --> a3 --> sAg
  sErr --> a4 --> fim

  classDef bar fill:#333,stroke:#333,color:#fff,height:6px;
  classDef sub stroke-dasharray:5 5,fill:#eef;
```

> A barra após **Mapeando** é a **bifurcação (_fork_)**: a navegação e a transmissão de telemetria correm em paralelo. A barra antes de **Concluído** é a **sincronização (_join_)**. Conforme o RNF-33, a telemetria é isolada da navegação - uma falha de Wi-Fi **não** leva ao estado Erro nem interrompe a navegação.

## 4. Diagrama 2 - Ciclo de navegação (detalhe da raia do firmware)

Expansão da atividade "Ciclo de navegação". Vale para os estados **Mapeando** e **Resolvendo**; a diferença é que, em Resolvendo, o recálculo de rota (decisão de nova parede) é ignorado, pois o percurso ótimo já está definido.

```mermaid
flowchart TB
  ent([Entrada: Mapeando / Resolvendo])
  s1["Ler ToF e IMU<br/>(RF-33, RF-35)"]
  s2["Ler energia INA219<br/>(RF-36)"]
  c1["Classificar paredes<br/>por limiar (RF-34)"]
  m1["Atualizar mapa<br/>de forma bidirecional (RF-37)"]
  f1["Propagar valores de<br/>inundacao (RF-38)"]
  f2["Selecionar vizinha de<br/>menor valor (RF-39)"]
  d1{"Nova parede<br/>invalida a rota?<br/>(RF-40)"}
  r1["Recalcular rota<br/>(RF-40)"]
  mv["Mover 1 celula:<br/>PWM + PID + correcao + curva<br/>(RF-42 a RF-46)"]
  od["Odometria: distancia, celulas<br/>e velocidade media<br/>(RF-47 a RF-50)"]
  d2{"Chegou ao<br/>objetivo? (RF-41)"}
  d3{"Mapa completo<br/>antes da chegada?<br/>(RF-41)"}
  res["Transitar Mapeando -> Resolvendo<br/>(sem recalculos) (RF-41)"]
  out([Saida: Concluido])
  loop([Retorna ao ciclo])

  sens[/"Sensores ToF / IMU / INA219"/]:::ext
  mot[/"Motores N20 (atuadores)"/]:::ext
  enc[/"Encoders"/]:::ext

  ent --> s1 --> s2 --> c1 --> m1 --> f1 --> f2 --> d1
  sens -. insumo .-> s1
  sens -. insumo .-> s2
  d1 -- Sim --> r1 --> f1
  d1 -- Nao --> mv --> od --> d2
  mv -. saida .-> mot
  enc -. insumo .-> od
  d2 -- Sim --> out
  d2 -- Nao --> d3
  d3 -- Sim --> res --> loop
  d3 -- Nao --> loop
  loop --> s1

  classDef ext fill:#efe,stroke:#393;
```

## 5. Diagrama 3 - Máquina de estados de navegação (complementar)

Os seis estados definidos no RF-54 e suas transições autorizadas.

```mermaid
stateDiagram-v2
  state "Inicializando" as Init
  state "Aguardando" as Ag
  state "Mapeando" as Map
  state "Resolvendo" as Res
  state "Concluido" as Con
  state "Erro" as Err

  [*] --> Init
  Init --> Ag: inicializacao OK (RF-32)
  Init --> Err: falha no auto-teste (RF-27/RF-29)
  Ag --> Map: botao de disparo
  Map --> Map: sensoriamento + mapa + Flood Fill (RF-33 a RF-40)
  Map --> Con: objetivo alcancado (RF-41)
  Map --> Res: mapa completo antes da chegada (RF-41)
  Res --> Con: percurso otimo concluido (RF-41)
  Map --> Err: falha irrecuperavel (RF-55)
  Res --> Err: falha irrecuperavel (RF-55)
  Con --> Ag: nova sessao isolada (RF-56)
  Con --> [*]
  Err --> [*]
```

## 6. Descrição do fluxo

### **Inicialização.**

Ao ligar, o firmware executa o auto-teste do ESP32 e dos GPIO, reendereça os sete ToF no barramento I2C, verifica IMU e INA219, lê o tipo de labirinto no DIP switch (insumo do Operador), inicializa o mapa com a inundação inicial e conecta o Wi-Fi em modo estação. Se algo falhar, transita direto para **Erro**. Caso contrário, sinaliza prontidão (saída para o Operador via LED/buzzer) e entra em **Aguardando**.

### **Disparo e paralelismo.**

Ao receber o botão de disparo (insumo do Operador), entra em **Mapeando** e ocorre a **bifurcação**: o _Ciclo de navegação_ e a _transmissão de telemetria_ passam a correr em paralelo. A telemetria é emissora unidirecional e isolada da navegação (RNF-33).

### **Ciclo de navegação (Diagrama 2).**

A cada iteração o firmware lê os sensores, classifica as paredes por limiar, atualiza o mapa, propaga os valores de inundação (Flood Fill), seleciona a próxima célula de menor valor e move-se uma célula (saída para os motores). Se uma nova parede invalida a rota, recalcula antes de mover. Ao completar o mapa antes de chegar, transita para **Resolvendo** e executa o percurso ótimo sem novos recálculos. Ao alcançar o objetivo, sai do ciclo.

### **Encerramento.**

A **sincronização** reúne navegação e telemetria em **Concluído**; em seguida a sessão é isolada (zera mapa, contadores e temporizador) e o robô retorna a **Aguardando** para uma nova tentativa. Uma falha irrecuperável detectada durante a operação leva a **Erro**, que interrompe todos os PWM dos motores e sinaliza a condição.

## 7. Rastreabilidade (atividade -> RF)

| Atividade no diagrama                           | RF                                       |
| :---------------------------------------------- | :--------------------------------------- |
| Inicialização e auto-teste                      | RF-27, RF-28, RF-29, RF-30, RF-31, RF-51 |
| Sinalizar prontidão / Aguardando                | RF-32                                    |
| Ler ToF e IMU / energia                         | RF-33, RF-35, RF-36                      |
| Classificar paredes                             | RF-34                                    |
| Atualizar mapa                                  | RF-37                                    |
| Flood Fill (propagar / selecionar / recalcular) | RF-38, RF-39, RF-40                      |
| Encerramento de mapeamento / Resolvendo         | RF-41                                    |
| Mover 1 célula (PWM, PID, correção, curva)      | RF-42, RF-43, RF-44, RF-45, RF-46        |
| Odometria                                       | RF-47, RF-48, RF-49, RF-50               |
| Telemetria (paralela)                           | RF-52, RF-53                             |
| Máquina de estados                              | RF-54                                    |
| Detecção de falha / Erro                        | RF-55                                    |
| Isolamento entre sessões                        | RF-56                                    |
