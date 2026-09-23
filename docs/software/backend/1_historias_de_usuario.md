# Histórias de Usuário — Backend

**Versão:** 1.1 — alinhada ao Guia da Equipe de Software (21/09/2026)
**Issue:** [#242 — 1.2 Escrever HUs do Backend (RF-72…98)](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/242)
**Escopo:** backlog do produto da frente de backend. Cada Requisito Funcional RF-72 a RF-98 (especificados em [`2 - Requisitos.md`](../../2%20-%20Requisitos.md)) é detalhado em uma História de Usuário (HU) no formato *Eu-Como-Para*, com critérios de aceitação verificáveis e rastreabilidade para os casos de teste ([`4_casos_de_teste.md`](4_casos_de_teste.md)).

Termos como `hello`, `ack`, `seq`, "snapshot" e os status de corrida seguem o protocolo e o modelo definidos em [`3_arquitetura.md`](3_arquitetura.md).

---

## Convenções

- **ID:** `HU-BE-NN`. A numeração é 1:1 com os RF do backend: **HU-BE-NN ↔ RF-(71+NN)**. Por exemplo, HU-BE-01 ↔ RF-72 e HU-BE-27 ↔ RF-98.
- **Prioridade:** herdada do RF, na escala MoSCoW (Must/Should/Could have) de `2 - Requisitos.md`. Entre parênteses, o valor P0/P1/P2 usado no campo *Priority* do GitHub Projects.
- **Critérios de aceitação:** escritos em *Dado / Quando / Então*. Quando o RF já traz um critério de aceite, ele é reaproveitado **literalmente** como CA1. Os critérios marcados com **†** refinam o RF com valores propostos pela frente de backend, que precisam ser validados com o time.
- **Protótipos:** o backend não tem interface própria. Quando o efeito da HU aparece no painel, a coluna aponta a HU/RF de frontend e os protótipos de alta fidelidade ([#244](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/244)).

## Personas

| Persona | Quem é | O que espera do backend |
|:--|:--|:--|
| **Operador** | Integrante da equipe que conduz a apresentação: liga o robô, acompanha o painel e administra as corridas. | Registro confiável e automático de cada tentativa, e o poder de anular uma corrida inválida. |
| **Avaliador** | Professor, banca ou espectador que acompanha o painel (somente leitura). | Dados ao vivo corretos, ranking justo e histórico consultável. |
| **Equipe de firmware** | Integrantes que desenvolvem o firmware do ESP32. | Um canal de telemetria que tolere quedas de Wi-Fi sem perder nem duplicar dados. |
| **Equipe de frontend** | Integrantes que desenvolvem o painel web. | Fluxo de dados consistente, já derivado e com volume controlado, além de uma API de consulta. |

---

## Backlog do Produto — Backend

> Formato idêntico ao do [`4.4 - Projeto conceitual de software.md`](../../4.4%20-%20Projeto%20conceitual%20de%20software.md) (um bloco por RF/Épico). A coluna **ID** é o link da issue da HU no GitHub Projects (label `HU`, sub-issue do RF correspondente). A prioridade segue a escala MoSCoW de [`2 - Requisitos.md`](../../2%20-%20Requisitos.md).

### Requisitos Funcionais

<u>[RF-72](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/152)/Épico: Autenticação da fonte de telemetria</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-01](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/262) | Conectar somente robôs autorizados | Must have |

<u>[RF-73](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/153)/Épico: Detecção de perda de conexão por heartbeat</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-02](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/263) | Saber rapidamente quando o robô perdeu o sinal | Must have |

<u>[RF-74](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/154)/Épico: Confirmação cumulativa de mensagens (ack)</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-03](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/264) | Confirmar ao robô o que já foi gravado | Must have |

<u>[RF-75](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/155)/Épico: Validação de mensagens contra o esquema do protocolo</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-04](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/265) | Rejeitar mensagens malformadas sem derrubar a conexão | Must have |

<u>[RF-76](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/156)/Épico: Validação das regras de domínio</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-05](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/266) | Rejeitar dados fisicamente impossíveis | Must have |

<u>[RF-77](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/157)/Épico: Idempotência por corrida e número de sequência</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-06](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/267) | Não duplicar dados reenviados | Must have |

<u>[RF-78](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/158)/Épico: Criação automática e idempotente da corrida</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-07](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/268) | Registrar a corrida sem ação manual | Must have |

<u>[RF-79](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/159)/Épico: Persistência append-only das mensagens da corrida</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-08](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/269) | Guardar o registro bruto e inalterável da corrida | Must have |

<u>[RF-80](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/160)/Épico: Snapshot periódico do estado do mapa</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-09](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/270) | Preservar o estado do mapa periodicamente | Must have |

<u>[RF-81](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/161)/Épico: Encerramento e marcação de corridas interrompidas</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-10](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/271) | Encerrar ou marcar como interrompida cada corrida | Must have |

