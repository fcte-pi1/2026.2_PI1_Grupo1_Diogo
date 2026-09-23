# Diagrama de Atividades — Raia do Backend (recepção e persistência)

**Versão:** 1.0
**Issue:** [#247 — 2.2 Modelar a raia do backend](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/247)
**Escopo:** comportamento do backend desde a conexão do robô até a persistência, a confirmação e a publicação dos dados aos painéis. As raias **Robô** e **Painel** aparecem apenas nos pontos de interação: o detalhamento delas é das issues [#246](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/246) (firmware) e [#248](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/248) (frontend). A consolidação num diagrama único é feita na [#249](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/249).

O comportamento foi dividido em dois diagramas complementares, que rodam em paralelo a partir do *fork* F1:

- **Diagrama A** — recepção, validação e persistência de mensagens (fluxo principal).
- **Diagrama B** — monitoramento de sinal e encerramento por falta de comunicação.

## Legenda da notação

| Elemento UML | Representação nos diagramas |
|:--|:--|
| Estado inicial | círculo `●` |
| Estado final | círculo duplo `◉` |
| Atividade | retângulo de cantos arredondados |
| Nó de decisão / junção (*merge*) | losango `{ }` |
| Barra de bifurcação / sincronização (*fork/join*) | barra preta `F`/`J` |
| Objeto (insumo ou saída) | paralelogramo `[/ /]` |
| Raia (*swimlane*) | moldura com o nome do ator |
| Evento de tempo | atividade iniciada por `⏱` |

---

## Diagrama A — Recepção, validação e persistência

```mermaid
flowchart TB
    classDef bar fill:#000,stroke:#000,color:#fff
    classDef obj fill:#fff8dc,stroke:#b8860b

    subgraph ROBO["Robô (firmware) — detalhado na #246"]
        R1["Abrir conexão WebSocket<br/>e enviar hello"]
        R2["Enviar mensagens de corrida<br/>(seq, t, dados)"]
        R3["Liberar buffer até o seq confirmado"]
    end

    subgraph BACK["Backend — recepção e persistência"]
        S((●)) --> A1["Aceitar conexão em /ws/telemetria"]
        A1 --> A2["Aguardar hello (até 5 s)"]
        A2 --> D1{"Token válido e<br/>versão suportada?"}
        D1 -- não --> A3["Registrar rejeição<br/>e enviar hello_erro"]
        A3 --> A4["Encerrar conexão"] --> E1(((◉)))
        D1 -- sim --> A5["Registrar evento CONECTADO"]
        A5 --> D2{"Mesmo dispositivo, boot diferente<br/>e corrida EM_ANDAMENTO?"}
        D2 -- sim --> A6["Marcar corrida anterior<br/>INTERROMPIDA (REINICIO_ROBO)"]
        A6 --> M1{" "}
        D2 -- não --> M1
        M1 --> A7["Enviar hello_ok com o último<br/>seq confirmado de cada corrida"]
        A7 --> F1[" F1 "]:::bar
        F1 --> H["Monitorar sinal<br/>(Diagrama B)"]
        F1 --> A8["Receber mensagem"]
        A8 --> D3{"Válida no esquema<br/>da versão declarada?"}
        D3 -- não --> A9["Registrar rejeição com motivo<br/>e incrementar contador"]
        D3 -- sim --> D4{"Respeita as regras<br/>de domínio?"}
        D4 -- não --> A9
        A9 --> M2{" "}
        D4 -- sim --> D5{"(corrida, seq)<br/>já persistido?"}
        D5 -- sim --> A10["Incrementar contador de duplicadas<br/>e reenviar ack"]
        A10 --> M2
        D5 -- não --> D6{"Corrida<br/>conhecida?"}
        D6 -- não --> A11["Criar corrida de forma idempotente<br/>(UUID, nº de tentativa)"]
        A11 --> M3{" "}
        D6 -- sim --> M3
        M3 --> A12["Adicionar ao lote de gravação"]
        A12 --> A13["Persistir lote em transação<br/>(append-only, ON CONFLICT DO NOTHING)"]
        A13 --> A14["Aplicar ao estado em memória em ordem de seq<br/>(mapa, trajeto, métricas, energia)"]
        A14 --> F2[" F2 "]:::bar
        F2 --> A15["Enviar ack cumulativo<br/>(maior seq contíguo)"]
        F2 --> A16["Publicar eventos para distribuição"]
        F2 --> D7{"+20 células desde<br/>o último snapshot?"}
        D7 -- sim --> A17["Persistir snapshot do mapa"]
        A17 --> M4{" "}
        D7 -- não --> M4
        A15 --> J1[" J1 "]:::bar
        A16 --> J1
        M4 --> J1
        J1 --> D8{"Mensagem é<br/>fim_corrida?"}
        D8 -- não --> M2
        D8 -- sim --> A18["Fixar métricas finais e status<br/>CONCLUÍDA ou FALHOU"]
        A18 --> A19["Persistir snapshot final"]
        A19 --> A20["Recalcular leaderboard do tipo de labirinto"]
        A20 --> M2
        M2 --> A8
    end

    subgraph PAINEL["Painel (frontend) — detalhado na #248"]
        P1["Atualizar indicadores,<br/>mapa e ranking"]
    end

    O1[/"hello {dispositivo, token, v, boot}"/]:::obj
    O2[/"mensagem {v, tipo, corrida, seq, t, dados}"/]:::obj
    O3[/"ack {corrida, seq}"/]:::obj
    O4[/"evento / contínuo / status"/]:::obj
    O5[("PostgreSQL<br/>mensagem, corrida, snapshot_mapa")]

    R1 -.-> O1 -.-> A2
    R2 -.-> O2 -.-> A8
    A15 -.-> O3 -.-> R3
    A16 -.-> O4 -.-> P1
    A13 -.-> O5
    A17 -.-> O5
```

## Diagrama B — Monitoramento de sinal e encerramento por falta de comunicação

```mermaid
flowchart TB
    classDef bar fill:#000,stroke:#000,color:#fff
    classDef obj fill:#fff8dc,stroke:#b8860b

    subgraph BACK["Backend — monitoramento de sinal"]
        S((●)) --> B1["⏱ A cada 1 s: enviar ping"]
        B1 --> D1{"Pong ou mensagem<br/>nos últimos 3 s?"}
        D1 -- sim --> B1
        D1 -- não --> B2["Declarar sinal perdido"]
        B2 --> F1[" F1 "]:::bar
        F1 --> B3["Registrar evento SINAL_PERDIDO"]
        F1 --> B4["Notificar painéis: sinal PERDIDO<br/>(até 1 s)"]
        B3 --> J1[" J1 "]:::bar
        B4 --> J1
        J1 --> D2{"Robô reconectou<br/>em até 120 s?"}
        D2 -- "sim (mesmo boot)" --> B5["Registrar SINAL_RETOMADO e<br/>notificar painéis: sinal RETOMADO"]
        B5 --> B6["Retomar recepção<br/>(Diagrama A, após hello_ok)"] --> E1(((◉)))
        D2 -- "sim (boot diferente)" --> B7["Tratado como reinício<br/>(Diagrama A, decisão D2)"] --> E2(((◉)))
        D2 -- "não (⏱ 120 s)" --> B8["Marcar corrida INTERROMPIDA<br/>(SEM_SINAL)"]
        B8 --> B9["Notificar painéis e canal<br/>de corridas ao vivo"]
        B9 --> D3{"Chegou lote tardio<br/>com fim_corrida?"}
        D3 -- não --> E3(((◉)))
        D3 -- sim --> B10["Persistir lote e recalcular<br/>tempo pelo relógio do robô"]
        B10 --> B11["Status CONCLUÍDA ou FALHOU<br/>e recalcular leaderboard"]
        B11 --> E4(((◉)))
    end

    subgraph PAINEL["Painel (frontend)"]
        P1["Exibir 'sem sinal' /<br/>'sinal retomado'"]
    end

    O1[/"sinal {corrida, estado}"/]:::obj
    B4 -.-> O1 -.-> P1
    B5 -.-> O1
```

---

## Descrição das atividades

### Atores

| Ator | Tipo | Papel no fluxo |
|:--|:--|:--|
| Robô (firmware do ESP32) | Sistema externo | Fonte da telemetria: envia `hello`, mensagens de corrida e responde ao ping. |
| Backend | Sistema (esta raia) | Autentica, valida, persiste, deriva métricas, confirma e distribui. |
| Painel (frontend) | Sistema externo | Consumidor das atualizações em tempo real. |
| Operador | Usuário | Não atua neste fluxo. Atua na anulação (RF-96), fora do caminho de ingestão. |

### Atividades, insumos e saídas

| # | Atividade | Insumos | Saídas | RF |
|:--|:--|:--|:--|:--|
| A1–A2 | Aceitar conexão e aguardar `hello` | Conexão WebSocket | Conexão pendente de autenticação | RF-72 |
| D1, A3–A4 | Autenticar dispositivo e versão | `hello` (dispositivo, token, `v`, `boot`) | `hello_ok` ou `hello_erro` + encerramento | RF-72, RNF-55, RNF-57 |
| D2, A6 | Detectar reinício do robô | `boot` do `hello` × `boot` da corrida em andamento | Corrida anterior `INTERROMPIDA (REINICIO_ROBO)` | RF-81 |
| A7 | Informar retomada | Último `seq` confirmado por corrida | `hello_ok` | RF-74 |
| D3 | Validar esquema | Mensagem + esquema JSON da versão | Mensagem válida ou rejeição | RF-75 |
| D4 | Validar domínio | Mensagem + dimensões do labirinto + último `t` | Mensagem válida ou rejeição | RF-76 |
| A9 | Registrar rejeição | Mensagem + motivo | Log JSON, `mensagem_rejeitada`, contador | RF-75, RF-76, RNF-56 |
| D5, A10 | Garantir idempotência | `(corrida, seq)` | `ack` sem novo registro | RF-77 |
| D6, A11 | Criar corrida | (dispositivo, id da corrida no robô) | Linha em `corrida` com UUID e nº de tentativa | RF-78, RF-97 |
| A12–A13 | Persistir em lote | Mensagens aceitas | Linhas em `mensagem` (append-only) | RF-79, RNF-49 |
| A14 | Atualizar estado derivado | Mensagens persistidas em ordem de `seq` | Mapa, trajeto, velocidade, energia | RF-80, RF-83 a RF-85 |
| A15 | Confirmar | Maior `seq` contíguo persistido | `ack` | RF-74 |
| A16 | Publicar | Eventos derivados | Eventos para o módulo de distribuição | RF-88 a RF-90 |
| D7, A17 | Snapshot periódico | Estado do mapa | Linha em `snapshot_mapa` | RF-80 |
| D8, A18–A20 | Encerrar corrida | `fim_corrida` | Métricas finais, status, snapshot final, ranking | RF-81, RF-82, RF-87, RF-95 |
| B1–B2 | Heartbeat | Ping/pong a cada 1 s | Declaração de perda após 3 s | RF-73 |
| B3–B5 | Notificar sinal | Perda ou retomada | Evento `sinal` aos painéis (≤ 1 s) | RF-92 |
| B8–B9 | Interromper por silêncio | ⏱ 120 s sem sinal | Corrida `INTERROMPIDA (SEM_SINAL)` | RF-81, RF-87 |
| D3–B11 (Diag. B) | Aceitar lote tardio | Lote com `fim_corrida` | Corrida `CONCLUÍDA` ou `FALHOU` | RF-81, RF-87 |

### Pontos de decisão, paralelismo e sincronização

- **F1 (Diagrama A):** após o `hello_ok`, o monitoramento de sinal (Diagrama B) e a recepção de mensagens rodam em paralelo durante toda a conexão. No Node.js isso é concorrência cooperativa no *event loop* (um *timer* e um *handler* de mensagens), sem threads.
- **F2/J1 (Diagrama A):** depois da persistência, a confirmação ao robô, a publicação aos painéis e a verificação de snapshot são independentes entre si. A sincronização em J1 garante que o encerramento da corrida (D8) só aconteça depois dos três ramos, para que o snapshot final e o ranking vejam o estado completo.
- **Ordem persistir → confirmar/distribuir:** o `ack` e a distribuição só ocorrem **depois** da transação confirmada. Assim, um dado exibido no painel ou liberado do buffer do robô nunca se perde num reinício do backend (RNF-50, RNF-52).
- **F1/J1 (Diagrama B):** o registro do evento e a notificação aos painéis são paralelos. A notificação não espera a escrita no banco, para cumprir o prazo de 1 s do RF-92.
- **Laço de recepção (M2 → A8):** a conexão continua aberta após o `fim_corrida`, porque o mesmo robô pode iniciar a próxima tentativa sem reconectar.
