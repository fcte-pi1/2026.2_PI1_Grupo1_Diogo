# Medições de Desempenho — Backend (CT-BE-32 a CT-BE-34)

**Versão:** 1.1 — 25/10/2026
**Issue:** [#373 — Backend: medições de carga, latência e recuperação (CT-BE-32, 33 e 34) para o AP12](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/373)
**Requisitos verificados:** [RNF-48](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/226), [RNF-49](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/227), [RNF-51](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/229) e [RNF-52](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/230)
**Casos de teste:** [CT-BE-32, CT-BE-33 e CT-BE-34](4_casos_de_teste.md#casos-de-teste--requisitos-não-funcionais)

---

## 1. Objetivo

Este relatório registra a execução dos três casos de teste não funcionais do backend que dependem de medição: latência (CT-BE-32), carga sustentada (CT-BE-33) e recuperação após reinício (CT-BE-34). Os requisitos funcionais correspondentes já estavam implementados e testados (seção de Backend do documento [`7.4 - Testes de software`](../../7.4%20-%20Testes%20de%20software.md)). Faltavam os números de desempenho, que dependiam do simulador de robô ([#322](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/322)) e da instrumentação de latência do backend ([PR #390](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/pull/390)).

Os casos foram executados em dois ambientes (seção 3). O ambiente **A**, com Docker Compose, é o ambiente padrão (AMB) do roteiro de testes e fornece os **resultados oficiais**. O ambiente **B**, sem contêiner, serve de confirmação.

## 2. Resumo dos resultados (ambiente A, oficial)

| Caso | Requisito | Critério | Resultado medido | Situação |
|:--|:--|:--|:--|:--:|
| CT-BE-32 | RNF-48 | p95 (recepção → envio ao painel) ≤ 50 ms | eventos **12,59 ms**; contínuos **16,99 ms** | Atendido |
| CT-BE-32 | RNF-48 | p95 ponta a ponta (robô → painel) ≤ 300 ms | eventos **13,61 ms**; contínuos **118,35 ms** | Atendido |
| CT-BE-33 | RNF-49 | atraso do *event loop* com p99 ≤ 20 ms sob 50 msg/s por 5 min | p99 **0,92 ms** | Atendido |
| CT-BE-33 | RNF-51 | todas as mensagens gravadas, sem desconexão de painel nem rejeição por sobrecarga | **15.120 de 15.120** gravadas; 0 painéis desconectados; 0 rejeições | Atendido |
| CT-BE-34 | RNF-52 | `/health` pronto e corrida retomada em até 5 s (descontado o contêiner); sem lacunas nem duplicatas | retomada em **1,08 s** descontado o contêiner, e em **3,43 a 3,94 s** contando o contêiner; `514 = 514 = 514` nas 3 repetições | Atendido |

Os quatro requisitos foram atendidos com folga nos dois ambientes, e os resultados do ambiente B (seção 5) são da mesma ordem. As limitações dessa conclusão estão na seção 7.

## 3. Ambientes de medição

| Item | A — Docker Compose (oficial, AMB) | B — sem contêiner (confirmação) |
|:--|:--|:--|
| Código | `software-dev`, commit `8d8203d` (com a instrumentação do PR #390), mais os scripts desta issue | o mesmo |
| Máquina | notebook da equipe, Windows, com Docker Desktop 29.8.2 (máquina virtual WSL 2) | Linux (Ubuntu 24.04), 2 vCPU Intel Xeon a 2,1 GHz, 7,8 GB de RAM |
| Backend | contêiner do `compose.yaml` (`node:22-bookworm-slim`), com `tsx watch` | Node.js 22.23.4, com `tsx src/main.ts` |
| Banco | contêiner `postgres:16-alpine` do `compose.yaml` | PostgreSQL 16.15 local |
| Simulador e painéis | no Windows (Node.js 22.23.3), fora do Docker. Cada mensagem atravessa a ponte de rede Windows ↔ WSL 2 | mesma máquina do backend |
| Derrubar e religar no CT-BE-34 | `docker compose kill backend` e `docker compose start backend` | `SIGKILL` no processo e nova execução do mesmo comando |

Nos dois ambientes, o simulador e os painéis de teste rodam no **mesmo processo**, então a latência ponta a ponta usa um relógio único. Em ambos o backend roda o código-fonte com `tsx`, sem compilar, que é o ambiente de desenvolvimento. A imagem de produção (`compose.prod.yaml`) roda o JavaScript compilado.

## 4. Ferramentas e método

As medições são feitas por três scripts em [`src/backend/medicoes/`](../../../src/backend/medicoes/), um por caso de teste (`npm run medir:ct-be-32`, `medir:ct-be-33` e `medir:ct-be-34`). Cada um executa o procedimento do roteiro, confere cada critério, imprime uma tabela e grava o resultado completo em JSON em [`src/backend/medicoes/resultados/`](../../../src/backend/medicoes/resultados/). O [README da pasta](../../../src/backend/medicoes/README.md) descreve o uso e o método em detalhe. Os pontos principais são:

- **Simulador (SIM).** É o simulador de robô do RNF-53 (`src/backend/simulador/`), que envia as mensagens do protocolo v1 como o firmware, com buffer de 60 s e reenvio ao reconectar. O script troca só o socket por um que registra o instante de saída de cada mensagem.
- **Painel de teste (PNL).** É um cliente de `/ws/painel` que se inscreve no canal `ao_vivo` e em cada corrida que começa, como o painel de verdade, e grava o instante de chegada de cada evento de célula e de cada contínuo.
- **Latência no backend.** É lida no `GET /health` (`latencia_painel_ms`), que mede da chegada do quadro WebSocket do robô ao envio aos painéis. Os histogramas valem desde o início do processo, por isso o backend é reiniciado antes do CT-BE-32 e do CT-BE-33, e os scripts recusam medir se ele já recebeu mensagens.
- **Latência ponta a ponta.** É a chegada ao painel menos a saída do simulador. Os eventos são pareados pela `sequencia`. Os contínuos são pareados pelo `tempo_ms` do ciclo de telemetria, contando a partir da primeira mensagem do ciclo, o que é conservador.
- **Percentis.** Os percentis do script usam o método do posto mais próximo, que devolve sempre um valor medido. Os percentis do `/health` vêm do histograma do Node (`perf_hooks`).
- **Contagem das mensagens gravadas.** É feita pela exportação CSV da corrida (RF-98), que tem uma linha por linha da tabela `mensagem`. É o equivalente a `count(*)`, `count(DISTINCT seq)` e `max(seq)`, sem acesso direto ao banco, e funciona também no `compose.prod.yaml`, cujo banco não publica porta.

As funções de cálculo (percentis, pareamento, contagem pelo CSV e comparação de *snapshots*) têm testes unitários em [`src/backend/testes/unit/medicoes/`](../../../src/backend/testes/unit/medicoes/).

## 5. Resultados

### 5.1 CT-BE-32 — Latência servidor → painel e ponta a ponta (RNF-48)

**Cenário:** 1 SIM a 20 msg/s e 5 PNL por 5 min, com o backend recém-reiniciado, e corridas consecutivas no labirinto 12x4.
- A: 7 corridas, 6.006 mensagens em 300,1 s, semente 1176063740.
- B: 12 corridas, 6.456 mensagens em 322,4 s, semente 2928434260.

| Medida | Amb. | Amostras | p50 | p95 | p99 | Máximo |
|:--|:--:|--:|--:|--:|--:|--:|
| Backend, eventos (`/health`) | A | 273 | 11,68 ms | **12,59 ms** | 18,83 ms | 19,79 ms |
| | B | 323 | 12,11 ms | 12,90 ms | 13,82 ms | 14,57 ms |
| Backend, contínuos (`/health`) | A | 2.975 | 12,33 ms | **16,99 ms** | 19,87 ms | 21,73 ms |
| | B | 3.191 | 12,71 ms | 13,83 ms | 16,34 ms | 56,77 ms |
| Ponta a ponta, eventos | A | 1.365 | 12,53 ms | **13,61 ms** | 20,47 ms | 21,04 ms |
| | B | 1.615 | 12,51 ms | 13,79 ms | 14,82 ms | 15,91 ms |
| Ponta a ponta, contínuos | A | 14.875 | 66,15 ms | **118,35 ms** | 145,87 ms | 163,75 ms |
| | B | 15.955 | 67,74 ms | 116,82 ms | 151,52 ms | 162,61 ms |

O atraso do *event loop* teve p99 de 0,92 ms (A) e 1,07 ms (B). Em ambos, todas as recepções foram pareadas com o envio correspondente, nenhum painel foi desconectado, e não houve mensagem duplicada nem rejeitada.

**Análise.**
- **Latência no backend.** Cerca de 10 ms dos ~12 ms de mediana são a espera proposital do gravador em lote, que junta as mensagens por até 10 ms antes de gravar (RF-79). O restante é a gravação no PostgreSQL e a distribuição. Os dois ambientes dão praticamente os mesmos valores. No ambiente A, a cauda dos contínuos é um pouco mais longa (p95 de 16,99 ms), mas fica a um terço do limite.
- **Eventos e contínuos com o mesmo critério.** Na discussão da #373, a medição preliminar mostrava contínuos com p95 de 64,7 ms, porque a espera pela janela de 100 ms do RF-90 entrava na conta. Depois da correção do PR #390, só fica de fora a espera de uma mensagem já pronta pela janela, e o processamento até ela ficar pronta continua contando. Com isso, os contínuos atendem ao mesmo critério de 50 ms dos eventos, como está descrito no CT-BE-32 e no [`API.md`](../../../src/backend/protocolo/v1/API.md). **O critério do RNF-48 não precisou ser restringido aos eventos.**
- **Ponta a ponta dos contínuos.** O p95 de cerca de 118 ms é maior que o dos eventos por desenho do sistema, e não por lentidão. Nele entram a janela de 100 ms do RF-90, que limita os contínuos a 10 por segundo, e os 50 ms entre a primeira e a segunda mensagem de cada ciclo de telemetria do simulador a 20 msg/s, contados de forma conservadora. Mesmo assim, ele fica a menos de 40 % do limite de 300 ms.
- **Rede do Docker.** No ambiente A, as mensagens atravessam a ponte de rede entre o Windows e a máquina virtual do Docker. A diferença em relação ao ambiente B foi de menos de 1 ms na mediana dos eventos.

### 5.2 CT-BE-33 — Carga sustentada sem bloqueio do *event loop* (RNF-49, RNF-51)

**Cenário:** 1 SIM a 50 msg/s (2,5 vezes a taxa do robô) e 10 PNL por 5 min, com o backend recém-reiniciado, e corridas no 12x4. Durante a carga, o script consultou o `/health` a cada 5 s e pediu 3 exportações CSV de corridas já encerradas.
- A: 20 corridas, 15.120 mensagens em 302,4 s, semente 1459904303.
- B: 16 corridas, 15.904 mensagens em 318 s, semente 3764163371.

| Critério | Limite | A (oficial) | B | Situação |
|:--|:--|:--|:--|:--:|
| RNF-49: atraso do *event loop*, p99 no fim da carga | ≤ 20 ms | **0,92 ms** (maior p99 nas consultas depois do primeiro minuto: 0,92 ms) | 1,09 ms (1,15 ms) | Atendido |
| RNF-51: mensagens gravadas = enviadas, sem duplicata | todas | **15.120 de 15.120** | 15.904 de 15.904 | Atendido |
| RNF-51: nenhuma rejeição por sobrecarga | 0 | 0 rejeitadas, 0 recusas, 0 quedas do simulador | idem | Atendido |
| RNF-51: nenhum painel desconectado | 0 | **0** | 0 | Atendido |
| `/health` a cada 5 s | todas com 200 | 61 de 61 (resposta p95 de 2,15 ms, máximo de 5,35 ms) | 64 de 64 (4,62 ms, 15,92 ms) | Atendido |
| 3 exportações CSV durante a carga | 3 com 200 | 3 de 3, com 756 linhas cada, em 13,21 ms, 8,58 ms e 8,89 ms | 3 de 3, com 994 linhas cada, em 29,15 ms, 16,60 ms e 19,31 ms | Atendido |

Em cada corrida, nos dois ambientes, `count = count(DISTINCT seq) = max(seq)` = mensagens enviadas. Sob essa carga, a latência no backend (informativa) teve p95 de 12,04 ms nos eventos e de 12,79 ms nos contínuos no ambiente A, igual à da carga nominal.

**Análise.** A 50 msg/s, o backend fica ocioso quase o tempo todo. O atraso do *event loop* não mudou em relação à carga nominal (p99 de 0,92 ms em A, tanto a 20 msg/s quanto a 50 msg/s), e as exportações CSV no meio da carga não o elevaram, o que é coerente com a exportação em *stream* do RF-98 (CA3). A margem para o limite de 20 ms é de mais de 20 vezes.

### 5.3 CT-BE-34 — Recuperação após reinício do backend (RNF-52)

**Cenário:** corrida de 514 mensagens (8x4, semente 42) a 20 msg/s. Com 250 mensagens confirmadas, o backend é encerrado à força no instante T0 e religado em seguida. O SIM continua emitindo para o buffer e, ao reconectar, envia o `hello` e o buffer inteiro, como o firmware. O caso foi repetido 3 vezes em cada ambiente.

**Ambiente A (oficial):** `docker compose kill backend` e `docker compose start backend`.

| Repetição | `kill` retornou | `start` retornou | `/health` com 200 | Corrida retomada | Retomada, descontado o contêiner | `count = distintas = max(seq)` | Faltantes / status | *Snapshot* reconstruído |
|:--:|--:|--:|--:|--:|--:|:--:|:--:|:--|
| 1 | 0,59 s | 1,86 s | 3,86 s | 3,94 s | 1,08 s | 514 = 514 = 514 | 0 / `CONCLUIDA` | igual |
| 2 | 0,57 s | 1,83 s | 3,34 s | 3,43 s | 1,08 s | 514 = 514 = 514 | 0 / `CONCLUIDA` | igual |
| 3 | 0,53 s | 1,79 s | 3,35 s | 3,43 s | 1,08 s | 514 = 514 = 514 | 0 / `CONCLUIDA` | igual |

**Ambiente B:** `SIGKILL` no processo e nova execução.

| Repetição | `/health` com 200 | Corrida retomada | `count = distintas = max(seq)` | Faltantes / status | *Snapshot* reconstruído |
|:--:|--:|--:|:--:|:--:|:--|
| 1 | 0,90 s | 1,09 s | 514 = 514 = 514 | 0 / `CONCLUIDA` | igual |
| 2 | 0,98 s | 1,17 s | 514 = 514 = 514 | 0 / `CONCLUIDA` | igual |
| 3 | 0,95 s | 1,13 s | 514 = 514 = 514 | 0 / `CONCLUIDA` | igual |

Todos os tempos são contados a partir de T0. "Corrida retomada" é o primeiro `ack` além da sequência 250 depois da volta. "Descontado o contêiner" é o tempo do processo do backend no primeiro `200` (`uptime_s` do `/health`) mais o tempo até a retomada.

**Análise.**
- **Tempo.** O processo do backend fica pronto em cerca de 1 s, já com as corridas em andamento recarregadas do banco: o `main.ts` só abre a porta depois da recuperação, então o primeiro `200` do `/health` já a inclui. No ambiente A, o restante até o `200` (cerca de 2,3 a 2,9 s) é do Docker: o `kill` (~0,55 s), o `start` do contêiner (~1,25 s) e o comando de subida do `compose.yaml` (`npm install` e migrações) antes de o backend iniciar. **Mesmo contando o contêiner, a retomada ficou abaixo de 5 s nas três repetições.**
- **Arredondamento.** O `uptime_s` vem arredondado para o segundo. Um valor de 1 s corresponde a menos de 1,5 s, o que mantém a retomada descontada abaixo de 1,6 s no pior caso.
- **Sem lacunas nem duplicatas.** O simulador reenviou o buffer inteiro, e o backend descartou as duplicatas: 250 no ambiente A. No ambiente B, a mensagem 251 saiu do simulador quando a conexão já estava morta, porque o `SIGKILL` leva milissegundos, e se perdeu. Ela voltou no reenvio, por isso foram 251 reenviadas para 250 descartadas. Nos dois casos, a corrida termina com as 514 mensagens, uma vez cada, como exigem o RNF-50 e o RNF-52.
- **Estado reconstruído.** O *snapshot* que o painel recebe depois do reinício (mapa com as paredes, posição, métricas e corte de sequência) é igual ao de antes da queda. A única diferença é o `sinal`, que fica `PERDIDO` até o robô voltar, por projeto (RF-92). A comparação ignora a ordem das chaves, porque o `jsonb` do PostgreSQL não guarda a ordem em que elas chegaram.

## 6. Rastreabilidade

Os arquivos de evidência ficam em `src/backend/medicoes/resultados/`.

| Requisito | Caso | Evidência — A (oficial) | Evidência — B | Situação |
|:--|:--|:--|:--|:--:|
| RNF-48 Baixa latência | CT-BE-32 | `ct-be-32-2026-10-25T15-11-42.json` | `ct-be-32-2026-10-25T03-29-47.json` | Atendido |
| RNF-49 Não bloqueio do *event loop* | CT-BE-33 | `ct-be-33-2026-10-25T15-21-19.json` | `ct-be-33-2026-10-25T03-35-12.json` | Atendido |
| RNF-51 Capacidade de carga | CT-BE-33 | `ct-be-33-2026-10-25T15-21-19.json` | `ct-be-33-2026-10-25T03-35-12.json` | Atendido |
| RNF-52 Recuperação após reinício | CT-BE-34 | `ct-be-34-2026-10-25T15-22-44.json`, `…15-23-14.json` e `…15-23-46.json` | `ct-be-34-2026-10-25T03-35-40.json`, `…03-36-07.json` e `…03-36-35.json` | Atendido |

## 7. Limitações e dependências com outras frentes

- **O enlace Bluetooth não está na medição.** O simulador se conecta direto ao backend, sem o BLE e sem a ponte. A latência "ponta a ponta" deste relatório vai do simulador ao painel. A parcela do robô até o notebook depende do firmware e do módulo BLE do ESP32 (Hardware), e precisa ser medida com o robô real nos **testes de integração (entrega de 23/11)**. Como o backend e o painel usam menos de 120 ms dos 300 ms no p95, sobram cerca de 180 ms para o BLE e a ponte. Esse é o orçamento a combinar com quem cuida do firmware e da ponte.
- **Painéis na mesma máquina.** Na apresentação, os painéis estarão em outros computadores e celulares, na rede local, o que acrescenta a latência da rede Wi-Fi.
- **Ambiente de desenvolvimento.** Nos dois ambientes, o backend roda com `tsx`, sem compilar. A imagem de produção (`compose.prod.yaml`) não foi medida. Como ela roda o JavaScript compilado e sobe sem `npm install`, a expectativa é de valores iguais ou menores, mas isso não foi verificado.
- **Taxa e carga do simulador.** A 50 msg/s, o simulador envia as mensagens mais rápido que o relógio do robô avança (o `tempo_ms` segue o ciclo de 100 ms do firmware). Isso não afeta o backend, que só confere o `tempo_ms` contra as sequências vizinhas, mas significa que as corridas do CT-BE-33 são "aceleradas".

## 8. Próximos passos

1. **Medir a latência do BLE e da ponte** com o robô real, nos testes de integração, e somá-la ao resultado do CT-BE-32.
2. **Opcionalmente, repetir o CT-BE-34 com o `compose.prod.yaml`** (`npm run medir:ct-be-34 -- --compose compose.prod.yaml`), que é o ambiente da apresentação.

## 9. Desvios em relação ao roteiro de testes

| Roteiro ([`4_casos_de_teste.md`](4_casos_de_teste.md)) | Execução | Motivo |
|:--|:--|:--|
| AMB com `docker compose up` | ambiente A segue o roteiro; o ambiente B, sem contêiner, é só uma confirmação | seção 3 |
| CT-BE-33: "pedir 3 exportações CSV" | executado como no roteiro | A observação da #373 de trocar as exportações por consultas à API ficou desatualizada: a exportação (RF-98) entrou na `software-dev` em 22/10 ([PR #378](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/pull/378)) |
| CT-BE-33 e CT-BE-34: `count(*)` por SQL | contagem pela exportação CSV, que tem uma linha por linha da tabela `mensagem` | Não exige credenciais do banco e funciona também no `compose.prod.yaml`, cujo banco não publica porta |
| CT-BE-34: "SIM continua gerando mensagens" durante a queda | o SIM emite no ritmo do robô desde T0, mas as mensagens do intervalo do comando de derrubar só saem depois de o processo morrer | Assim, o *snapshot* de antes da queda (corte na 250) é exatamente o estado do processo ao morrer, e a comparação com o reconstruído é exata |
| CT-BE-34: o SIM reconecta quando o backend volta | o SIM reconecta logo depois de o PNL receber o *snapshot* reconstruído | Sem isso, o reenvio do robô poderia mudar o estado antes da comparação. A espera foi de cerca de 20 ms e está incluída no tempo de retomada |

## Referências

- Roteiro de testes do backend: [`4_casos_de_teste.md`](4_casos_de_teste.md).
- Instrumentação da latência e contrato do `/health`: [`src/backend/protocolo/v1/API.md`](../../../src/backend/protocolo/v1/API.md) e [PR #390](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/pull/390).
- Simulador de robô: [`src/backend/simulador/README.md`](../../../src/backend/simulador/README.md) e [#322](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/322).
- Scripts e método: [`src/backend/medicoes/README.md`](../../../src/backend/medicoes/README.md).
- Node.js, `perf_hooks` (`monitorEventLoopDelay` e `createHistogram`): <https://nodejs.org/api/perf_hooks.html>.