<u>[RF-82](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/162)/Épico: Cálculo do tempo de conclusão pelo relógio do robô</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-11](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/272) | Obter o tempo oficial de conclusão | Must have |

<u>[RF-83](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/163)/Épico: Cálculo da velocidade média da corrida</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-12](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/273) | Acompanhar a velocidade média | Must have |

<u>[RF-84](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/164)/Épico: Derivação do trajeto ordenado por sequência</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-13](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/274) | Reconstituir o trajeto percorrido | Must have |

<u>[RF-85](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/165)/Épico: Derivação de métricas da série de tensão da bateria</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-14](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/275) | Avaliar o consumo de bateria da corrida | Must have |

<u>[RF-86](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/166)/Épico: Alerta de tensão baixa aos painéis</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-15](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/276) | Ser alertado de bateria baixa | Should have |

<u>[RF-87](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/167)/Épico: Status do desafio com motivo de término</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-16](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/277) | Saber o resultado da corrida e o motivo | Must have |

<u>[RF-88](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/168)/Épico: Distribuição de atualizações por inscrição de corrida</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-17](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/278) | Receber só as atualizações da corrida acompanhada | Must have |

<u>[RF-89](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/169)/Épico: Snapshot consistente para inscrição no meio da corrida</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-18](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/279) | Entrar no meio da corrida e ver o estado completo | Must have |

<u>[RF-90](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/170)/Épico: Limite de taxa de atualizações contínuas por painel</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-19](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/280) | Receber dados contínuos em ritmo controlado | Must have |

<u>[RF-91](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/171)/Épico: Controle de fluxo por painel sobrecarregado</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-20](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/281) | Não deixar um painel lento prejudicar os demais | Should have |

<u>[RF-92](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/172)/Épico: Notificação de perda e retomada de sinal do robô</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-21](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/282) | Ver no painel a perda e a retomada de sinal | Must have |

<u>[RF-93](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/173)/Épico: Listagem de corridas com filtros e paginação</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-22](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/283) | Consultar o histórico de corridas | Must have |

<u>[RF-94](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/174)/Épico: Linha do tempo completa da corrida para replay</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-23](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/284) | Rever uma corrida passo a passo | Should have |

<u>[RF-95](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/175)/Épico: Leaderboard por tipo de labirinto</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-24](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/285) | Ver o ranking por tipo de labirinto | Must have |

<u>[RF-96](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/176)/Épico: Anulação de corrida pelo operador</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-25](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/286) | Anular uma corrida inválida | Should have |

<u>[RF-97](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/177)/Épico: Numeração de tentativas por tipo de labirinto</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-26](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/287) | Identificar a primeira tentativa em cada labirinto | Should have |

<u>[RF-98](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/178)/Épico: Exportação de corrida em JSON e CSV</u>

| ID (Link Github Projects) | Título | Prioridade |
|:------| :-- | :--- |
| [HU-BE-27](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/288) | Exportar os dados de uma corrida | Could have |

### Requisitos Não-Funcionais

| ID (Link Github Projects) | Título | Prioridade | Rastreabilidade |
|:--------------------------| :-- | :--- |:----------------|
| [RNF-48](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/226) | Baixa latência (servidor–painel e ponta a ponta) | Must have | RF-88/HU-BE-17, RF-90/HU-BE-19 |
| [RNF-49](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/227) | Não bloqueio do Event Loop | Must have | RF-79/HU-BE-08, RF-90/HU-BE-19, RF-98/HU-BE-27 |
| [RNF-50](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/228) | Integridade dos dados após quedas de conexão | Must have | RF-74/HU-BE-03, RF-77/HU-BE-06 |
| [RNF-51](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/229) | Capacidade de carga (mensagens e painéis simultâneos) | Must have | RF-79/HU-BE-08, RF-88/HU-BE-17 |
| [RNF-52](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/230) | Recuperação após reinício do backend | Must have | RF-80/HU-BE-09, RF-81/HU-BE-10 |
| [RNF-53](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/231) | Testabilidade dos fluxos de ingestão | Must have | RF-72/HU-BE-01 a RF-87/HU-BE-16 |
| [RNF-54](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/232) | Imutabilidade da corrida finalizada | Must have | RF-79/HU-BE-08, RF-96/HU-BE-25 |
| [RNF-55](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/233) | Segurança proporcional (autenticação e escrita restrita) | Must have | RF-72/HU-BE-01, RF-96/HU-BE-25 |
| [RNF-56](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/234) | Observabilidade (logs, health e contadores) | Must have | RF-75/HU-BE-04, RF-76/HU-BE-05, RF-77/HU-BE-06 |
| [RNF-57](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/235) | Evolutividade do protocolo | Should have | RF-72/HU-BE-01, RF-75/HU-BE-04 |
| [RNF-58](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/236) | Implantabilidade simples | Should have | Transversal (todas as RF/HU do backend) |

---

## Detalhamento das Histórias de Usuário

### HU-BE-01 — Conectar somente robôs autorizados

- **Issue:** [#262](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/262)
- **RF:** [RF-72](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/152) · **Prioridade:** Must have (P0) · **RNF:** RNF-55, RNF-57
- **História:** Eu, como **operador**, quero que o backend aceite telemetria apenas de robôs cadastrados que falem uma versão de protocolo suportada, para que nenhum dispositivo estranho na rede local contamine os resultados da apresentação.
- **Critérios de aceitação:**
  - **CA1:** Dado um dispositivo cadastrado, quando ele abre a conexão WebSocket e envia `hello` com token válido e versão de protocolo atual ou anterior, então o backend passa a aceitar mensagens de corrida dessa conexão e registra o evento `CONECTADO`. Nenhuma resposta de aplicação é exigida do robô, que é emissor unidirecional.
  - **CA2:** Dado um `hello` com token inválido ou de dispositivo desativado, quando ele é recebido, então o backend fecha a conexão com código `4001` (`TOKEN_INVALIDO`), não persiste nada da corrida e registra a tentativa em log.
  - **CA3:** Dado um `hello` com versão de protocolo diferente da atual e da anterior, quando ele é recebido, então o backend fecha a conexão com código `4002` (`VERSAO_NAO_SUPORTADA`) e registra em log.
  - **CA4 †:** Dada uma conexão aberta, quando nenhum `hello` válido chega em até 5 s ou chega outra mensagem antes do `hello`, então a conexão é encerrada sem persistir dados.
- **Protótipo:** não se aplica. O efeito visível é o indicador de conexão do painel ([RF-59](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/139)).
- **Casos de teste:** CT-BE-01, CT-BE-02, CT-BE-37.

### HU-BE-02 — Saber rapidamente quando o robô perdeu o sinal

- **Issue:** [#263](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/263)
- **RF:** [RF-73](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/153) · **Prioridade:** Must have (P0)
- **História:** Eu, como **operador**, quero que o backend perceba em poucos segundos que o robô parou de se comunicar, para saber se o problema está no Wi-Fi e não confundir silêncio com o robô parado.
- **Critérios de aceitação:**
  - **CA1 (do RF):** Com o robô conectado, ao parar de responder, o painel deve mostrar "sem sinal" em até 4 s (3 s de detecção + 1 s de propagação).
  - **CA2:** Dado um robô conectado, quando o backend envia ping a cada 1 s e recebe pong **ou** qualquer mensagem dentro de 3 s, então o robô continua considerado conectado.
  - **CA3:** Dado um robô conectado, quando passam 3 s sem pong nem mensagem, então o backend declara o sinal perdido e registra o evento `SINAL_PERDIDO` com data e hora.
- **Protótipo:** indicador "sem sinal" do painel ([RF-59](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/139), protótipos da [#244](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/244)).
- **Casos de teste:** CT-BE-03.

### HU-BE-03 — Confirmar ao robô o que já foi gravado

- **Issue:** [#264](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/264)
- **RF:** [RF-74](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/154) · **Prioridade:** Must have (P0) · **RNF:** RNF-50
- **História:** Eu, como **equipe de firmware**, quero que o backend confirme cumulativamente o que já gravou e aceite reenvios sem duplicar nada, para que o ESP32 possa simplesmente reenviar seu buffer depois de uma queda de Wi-Fi, sem precisar processar respostas.
- **Critérios de aceitação:**
  - **CA1 (do RF):** Após uma queda de conexão de até 60 s seguida de reenvio em lote, o banco deve conter cada mensagem exatamente uma vez e a confirmação final deve corresponder à última mensagem recebida, sem lacunas nem duplicatas.
  - **CA2:** Dado que as mensagens 1–10 foram persistidas, quando o lote é confirmado no banco, então o backend envia `ack` com `seq = 10`. O `ack` nunca é enviado antes da transação ser confirmada.
  - **CA3:** Dado que as mensagens 1–4 e 6–8 foram persistidas e a 5 está faltando, quando o backend confirma, então o `ack` é `seq = 4`. Quando a 5 chegar e for persistida, o próximo `ack` passa a ser `seq = 8`.
  - **CA4:** Dado um robô que reconecta e reenvia todo o seu buffer retido, sem ter processado nenhum `ack`, então as mensagens já persistidas são descartadas como duplicatas (RF-77), só as que faltavam são gravadas, e o `ack` final corresponde à última mensagem.
  - **CA5:** Se o robô não reenviar as mensagens perdidas, a corrida registra a lacuna em `seqs_faltantes` (lacuna sinalizada, RNF-50).
- **Protótipo:** não se aplica.
- **Casos de teste:** CT-BE-04.
- **Nota de interface:** o robô é **emissor unidirecional** ([RF-53](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/133), decisão herdada). O `ack` é enviado para cumprir o RF-74, mas o robô não é obrigado a processá-lo. O critério "sem lacunas" (CA1) depende de o firmware reenviar o buffer retido ao reconectar. Ver [`3_arquitetura.md` — seção 2.1](3_arquitetura.md#21-decisões-herdadas-do-tap-e-dos-requisitos).

### HU-BE-04 — Rejeitar mensagens malformadas sem derrubar a conexão

- **Issue:** [#265](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/265)
- **RF:** [RF-75](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/155) · **Prioridade:** Must have (P0) · **RNF:** RNF-56, RNF-57
- **História:** Eu, como **equipe de firmware**, quero que mensagens fora do esquema sejam rejeitadas com o motivo registrado, sem derrubar a conexão, para diagnosticar bugs de serialização no ESP32 sem perder o restante da corrida.
- **Critérios de aceitação:**
  - **CA1:** Dada uma conexão autenticada, quando chega uma mensagem que não segue o esquema JSON da versão declarada (campo obrigatório ausente, tipo errado, `tipo` desconhecido ou JSON inválido), então ela é rejeitada, não é persistida em `mensagem` e não é distribuída.
  - **CA2:** O motivo da rejeição (caminho do campo + regra violada) é registrado no log estruturado e em `mensagem_rejeitada`, e o contador de rejeitadas é incrementado.
  - **CA3:** A conexão permanece aberta e a mensagem válida seguinte é processada normalmente.
- **Protótipo:** não se aplica.
- **Casos de teste:** CT-BE-05.

### HU-BE-05 — Rejeitar dados fisicamente impossíveis

- **Issue:** [#266](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/266)
- **RF:** [RF-76](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/156) · **Prioridade:** Must have (P0) · **RNF:** RNF-56
- **História:** Eu, como **avaliador**, quero que o backend descarte dados impossíveis (célula fora do labirinto, tensão absurda, tempo voltando), para que o mapa e as métricas exibidas sejam confiáveis.
- **Critérios de aceitação:**
  - **CA1 (do RF):** Uma célula com coordenada fora dos limites do labirinto da corrida deve ser rejeitada, com motivo registrado em log, conexão mantida e contador de rejeitadas incrementado.
  - **CA2:** Um tipo de labirinto fora de {4x4, 8x4, 12x4} em `inicio_corrida` é rejeitado.
  - **CA3:** Uma tensão fora do intervalo [5,0 V; 9,0 V] é rejeitada.
  - **CA4:** Uma mensagem com tempo do robô (`t`) menor que o da última mensagem aceita da mesma corrida (em ordem de `seq`) é rejeitada.
- **Protótipo:** não se aplica.
- **Casos de teste:** CT-BE-06, CT-BE-07.

### HU-BE-06 — Não duplicar dados reenviados

- **Issue:** [#267](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/267)
- **RF:** [RF-77](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/157) · **Prioridade:** Must have (P0) · **RNF:** RNF-50, RNF-56
- **História:** Eu, como **equipe de firmware**, quero poder reenviar mensagens sem medo de duplicá-las, para que a estratégia de reenvio após queda seja simples e segura.
- **Critérios de aceitação:**
  - **CA1:** Dada uma mensagem `(corrida, seq)` já persistida, quando ela chega de novo, então o backend responde com `ack`, não cria novo registro e não gera nova atualização para os painéis.
  - **CA2:** Cada duplicata incrementa o contador de mensagens duplicadas exposto em `/health`.
  - **CA3:** A garantia vale mesmo com duas conexões simultâneas do mesmo robô, pois é imposta pela chave primária `(corrida_id, seq)` do banco.
- **Protótipo:** não se aplica.
- **Casos de teste:** CT-BE-08, CT-BE-04.

### HU-BE-07 — Registrar a corrida sem ação manual

- **Issue:** [#268](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/268)
- **RF:** [RF-78](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/158) · **Prioridade:** Must have (P0)
- **História:** Eu, como **operador**, quero que a corrida seja criada automaticamente quando o robô começa a enviar dados, para não precisar operar o sistema durante a apresentação e não correr o risco de perder uma tentativa por esquecimento.
- **Critérios de aceitação:**
  - **CA1:** Dado um robô autenticado, quando chega `inicio_corrida` com um identificador de corrida novo, então é criada uma corrida `EM_ANDAMENTO` com UUID interno associado ao par (dispositivo, identificador gerado pelo robô).
  - **CA2:** Dado um identificador de corrida desconhecido, quando a primeira mensagem recebida não é `inicio_corrida` (ex.: após uma perda), então a corrida é criada da mesma forma.
  - **CA3:** Dado um `inicio_corrida` repetido (reenvio) ou mensagens concorrentes do mesmo par, então existe exatamente uma corrida para esse par (restrição única no banco).
  - **CA4:** Os painéis inscritos no canal "corridas ao vivo" são notificados da nova corrida.
- **Protótipo:** lista de corridas ao vivo ([#244](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/244)).
- **Casos de teste:** CT-BE-09.

### HU-BE-08 — Guardar o registro bruto e inalterável da corrida

- **Issue:** [#269](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/269)
- **RF:** [RF-79](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/159) · **Prioridade:** Must have (P0) · **RNF:** RNF-49, RNF-51, RNF-54
- **História:** Eu, como **avaliador**, quero que toda mensagem aceita fique guardada tal como chegou, sem edições posteriores, para que qualquer resultado possa ser auditado e reconstituído.
- **Critérios de aceitação:**
  - **CA1:** Toda mensagem aceita é gravada em `mensagem` com `corrida_id`, `seq`, `tipo`, tempo do robô, versão do protocolo, *payload* original e data e hora de recebimento.
  - **CA2:** O registro é *append-only*: tentativas de `UPDATE` ou `DELETE` na tabela `mensagem` são recusadas pelo banco.
  - **CA3 †:** A gravação é feita em lotes transacionais (até 10 ms ou 50 mensagens), sem bloquear o *event loop*.
- **Protótipo:** não se aplica.
- **Casos de teste:** CT-BE-10, CT-BE-33.

### HU-BE-09 — Preservar o estado do mapa periodicamente

- **Issue:** [#270](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/270)
- **RF:** [RF-80](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/160) · **Prioridade:** Must have (P0) · **RNF:** RNF-52
- **História:** Eu, como **operador**, quero que o estado do mapa seja salvo periodicamente, para que o sistema se recupere rápido de um reinício e para que painéis novos recebam o mapa sem reprocessar a corrida inteira.
- **Critérios de aceitação:**
  - **CA1:** O backend mantém em memória, por corrida, as paredes de cada célula visitada e a posição atual do robô.
  - **CA2:** A cada 20 células visitadas (20, 40, 60…) é persistido um `snapshot_mapa` com o estado completo e o `seq` de corte.
  - **CA3:** Ao fim da corrida é persistido um snapshot final, mesmo que o total de células não seja múltiplo de 20.
- **Protótipo:** não se aplica.
- **Casos de teste:** CT-BE-11, CT-BE-34.

### HU-BE-10 — Encerrar ou marcar como interrompida cada corrida

- **Issue:** [#271](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/271)
- **RF:** [RF-81](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/161) · **Prioridade:** Must have (P0) · **RNF:** RNF-52
- **História:** Eu, como **operador**, quero que toda corrida termine com um status definido, mesmo quando o robô reinicia ou some da rede, para que não fiquem corridas "penduradas" no histórico.
- **Critérios de aceitação:**
  - **CA1 (do RF):** Ao reconectar o mesmo robô após reinício, a corrida anterior deve virar INTERROMPIDA (motivo: reinício) em até 1 s.
  - **CA2 (do RF):** Se, após 120 s sem sinal, chegar depois um lote com fim de corrida bem-sucedido, o status deve passar a CONCLUÍDA com o tempo do relógio do robô.
  - **CA3:** Dada uma corrida `EM_ANDAMENTO`, quando chega `fim_corrida`, então ela é encerrada (`CONCLUÍDA` ou `FALHOU`, conforme o resultado informado).
  - **CA4:** Dada uma corrida `EM_ANDAMENTO`, quando passam 120 s sem sinal do robô, então ela passa a `INTERROMPIDA` com motivo `SEM_SINAL`.
  - **CA5 †:** O reinício é detectado pelo `boot` informado no `hello`: um valor diferente do `boot` da corrida em andamento do mesmo dispositivo caracteriza reinício.
- **Protótipo:** sinalização de falha de execução ([RF-69](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/149)).
- **Casos de teste:** CT-BE-12, CT-BE-13, CT-BE-14.

### HU-BE-11 — Obter o tempo oficial de conclusão

- **Issue:** [#272](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/272)
- **RF:** [RF-82](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/162) · **Prioridade:** Must have (P0)
- **História:** Eu, como **avaliador**, quero que o tempo de conclusão seja medido pelo relógio do próprio robô, para que atrasos de Wi-Fi não prejudiquem nem beneficiem nenhuma tentativa.
- **Critérios de aceitação:**
  - **CA1 (do RF):** Para início em t = 1.000 ms e fim em t = 95.500 ms no relógio do robô, o tempo de conclusão calculado deve ser 94,5 s, independentemente de atrasos de rede.
  - **CA2:** O tempo de conclusão é gravado na corrida e não é recalculado depois que ela é finalizada.
- **Protótipo:** cronômetro da tentativa ([RF-64](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/144)).
- **Casos de teste:** CT-BE-15.

### HU-BE-12 — Acompanhar a velocidade média

- **Issue:** [#273](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/273)
- **RF:** [RF-83](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/163) · **Prioridade:** Must have (P0)
- **História:** Eu, como **avaliador**, quero ver a velocidade média do robô atualizada a cada célula, para comparar o desempenho entre tentativas.
- **Critérios de aceitação:**
  - **CA1 (do RF):** Para 30 transições de célula em 45 s, a velocidade média calculada deve ser 0,12 m/s.
  - **CA2:** A velocidade é recalculada a cada nova transição de célula como (transições × 0,18 m) ÷ tempo decorrido no relógio do robô e distribuída aos painéis inscritos.
  - **CA3:** No fim da corrida, o valor é fixado e passa a ser o valor oficial.
- **Protótipo:** painel de métricas ([RF-57](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/137)).
- **Casos de teste:** CT-BE-16.

### HU-BE-13 — Reconstituir o trajeto percorrido

- **Issue:** [#274](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/274)
- **RF:** [RF-84](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/164) · **Prioridade:** Must have (P0)
- **História:** Eu, como **equipe de frontend**, quero receber o trajeto já ordenado, com o tempo de cada passagem e as revisitas marcadas, para desenhá-lo no painel sem reimplementar regras de negócio.
- **Critérios de aceitação:**
  - **CA1:** O trajeto é a lista de células visitadas ordenada por `seq`, com o tempo do robô de cada passagem.
  - **CA2:** Cada passagem indica se é revisita, e a corrida expõe o total de revisitas.
  - **CA3:** Mensagens reenviadas fora de ordem não alteram a ordem final do trajeto.
- **Protótipo:** visualização do trajeto ([RF-61](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/141)).
- **Casos de teste:** CT-BE-17.

### HU-BE-14 — Avaliar o consumo de bateria da corrida

- **Issue:** [#275](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/275)
- **RF:** [RF-85](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/165) · **Prioridade:** Must have (P0)
- **História:** Eu, como **operador**, quero saber a tensão inicial, a tensão final, a queda de tensão e a carga estimada de cada corrida, para decidir se a bateria aguenta mais uma tentativa.
- **Critérios de aceitação:**
  - **CA1:** A tensão inicial é a da primeira leitura de energia da corrida, e a final é a da última.
  - **CA2:** ΔV = tensão inicial − tensão final.
  - **CA3 †:** A carga estimada (%) é obtida por interpolação linear numa curva tensão→carga configurável. Curva padrão LiPo 2S: 8,4 V → 100 %; 7,6 V → 50 %; 7,0 V → 10 %; 6,0 V → 0 %. Exemplo: 8,2 V → 87,5 %.
  - **CA4:** Alterar a curva na configuração não exige mudança de código.
- **Protótipo:** gráfico de consumo ([RF-68](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/148)).
- **Casos de teste:** CT-BE-18.
- **Observação:** a curva padrão precisa ser validada com a frente de Energia.

### HU-BE-15 — Ser alertado de bateria baixa

- **Issue:** [#276](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/276)
- **RF:** [RF-86](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/166) · **Prioridade:** Should have (P1)
- **História:** Eu, como **operador**, quero ser alertado quando a bateria cair abaixo de um limite seguro, para interromper a tentativa antes de danificar a LiPo ou de o robô falhar por falta de energia.
- **Critérios de aceitação:**
  - **CA1:** Quando uma leitura aceita fica abaixo de 7,0 V (limiar configurável), os painéis inscritos na corrida recebem `alerta` do tipo `TENSAO_BAIXA` com a tensão medida.
  - **CA2 †:** O alerta não se repete a cada amostra. Um novo alerta só é emitido depois de a tensão voltar acima de limiar + 0,1 V e cair de novo.
- **Protótipo:** alerta no painel ([#244](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/244)).
- **Casos de teste:** CT-BE-19.

### HU-BE-16 — Saber o resultado da corrida e o motivo

- **Issue:** [#277](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/277)
- **RF:** [RF-87](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/167) · **Prioridade:** Must have (P0)
- **História:** Eu, como **avaliador**, quero ver o status de cada corrida e o motivo do término, para distinguir uma falha do robô de um problema de comunicação.
- **Critérios de aceitação:**
  - **CA1:** Toda corrida tem status ∈ {`EM_ANDAMENTO`, `CONCLUÍDA`, `FALHOU`, `INTERROMPIDA`}. Toda corrida encerrada tem motivo ∈ {`SUCESSO`, `FALHA_REPORTADA`, `SEM_SINAL`, `REINICIO_ROBO`}, com detalhe textual opcional vindo do firmware.
  - **CA2:** As transições permitidas são `EM_ANDAMENTO → {CONCLUÍDA, FALHOU, INTERROMPIDA}` e `INTERROMPIDA (SEM_SINAL) → {CONCLUÍDA, FALHOU}` (lote tardio). Qualquer outra transição é recusada.
  - **CA3:** Toda mudança de status é distribuída aos painéis como evento discreto.
- **Protótipo:** indicação de desafio cumprido e de falha ([RF-63](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/143), [RF-69](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/149)).
- **Casos de teste:** CT-BE-20, CT-BE-13.

### HU-BE-17 — Receber só as atualizações da corrida acompanhada

- **Issue:** [#278](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/278)
- **RF:** [RF-88](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/168) · **Prioridade:** Must have (P0) · **RNF:** RNF-48, RNF-51
- **História:** Eu, como **equipe de frontend**, quero que o painel receba apenas as atualizações da corrida em que se inscreveu, além de um canal geral de corridas ao vivo, para não processar dados irrelevantes.
- **Critérios de aceitação:**
  - **CA1:** Dados dois painéis inscritos em corridas diferentes, cada um recebe apenas os eventos da sua corrida.
  - **CA2:** O canal "corridas ao vivo" recebe apenas o resumo de início, fim e mudança de status de todas as corridas.
  - **CA3:** Depois de `cancelar`, o painel não recebe mais eventos daquela corrida.
- **Protótipo:** tela de acompanhamento ao vivo ([#244](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/244)).
- **Casos de teste:** CT-BE-21.

### HU-BE-18 — Entrar no meio da corrida e ver o estado completo

- **Issue:** [#279](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/279)
- **RF:** [RF-89](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/169) · **Prioridade:** Must have (P0)
- **História:** Eu, como **avaliador**, quero abrir o painel no meio de uma corrida e ver o mapa exatamente como ele está, para acompanhar a tentativa sem ter estado presente desde o início.
- **Critérios de aceitação:**
  - **CA1 (do RF):** Um painel inscrito após 300 mensagens já processadas deve receber o snapshot com corte em 300 e, depois, apenas mensagens posteriores, resultando em mapa idêntico ao de um painel conectado desde o início.
  - **CA2:** O snapshot contém mapa (paredes por célula), posição, métricas atuais, status e `seq` de corte.
- **Protótipo:** tela de acompanhamento ao vivo ([#244](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/244)).
- **Casos de teste:** CT-BE-22.

### HU-BE-19 — Receber dados contínuos em ritmo controlado

- **Issue:** [#280](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/280)
- **RF:** [RF-90](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/170) · **Prioridade:** Must have (P0) · **RNF:** RNF-48, RNF-49
- **História:** Eu, como **equipe de frontend**, quero receber no máximo 10 atualizações contínuas por segundo, sempre com o valor mais recente, sem perder nenhum evento discreto, para manter o painel fluido (RNF-38) sem deixar de mostrar nenhuma célula.
- **Critérios de aceitação:**
  - **CA1 (do RF):** Com o robô enviando 50 atualizações de posição/s, cada painel deve receber no máximo 10 atualizações contínuas/s, sempre com a posição mais recente; eventos discretos (ex.: 5 células visitadas em 100 ms) devem chegar todos, na ordem de sequência.
  - **CA2:** Posição e energia são dados contínuos. Célula visitada e mudança de status são eventos discretos.
- **Protótipo:** não se aplica.
- **Casos de teste:** CT-BE-23.

### HU-BE-20 — Não deixar um painel lento prejudicar os demais

- **Issue:** [#281](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/281)
- **RF:** [RF-91](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/171) · **Prioridade:** Should have (P1)
- **História:** Eu, como **operador**, quero que um painel com rede ruim não acumule memória nem atrase os outros, para que o sistema continue estável durante a apresentação.
- **Critérios de aceitação:**
  - **CA1:** Quando o buffer de envio de um painel passa de 1 MB, os dados contínuos pendentes para ele são descartados. Os eventos discretos são mantidos.
  - **CA2:** Se a condição persistir por 10 s, o painel é desconectado (código de fechamento `1013`) e o fato é registrado em log.
  - **CA3:** Os demais painéis continuam recebendo normalmente durante o episódio.
- **Protótipo:** não se aplica. O painel reconecta sozinho ([RNF-39](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/217)).
- **Casos de teste:** CT-BE-24.

### HU-BE-21 — Ver no painel a perda e a retomada de sinal

- **Issue:** [#282](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/282)
- **RF:** [RF-92](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/172) · **Prioridade:** Must have (P0)
- **História:** Eu, como **avaliador**, quero ver no painel quando o robô perdeu e recuperou o sinal, para entender por que os dados pararam de chegar.
- **Critérios de aceitação:**
  - **CA1:** Em até 1 s após a detecção de perda (HU-BE-02), os painéis inscritos recebem `sinal` com estado `PERDIDO`.
  - **CA2:** Em até 1 s após a reconexão aceita do robô, os painéis recebem `sinal` com estado `RETOMADO`.
- **Protótipo:** indicação do estado da conexão ([RF-59](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/139)).
- **Casos de teste:** CT-BE-25, CT-BE-03.

### HU-BE-22 — Consultar o histórico de corridas

- **Issue:** [#283](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/283)
- **RF:** [RF-93](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/173) · **Prioridade:** Must have (P0)
- **História:** Eu, como **avaliador**, quero listar as corridas filtrando por tipo de labirinto, status e período, para encontrar rapidamente uma tentativa específica.
- **Critérios de aceitação:**
  - **CA1:** `GET /api/corridas` aceita os filtros `tipo`, `status`, `de` e `ate` (ISO-8601), combináveis entre si.
  - **CA2:** A paginação usa `pagina` e `tamanho` (padrão 20, máximo 100) e a resposta traz `total`.
  - **CA3:** A ordenação padrão é por início, da mais recente para a mais antiga.
  - **CA4:** Com 200 corridas cadastradas, a resposta chega em menos de 2 s (coerente com o [RNF-43](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/221)).
- **Protótipo:** listagem do histórico e filtro ([RF-65](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/145), [RF-66](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/146)).
- **Casos de teste:** CT-BE-26.

### HU-BE-23 — Rever uma corrida passo a passo

- **Issue:** [#284](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/284)
- **RF:** [RF-94](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/174) · **Prioridade:** Should have (P1)
- **História:** Eu, como **operador**, quero obter a linha do tempo completa de uma corrida, para reproduzi-la no painel e analisar onde o robô errou.
- **Critérios de aceitação:**
  - **CA1:** `GET /api/corridas/{id}/linha-do-tempo` retorna todas as mensagens aceitas, em ordem de `seq`, com o tempo do robô.
  - **CA2:** Reproduzir a linha do tempo resulta no mesmo mapa do snapshot final da corrida.
  - **CA3 †:** A resposta é transmitida em *stream*, sem carregar a corrida inteira em memória.
- **Protótipo:** detalhamento de execução passada ([RF-67](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/147)).
- **Casos de teste:** CT-BE-27.

### HU-BE-24 — Ver o ranking por tipo de labirinto

- **Issue:** [#285](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/285)
- **RF:** [RF-95](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/175) · **Prioridade:** Must have (P0)
- **História:** Eu, como **avaliador**, quero ver o ranking de cada tipo de labirinto só com corridas válidas, para comparar as tentativas de forma justa.
- **Critérios de aceitação:**
  - **CA1 (do RF):** Com duas corridas CONCLUÍDAS no 4x4 sendo uma delas anulada, apenas a não anulada deve aparecer no leaderboard, atualizado em até 1 s após o fim da corrida.
  - **CA2:** A ordenação é por tempo de conclusão crescente. O desempate é pela menor distância percorrida (transições × 0,18 m).
  - **CA3:** Corridas `FALHOU`, `INTERROMPIDA` ou `EM_ANDAMENTO` nunca aparecem no ranking.
- **Protótipo:** ranking ([#244](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/244)).
- **Casos de teste:** CT-BE-28.

### HU-BE-25 — Anular uma corrida inválida

- **Issue:** [#286](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/286)
- **RF:** [RF-96](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/176) · **Prioridade:** Should have (P1) · **RNF:** RNF-54, RNF-55
- **História:** Eu, como **operador**, quero anular uma corrida com justificativa (ex.: houve toque manual), para retirá-la do ranking sem apagar o histórico.
- **Critérios de aceitação:**
  - **CA1:** `POST /api/corridas/{id}/anulacao` com motivo não vazio, feito por operador autenticado, registra autor, data e motivo, e retira a corrida do ranking.
  - **CA2:** Sem autenticação, a requisição retorna `401` e nada muda.
  - **CA3:** A corrida anulada continua disponível na listagem e no detalhe, marcada como anulada.
  - **CA4:** Uma corrida só pode ser anulada uma vez (`409` na segunda tentativa), e apenas corridas finalizadas podem ser anuladas.
- **Protótipo:** ação de anulação no detalhe da corrida ([#244](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/244)).
- **Casos de teste:** CT-BE-29, CT-BE-35.

### HU-BE-26 — Identificar a primeira tentativa em cada labirinto

- **Issue:** [#287](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/287)
- **RF:** [RF-97](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/177) · **Prioridade:** Should have (P1)
- **História:** Eu, como **avaliador**, quero ver o número de cada tentativa por tipo de labirinto dentro da apresentação, porque o TAP valoriza a conclusão na primeira tentativa.
- **Critérios de aceitação:**
  - **CA1:** Toda corrida criada durante uma apresentação ativa recebe `numero_tentativa` sequencial por (apresentação, tipo de labirinto), começando em 1.
  - **CA2:** Corridas anuladas, interrompidas ou que falharam também consomem número (toda tentativa conta).
  - **CA3:** A numeração é única por (apresentação, tipo), garantida por restrição no banco.
- **Protótipo:** listagem e detalhe da corrida ([#244](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/244)).
- **Casos de teste:** CT-BE-30.

### HU-BE-27 — Exportar os dados de uma corrida

- **Issue:** [#288](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/288)
- **RF:** [RF-98](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/178) · **Prioridade:** Could have (P2) · **RNF:** RNF-49
- **História:** Eu, como **operador**, quero exportar uma corrida em JSON e CSV, para usar os dados no relatório final e em planilhas.
- **Critérios de aceitação:**
  - **CA1:** `GET /api/corridas/{id}/exportacao?formato=json` retorna o resumo da corrida, as métricas, o trajeto e as leituras de energia.
  - **CA2:** `formato=csv` retorna uma linha por mensagem (`seq`, `t_robo_ms`, `tipo` e os campos do *payload* achatados), com cabeçalho e separador `,`.
  - **CA3:** A exportação é gerada em *stream* e não eleva o atraso do *event loop* acima do limite do RNF-49.
- **Protótipo:** botão de exportação ([RF-71](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/151)).
- **Casos de teste:** CT-BE-31.
