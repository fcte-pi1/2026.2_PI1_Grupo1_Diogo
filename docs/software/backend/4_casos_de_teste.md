# Roteiro de Testes Funcionais — Backend

**Versão:** 1.1 — alinhada ao Guia da Equipe de Software (21/09/2026)
**Issue:** [#258 — 4.2 Casos de teste do backend](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/258)
**Escopo:** casos de teste funcionais do backend, derivados dos critérios de aceite dos RF-72 a RF-98 e das [HU-BE-01 a HU-BE-27](1_historias_de_usuario.md). Quando o RF traz um critério de aceite, ele é o **resultado esperado** do caso de teste, com os mesmos números. Uma seção final cobre os RNF verificáveis por teste.

Estes casos guiam a automação E2E exigida no documento [`7.4 - Testes de software`](../../7.4%20-%20Testes%20de%20software.md). Todos podem ser executados **sem hardware**, com o simulador de robô em Node (RNF-53).

---

## Ambiente e ferramentas

| Item | Definição |
|:--|:--|
| **AMB — ambiente padrão** | Backend e PostgreSQL 16 subidos por `docker compose up`, banco com as migrações aplicadas e sem corridas. Dispositivo `sim-01` cadastrado com token `T-VALIDO`. Operador `op1` cadastrado. Apresentação "Teste" ativa. |
| **SIM** | Simulador de robô (`src/backend/simulador`). Envia `hello` e mensagens do protocolo v1 com `seq`, `t` e taxa configuráveis. Permite derrubar e retomar a conexão, reiniciar (novo `boot`), silenciar o pong e reenviar o buffer retido. Como o robô real, o SIM é **emissor unidirecional**: nenhum passo do SIM depende de ler respostas do backend. Os `ack` recebidos são apenas registrados para verificação. |
| **PNL** | Cliente de painel de teste: conecta em `/ws/painel`, se inscreve e grava cada mensagem recebida com o horário de chegada. Pode simular um consumidor lento (não lê o socket). |
| **SQL** | Consultas diretas ao banco para verificar o estado persistido. |
| **Nível** | **E2E** = SIM → backend → PNL/HTTP · **INT** = serviço + PostgreSQL real · **UNI** = domínio puro |

## Matriz de rastreabilidade

| Caso de teste | RF/RNF | HU | Prioridade | Nível |
|:--|:--|:--|:--:|:--:|
| CT-BE-01 | [RF-72](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/152) | [HU-BE-01](1_historias_de_usuario.md#hu-be-01--conectar-somente-robôs-autorizados) | Must have | E2E |
| CT-BE-02 | [RF-72](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/152) | [HU-BE-01](1_historias_de_usuario.md#hu-be-01--conectar-somente-robôs-autorizados) | Must have | E2E |
| CT-BE-03 | [RF-73](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/153), [RF-92](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/172) | [HU-BE-02](1_historias_de_usuario.md#hu-be-02--saber-rapidamente-quando-o-robô-perdeu-o-sinal), [HU-BE-21](1_historias_de_usuario.md#hu-be-21--ver-no-painel-a-perda-e-a-retomada-de-sinal) | Must have | E2E |
| CT-BE-04 | [RF-74](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/154), [RF-77](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/157) | [HU-BE-03](1_historias_de_usuario.md#hu-be-03--confirmar-ao-robô-o-que-já-foi-gravado), [HU-BE-06](1_historias_de_usuario.md#hu-be-06--não-duplicar-dados-reenviados) | Must have | E2E |
| CT-BE-05 | [RF-75](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/155) | [HU-BE-04](1_historias_de_usuario.md#hu-be-04--rejeitar-mensagens-malformadas-sem-derrubar-a-conexão) | Must have | E2E |
| CT-BE-06 | [RF-76](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/156) | [HU-BE-05](1_historias_de_usuario.md#hu-be-05--rejeitar-dados-fisicamente-impossíveis) | Must have | E2E |
| CT-BE-07 | [RF-76](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/156) | [HU-BE-05](1_historias_de_usuario.md#hu-be-05--rejeitar-dados-fisicamente-impossíveis) | Must have | E2E |
| CT-BE-08 | [RF-77](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/157) | [HU-BE-06](1_historias_de_usuario.md#hu-be-06--não-duplicar-dados-reenviados) | Must have | E2E |
| CT-BE-09 | [RF-78](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/158) | [HU-BE-07](1_historias_de_usuario.md#hu-be-07--registrar-a-corrida-sem-ação-manual) | Must have | E2E |
| CT-BE-10 | [RF-79](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/159) | [HU-BE-08](1_historias_de_usuario.md#hu-be-08--guardar-o-registro-bruto-e-inalterável-da-corrida) | Must have | INT |
| CT-BE-11 | [RF-80](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/160) | [HU-BE-09](1_historias_de_usuario.md#hu-be-09--preservar-o-estado-do-mapa-periodicamente) | Must have | E2E |
| CT-BE-12 | [RF-81](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/161) | [HU-BE-10](1_historias_de_usuario.md#hu-be-10--encerrar-ou-marcar-como-interrompida-cada-corrida) | Must have | E2E |
| CT-BE-13 | [RF-81](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/161), [RF-87](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/167) | [HU-BE-10](1_historias_de_usuario.md#hu-be-10--encerrar-ou-marcar-como-interrompida-cada-corrida), [HU-BE-16](1_historias_de_usuario.md#hu-be-16--saber-o-resultado-da-corrida-e-o-motivo) | Must have | E2E |
| CT-BE-14 | [RF-81](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/161) | [HU-BE-10](1_historias_de_usuario.md#hu-be-10--encerrar-ou-marcar-como-interrompida-cada-corrida) | Must have | E2E |
| CT-BE-15 | [RF-82](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/162) | [HU-BE-11](1_historias_de_usuario.md#hu-be-11--obter-o-tempo-oficial-de-conclusão) | Must have | E2E |
| CT-BE-16 | [RF-83](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/163) | [HU-BE-12](1_historias_de_usuario.md#hu-be-12--acompanhar-a-velocidade-média) | Must have | E2E |
| CT-BE-17 | [RF-84](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/164) | [HU-BE-13](1_historias_de_usuario.md#hu-be-13--reconstituir-o-trajeto-percorrido) | Must have | E2E |
| CT-BE-18 | [RF-85](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/165) | [HU-BE-14](1_historias_de_usuario.md#hu-be-14--avaliar-o-consumo-de-bateria-da-corrida) | Must have | E2E |
| CT-BE-19 | [RF-86](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/166) | [HU-BE-15](1_historias_de_usuario.md#hu-be-15--ser-alertado-de-bateria-baixa) | Should have | E2E |
| CT-BE-20 | [RF-87](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/167) | [HU-BE-16](1_historias_de_usuario.md#hu-be-16--saber-o-resultado-da-corrida-e-o-motivo) | Must have | E2E |
| CT-BE-21 | [RF-88](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/168) | [HU-BE-17](1_historias_de_usuario.md#hu-be-17--receber-só-as-atualizações-da-corrida-acompanhada) | Must have | E2E |
| CT-BE-22 | [RF-89](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/169) | [HU-BE-18](1_historias_de_usuario.md#hu-be-18--entrar-no-meio-da-corrida-e-ver-o-estado-completo) | Must have | E2E |
| CT-BE-23 | [RF-90](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/170) | [HU-BE-19](1_historias_de_usuario.md#hu-be-19--receber-dados-contínuos-em-ritmo-controlado) | Must have | E2E |
| CT-BE-24 | [RF-91](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/171) | [HU-BE-20](1_historias_de_usuario.md#hu-be-20--não-deixar-um-painel-lento-prejudicar-os-demais) | Should have | E2E |
| CT-BE-25 | [RF-92](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/172) | [HU-BE-21](1_historias_de_usuario.md#hu-be-21--ver-no-painel-a-perda-e-a-retomada-de-sinal) | Must have | E2E |
| CT-BE-26 | [RF-93](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/173) | [HU-BE-22](1_historias_de_usuario.md#hu-be-22--consultar-o-histórico-de-corridas) | Must have | E2E |
| CT-BE-27 | [RF-94](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/174) | [HU-BE-23](1_historias_de_usuario.md#hu-be-23--rever-uma-corrida-passo-a-passo) | Should have | E2E |
| CT-BE-28 | [RF-95](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/175) | [HU-BE-24](1_historias_de_usuario.md#hu-be-24--ver-o-ranking-por-tipo-de-labirinto) | Must have | E2E |
| CT-BE-29 | [RF-96](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/176) | [HU-BE-25](1_historias_de_usuario.md#hu-be-25--anular-uma-corrida-inválida) | Should have | E2E |
| CT-BE-30 | [RF-97](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/177) | [HU-BE-26](1_historias_de_usuario.md#hu-be-26--identificar-a-primeira-tentativa-em-cada-labirinto) | Should have | E2E |
| CT-BE-31 | [RF-98](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/178) | [HU-BE-27](1_historias_de_usuario.md#hu-be-27--exportar-os-dados-de-uma-corrida) | Could have | E2E |
| CT-BE-32 | [RNF-48](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/226) | [HU-BE-17](1_historias_de_usuario.md#hu-be-17--receber-só-as-atualizações-da-corrida-acompanhada), [HU-BE-19](1_historias_de_usuario.md#hu-be-19--receber-dados-contínuos-em-ritmo-controlado) | Must have | E2E |
| CT-BE-33 | [RNF-49](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/227), [RNF-51](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/229) | [HU-BE-08](1_historias_de_usuario.md#hu-be-08--guardar-o-registro-bruto-e-inalterável-da-corrida), [HU-BE-17](1_historias_de_usuario.md#hu-be-17--receber-só-as-atualizações-da-corrida-acompanhada) | Must have | E2E |
| CT-BE-34 | [RNF-52](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/230) | [HU-BE-09](1_historias_de_usuario.md#hu-be-09--preservar-o-estado-do-mapa-periodicamente), [HU-BE-10](1_historias_de_usuario.md#hu-be-10--encerrar-ou-marcar-como-interrompida-cada-corrida) | Must have | E2E |
| CT-BE-35 | [RNF-54](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/232) | [HU-BE-25](1_historias_de_usuario.md#hu-be-25--anular-uma-corrida-inválida) | Must have | INT |
| CT-BE-36 | [RNF-56](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/234) | [HU-BE-04](1_historias_de_usuario.md#hu-be-04--rejeitar-mensagens-malformadas-sem-derrubar-a-conexão) a [HU-BE-06](1_historias_de_usuario.md#hu-be-06--não-duplicar-dados-reenviados) | Must have | E2E |
| CT-BE-37 | [RNF-57](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/235) | [HU-BE-01](1_historias_de_usuario.md#hu-be-01--conectar-somente-robôs-autorizados) | Should have | E2E |
| CT-BE-38 | [RNF-58](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/236) | — | Should have | Manual |

> RNF-50 é verificado pelo CT-BE-04, RNF-55 pelos CT-BE-02 e CT-BE-29, e RNF-53 pela própria execução desta suíte com o SIM, somada ao relatório de cobertura.

---

## Casos de teste — Requisitos Funcionais

### CT-BE-01 — Aceitar conexão de dispositivo autorizado

- **Rastreabilidade:** [RF-72](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/152) · [HU-BE-01](1_historias_de_usuario.md#hu-be-01--conectar-somente-robôs-autorizados) (CA1)
- **Objetivo:** verificar que um dispositivo com token válido e versão suportada é autenticado.
- **Pré-condições:** AMB.
- **Procedimentos:**
  1. SIM abre a conexão em `/ws/telemetria`.
  2. SIM envia `hello {dispositivo: "sim-01", token: "T-VALIDO", v: 1, boot: "b1"}`.
  3. SIM envia `inicio_corrida` (`seq` 1, `labirinto` 4x4).
- **Resultado esperado:** a conexão continua aberta, existe um `evento_conexao` do tipo `CONECTADO` para `sim-01` e uma corrida `EM_ANDAMENTO` foi criada. O backend enviou `ack` com `seq = 1` (registrado pelo SIM, que não precisa processá-lo).

### CT-BE-02 — Recusar token inválido e versão não suportada

- **Rastreabilidade:** [RF-72](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/152) · [HU-BE-01](1_historias_de_usuario.md#hu-be-01--conectar-somente-robôs-autorizados) (CA2, CA3, CA4) · [RNF-55](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/233)
- **Objetivo:** verificar que fontes não autorizadas ou incompatíveis não conseguem gravar dados.
- **Pré-condições:** AMB.
- **Procedimentos:**
  1. SIM envia `hello` com token `T-ERRADO`.
  2. Nova conexão: SIM envia `hello` válido com `v: 99`.
  3. Nova conexão: SIM envia `celula` sem enviar `hello` antes.
  4. Nova conexão: SIM não envia nada por 6 s.
- **Resultado esperado:**
  1. Conexão fechada pelo backend com código `4001` (`TOKEN_INVALIDO`).
  2. Conexão fechada pelo backend com código `4002` (`VERSAO_NAO_SUPORTADA`).
  3. Conexão encerrada.
  4. Conexão encerrada em até 5 s.
  - Em todos os cenários, `SELECT count(*) FROM corrida` = 0 e cada tentativa aparece no log.

### CT-BE-03 — Detectar perda de conexão por heartbeat

- **Rastreabilidade:** [RF-73](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/153), [RF-92](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/172) · [HU-BE-02](1_historias_de_usuario.md#hu-be-02--saber-rapidamente-quando-o-robô-perdeu-o-sinal), [HU-BE-21](1_historias_de_usuario.md#hu-be-21--ver-no-painel-a-perda-e-a-retomada-de-sinal)
- **Objetivo:** verificar a detecção de silêncio em 3 s e a notificação ao painel.
- **Pré-condições:** AMB. SIM autenticado com corrida em andamento. PNL inscrito na corrida.
- **Procedimentos:**
  1. SIM para de responder pong e de enviar mensagens, com a conexão TCP ainda aberta (instante T0).
  2. Registrar o instante em que PNL recebe `sinal PERDIDO`.
- **Resultado esperado:** **(critério do RF-73)** com o robô conectado, ao parar de responder, o painel deve mostrar "sem sinal" em até 4 s (3 s de detecção + 1 s de propagação). O `sinal PERDIDO` chega entre T0 + 3 s e T0 + 4 s, e existe `evento_conexao SINAL_PERDIDO`.

### CT-BE-04 — Confirmação cumulativa e reenvio após queda de 60 s

- **Rastreabilidade:** [RF-74](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/154), [RF-77](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/157) · [HU-BE-03](1_historias_de_usuario.md#hu-be-03--confirmar-ao-robô-o-que-já-foi-gravado), [HU-BE-06](1_historias_de_usuario.md#hu-be-06--não-duplicar-dados-reenviados) · [RNF-50](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/228)
- **Objetivo:** verificar que queda e reenvio em lote não geram lacunas nem duplicatas.
- **Pré-condições:** AMB. SIM autenticado, corrida iniciada.
- **Procedimentos:**
  1. SIM envia `seq` 1 a 120 (buffer circular configurado para 60 s).
  2. SIM derruba a conexão e acumula `seq` 121 a 400 por 60 s.
  3. SIM reconecta com o mesmo `boot`, envia `hello` e, sem esperar resposta, reenvia todo o buffer retido: `seq` 101 a 400 (a sobreposição de 101–120 é esperada, porque o robô não sabe o que já foi gravado).
- **Resultado esperado:**
  - **(critério do RF-74)** Após uma queda de conexão de até 60 s seguida de reenvio em lote, o banco deve conter cada mensagem exatamente uma vez e a confirmação final deve corresponder à última mensagem recebida, sem lacunas nem duplicatas.
  - `SELECT count(*), count(DISTINCT seq), min(seq), max(seq) FROM mensagem WHERE corrida_id = X` retorna `400, 400, 1, 400`.
  - O último `ack` enviado pelo backend é `400`, o contador de duplicadas aumentou em 20 e `corrida.seqs_faltantes = 0`.
  - **Variante (reenvio desativado no SIM):** após reconectar, o SIM continua a partir de `seq` 401. Resultado: nenhuma duplicata, `seqs_faltantes = 280` (lacunas 121–400 sinalizadas, RNF-50).

### CT-BE-05 — Rejeitar mensagem fora do esquema sem encerrar a conexão

- **Rastreabilidade:** [RF-75](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/155) · [HU-BE-04](1_historias_de_usuario.md#hu-be-04--rejeitar-mensagens-malformadas-sem-derrubar-a-conexão)
- **Objetivo:** verificar a validação de esquema e a continuidade da conexão.
- **Pré-condições:** AMB. SIM autenticado com corrida em andamento (último `seq` = 10).
- **Procedimentos:**
  1. SIM envia `celula` `seq` 11 sem o campo `paredes`.
  2. SIM envia um texto que não é JSON.
  3. SIM envia `{tipo: "teleporte", seq: 12, ...}`.
  4. SIM envia uma `celula` válida com `seq` 11.
- **Resultado esperado:** os passos 1 a 3 são rejeitados, cada um com uma linha em `mensagem_rejeitada` e no log com o motivo (ex.: `/paredes: obrigatório`). O contador de rejeitadas aumenta em 3 e a conexão continua aberta. O passo 4 é aceito (`ack 11`). Nenhuma mensagem inválida aparece em `mensagem`.

### CT-BE-06 — Rejeitar coordenada fora do labirinto

- **Rastreabilidade:** [RF-76](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/156) · [HU-BE-05](1_historias_de_usuario.md#hu-be-05--rejeitar-dados-fisicamente-impossíveis) (CA1)
- **Objetivo:** verificar a regra de domínio sobre os limites do labirinto.
- **Pré-condições:** AMB. Corrida 4x4 em andamento.
- **Procedimentos:** SIM envia `celula {x: 5, y: 2}` e, em seguida, `celula {x: 3, y: 3}`.
- **Resultado esperado:** **(critério do RF-76)** uma célula com coordenada fora dos limites do labirinto da corrida deve ser rejeitada, com motivo registrado em log, conexão mantida e contador de rejeitadas incrementado. A célula (3, 3) é aceita.

### CT-BE-07 — Rejeitar tipo de labirinto, tensão e tempo inválidos

- **Rastreabilidade:** [RF-76](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/156) · [HU-BE-05](1_historias_de_usuario.md#hu-be-05--rejeitar-dados-fisicamente-impossíveis) (CA2 a CA4)
- **Objetivo:** verificar as demais regras de domínio.
- **Pré-condições:** AMB.
- **Procedimentos:**
  1. SIM envia `inicio_corrida {labirinto: "5x5"}`.
  2. Numa corrida válida, SIM envia `energia {tensao_v: 4.9}` e `energia {tensao_v: 9.1}`.
  3. SIM envia `seq` 20 com `t = 5000` e depois `seq` 21 com `t = 4900`.
- **Resultado esperado:** as quatro mensagens inválidas são rejeitadas com os motivos `LABIRINTO_INVALIDO`, `TENSAO_FORA_DA_FAIXA` (duas vezes) e `TEMPO_DECRESCENTE`. A conexão continua aberta. Uma `energia {tensao_v: 7.4}` enviada logo depois é aceita.

### CT-BE-08 — Mensagem duplicada é confirmada, mas não gravada nem distribuída

- **Rastreabilidade:** [RF-77](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/157) · [HU-BE-06](1_historias_de_usuario.md#hu-be-06--não-duplicar-dados-reenviados)
- **Objetivo:** verificar a idempotência por (corrida, `seq`).
- **Pré-condições:** AMB. Corrida em andamento. PNL inscrito.
- **Procedimentos:** SIM envia `celula seq 30` três vezes seguidas.
- **Resultado esperado:** SIM recebe 3 `ack` com `seq ≥ 30`. `mensagem` tem uma única linha com `seq = 30`. PNL recebe um único evento `celula` com `seq = 30`. O contador de duplicadas aumenta em 2.

### CT-BE-09 — Criação automática e idempotente da corrida

- **Rastreabilidade:** [RF-78](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/158) · [HU-BE-07](1_historias_de_usuario.md#hu-be-07--registrar-a-corrida-sem-ação-manual)
- **Objetivo:** verificar a criação sem ação manual e a unicidade do par (dispositivo, id do robô).
- **Pré-condições:** AMB. PNL inscrito no canal `ao_vivo`.
- **Procedimentos:**
  1. SIM envia `inicio_corrida {corrida: "c-A"}`.
  2. SIM reenvia o mesmo `inicio_corrida`.
  3. SIM envia `celula {corrida: "c-B", seq: 5}` sem ter enviado `inicio_corrida` para `c-B`.
- **Resultado esperado:** existem exatamente 2 corridas (`c-A` e `c-B`), cada uma com UUID próprio e status `EM_ANDAMENTO`. PNL recebe 2 notificações `ao_vivo` de nova corrida.

### CT-BE-10 — Registro append-only

- **Rastreabilidade:** [RF-79](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/159) · [HU-BE-08](1_historias_de_usuario.md#hu-be-08--guardar-o-registro-bruto-e-inalterável-da-corrida)
- **Objetivo:** verificar que as mensagens aceitas são gravadas completas e não podem ser alteradas.
- **Pré-condições:** AMB. Uma corrida com 50 mensagens aceitas.
- **Procedimentos:**
  1. Conferir as colunas de uma linha de `mensagem`.
  2. Com o usuário de banco da aplicação, executar `UPDATE mensagem SET payload = '{}' WHERE seq = 1`.
  3. Executar `DELETE FROM mensagem WHERE seq = 1`.
- **Resultado esperado:** a linha tem `corrida_id`, `seq`, `tipo`, `t_robo_ms`, `versao_protocolo`, `payload` igual ao enviado e `recebida_em`. Os passos 2 e 3 falham (erro de permissão ou "tabela mensagem é append-only") e a linha continua igual.

### CT-BE-11 — Snapshot a cada 20 células e ao fim

- **Rastreabilidade:** [RF-80](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/160) · [HU-BE-09](1_historias_de_usuario.md#hu-be-09--preservar-o-estado-do-mapa-periodicamente)
- **Objetivo:** verificar a política de snapshot.
- **Pré-condições:** AMB. Corrida 8x4 em andamento.
- **Procedimentos:** SIM envia 45 mensagens `celula` intercaladas com `posicao` e depois `fim_corrida`.
- **Resultado esperado:** `snapshot_mapa` tem 3 linhas, com `celulas_visitadas` = 20, 40 e 45 (final). O `estado` do snapshot final tem as paredes de todas as 45 passagens e a última posição.

### CT-BE-12 — Encerramento normal da corrida

- **Rastreabilidade:** [RF-81](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/161) · [HU-BE-10](1_historias_de_usuario.md#hu-be-10--encerrar-ou-marcar-como-interrompida-cada-corrida) (CA3)
- **Objetivo:** verificar o encerramento ao receber `fim_corrida`.
- **Pré-condições:** AMB. Corrida em andamento.
- **Procedimentos:** SIM envia `fim_corrida {resultado: "sucesso"}`.
- **Resultado esperado:** a corrida fica `CONCLUIDA`, com motivo `SUCESSO` e `encerrada_em` preenchido.

### CT-BE-13 — Interrupção por 120 s sem sinal e lote tardio

- **Rastreabilidade:** [RF-81](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/161), [RF-87](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/167) · [HU-BE-10](1_historias_de_usuario.md#hu-be-10--encerrar-ou-marcar-como-interrompida-cada-corrida) (CA2, CA4), [HU-BE-16](1_historias_de_usuario.md#hu-be-16--saber-o-resultado-da-corrida-e-o-motivo) (CA2)
- **Objetivo:** verificar a interrupção por silêncio e a reversão por lote tardio.
- **Pré-condições:** AMB. Corrida em andamento com `t_inicio = 1000`.
- **Procedimentos:**
  1. SIM se desconecta.
  2. Aguardar 121 s e consultar a corrida.
  3. SIM reconecta com o mesmo `boot` e envia o lote pendente, terminando em `fim_corrida {resultado: "sucesso", t: 95500}`.
- **Resultado esperado:** no passo 2, a corrida está `INTERROMPIDA (SEM_SINAL)`. No passo 3, **(critério do RF-81)** se, após 120 s sem sinal, chegar depois um lote com fim de corrida bem-sucedido, o status deve passar a CONCLUÍDA com o tempo do relógio do robô: status `CONCLUIDA` e `tempo_conclusao_ms = 94500`.

### CT-BE-14 — Interrupção por reinício do robô

- **Rastreabilidade:** [RF-81](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/161) · [HU-BE-10](1_historias_de_usuario.md#hu-be-10--encerrar-ou-marcar-como-interrompida-cada-corrida) (CA1, CA5)
- **Objetivo:** verificar a detecção de reinício pelo `boot`.
- **Pré-condições:** AMB. Corrida em andamento, criada na conexão com `boot = "b1"`.
- **Procedimentos:** SIM encerra a conexão e reconecta imediatamente com `boot = "b2"` (instante T0).
- **Resultado esperado:** **(critério do RF-81)** ao reconectar o mesmo robô após reinício, a corrida anterior deve virar INTERROMPIDA (motivo: reinício) em até 1 s: status `INTERROMPIDA`, motivo `REINICIO_ROBO` antes de T0 + 1 s, e `evento_conexao REINICIO_DETECTADO` registrado. Um `fim_corrida` enviado depois para essa corrida é rejeitado.

### CT-BE-15 — Tempo de conclusão pelo relógio do robô

- **Rastreabilidade:** [RF-82](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/162) · [HU-BE-11](1_historias_de_usuario.md#hu-be-11--obter-o-tempo-oficial-de-conclusão)
- **Objetivo:** verificar que o tempo oficial ignora a latência de rede.
- **Pré-condições:** AMB. SIM configurado com atraso de rede artificial variável (0 a 800 ms).
- **Procedimentos:** SIM envia `inicio_corrida` com `t = 1000`, algumas mensagens e `fim_corrida` com `t = 95500`.
- **Resultado esperado:** **(critério do RF-82)** para início em t = 1.000 ms e fim em t = 95.500 ms no relógio do robô, o tempo de conclusão calculado deve ser 94,5 s, independentemente de atrasos de rede (`tempo_conclusao_ms = 94500`).

### CT-BE-16 — Velocidade média

- **Rastreabilidade:** [RF-83](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/163) · [HU-BE-12](1_historias_de_usuario.md#hu-be-12--acompanhar-a-velocidade-média)
- **Objetivo:** verificar a fórmula e a atualização a cada célula.
- **Pré-condições:** AMB. PNL inscrito. Corrida com `t_inicio = 0`.
- **Procedimentos:** SIM envia 31 `celula` (30 transições) espaçadas até `t = 45000` e depois `fim_corrida` em `t = 45000`.
- **Resultado esperado:** **(critério do RF-83)** para 30 transições de célula em 45 s, a velocidade média calculada deve ser 0,12 m/s. PNL recebe a métrica atualizada a cada nova célula, e o valor final gravado é `0.12`.

### CT-BE-17 — Trajeto ordenado com revisitas

- **Rastreabilidade:** [RF-84](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/164) · [HU-BE-13](1_historias_de_usuario.md#hu-be-13--reconstituir-o-trajeto-percorrido)
- **Objetivo:** verificar a derivação do trajeto.
- **Pré-condições:** AMB. Corrida 4x4 em andamento.
- **Procedimentos:** o percurso real é (0,0) `seq 1` → (0,1) `seq 2` → (1,1) `seq 3` → (0,1) `seq 4` → (0,2) `seq 5`. SIM envia na ordem `seq` 1, 2, 4, 5, 3 (a 3 chega por último, como num reenvio) e depois consulta `GET /api/corridas/{id}`.
- **Resultado esperado:** o trajeto retornado é (0,0) → (0,1) → (1,1) → (0,1) → (0,2), em ordem de `seq`, com o `t` de cada passagem. A passagem de `seq 4` é marcada como revisita e `revisitas = 1`. Antes da chegada da `seq 3`, o PNL não recebe os eventos 4 e 5 (ordem de `seq` contíguo). Quando ela chega, recebe 3, 4 e 5 nessa ordem.

### CT-BE-18 — Métricas de energia

- **Rastreabilidade:** [RF-85](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/165) · [HU-BE-14](1_historias_de_usuario.md#hu-be-14--avaliar-o-consumo-de-bateria-da-corrida)
- **Objetivo:** verificar tensão inicial e final, ΔV e carga estimada.
- **Pré-condições:** AMB com a curva padrão (8,4 V → 100 %; 7,6 V → 50 %; 7,0 V → 10 %; 6,0 V → 0 %).
- **Procedimentos:** SIM envia `energia` com as tensões 8,2 / 8,0 / 7,8 / 7,6 V e depois `fim_corrida`.
- **Resultado esperado:** tensão inicial 8,20 V, tensão final 7,60 V, ΔV = 0,60 V, carga inicial 87,5 % e carga final 50,0 %. Alterar a curva em `config` e reiniciar muda o cálculo sem alterar código.

### CT-BE-19 — Alerta de tensão baixa com histerese

- **Rastreabilidade:** [RF-86](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/166) · [HU-BE-15](1_historias_de_usuario.md#hu-be-15--ser-alertado-de-bateria-baixa)
- **Objetivo:** verificar a emissão única do alerta abaixo de 7,0 V.
- **Pré-condições:** AMB. PNL inscrito.
- **Procedimentos:** SIM envia as tensões 7,2 → 6,9 → 6,8 → 7,05 → 6,9 → 7,2 → 6,9 V.
- **Resultado esperado:** PNL recebe exatamente 2 `alerta TENSAO_BAIXA`: um na primeira leitura de 6,9 V e outro na última, depois de a tensão ter voltado acima de 7,1 V. Não há alerta em 6,8 V nem no 6,9 V que vem depois de 7,05 V.

### CT-BE-20 — Status FALHOU com motivo e transição proibida

- **Rastreabilidade:** [RF-87](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/167) · [HU-BE-16](1_historias_de_usuario.md#hu-be-16--saber-o-resultado-da-corrida-e-o-motivo)
- **Objetivo:** verificar o status, o motivo e a máquina de status.
- **Pré-condições:** AMB. PNL inscrito.
- **Procedimentos:**
  1. SIM envia `fim_corrida {resultado: "falha", detalhe: "Erro: sensor ToF 3"}`.
  2. SIM envia outro `fim_corrida {resultado: "sucesso"}` com novo `seq` para a mesma corrida.
- **Resultado esperado:** status `FALHOU`, motivo `FALHA_REPORTADA` e detalhe gravado. PNL recebe o evento de status. O passo 2 é rejeitado (`CORRIDA_FINALIZADA`) e o status continua `FALHOU`.

### CT-BE-21 — Distribuição por inscrição e canal ao vivo

- **Rastreabilidade:** [RF-88](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/168) · [HU-BE-17](1_historias_de_usuario.md#hu-be-17--receber-só-as-atualizações-da-corrida-acompanhada)
- **Objetivo:** verificar o isolamento entre inscrições.
- **Pré-condições:** AMB. Dois SIM (`sim-01` e `sim-02`) com corridas A e B em andamento. PNL-1 inscrito em A, PNL-2 em B, PNL-3 em `ao_vivo`.
- **Procedimentos:**
  1. Os dois SIM enviam 20 mensagens cada.
  2. PNL-1 envia `cancelar {corrida: A}` e SIM-1 envia mais 5 mensagens.
  3. A corrida B termina.
- **Resultado esperado:** PNL-1 recebe apenas eventos de A (nenhum depois do cancelamento). PNL-2 recebe apenas eventos de B. PNL-3 recebe apenas os resumos (início e fim de B), sem eventos de célula.

### CT-BE-22 — Snapshot consistente para inscrição no meio da corrida

- **Rastreabilidade:** [RF-89](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/169) · [HU-BE-18](1_historias_de_usuario.md#hu-be-18--entrar-no-meio-da-corrida-e-ver-o-estado-completo)
- **Objetivo:** verificar que o painel que entra depois converge para o mesmo estado.
- **Pré-condições:** AMB. PNL-A inscrito desde o início da corrida.
- **Procedimentos:**
  1. SIM envia 300 mensagens.
  2. PNL-B se inscreve.
  3. SIM envia mais 200 mensagens.
  4. Comparar os mapas reconstruídos por PNL-A e PNL-B.
- **Resultado esperado:** **(critério do RF-89)** um painel inscrito após 300 mensagens já processadas deve receber o snapshot com corte em 300 e, depois, apenas mensagens posteriores, resultando em mapa idêntico ao de um painel conectado desde o início. PNL-B recebe `snapshot seq_corte = 300` e depois apenas eventos com `seq > 300`.

### CT-BE-23 — Limite de 10 atualizações contínuas/s sem perder eventos discretos

- **Rastreabilidade:** [RF-90](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/170) · [HU-BE-19](1_historias_de_usuario.md#hu-be-19--receber-dados-contínuos-em-ritmo-controlado)
- **Objetivo:** verificar o *throttle* de contínuos e a preservação dos discretos.
- **Pré-condições:** AMB. PNL inscrito.
- **Procedimentos:**
  1. SIM envia `posicao` a 50/s por 10 s.
  2. No meio desse intervalo, SIM envia 5 `celula` em 100 ms.
- **Resultado esperado:** **(critério do RF-90)** com o robô enviando 50 atualizações de posição/s, cada painel deve receber no máximo 10 atualizações contínuas/s, sempre com a posição mais recente; eventos discretos (ex.: 5 células visitadas em 100 ms) devem chegar todos, na ordem de sequência. Em nenhuma janela de 1 s o PNL recebe mais de 10 `continuo`, e o último `continuo` corresponde ao último `posicao` enviado.

### CT-BE-24 — Controle de fluxo de painel lento

- **Rastreabilidade:** [RF-91](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/171) · [HU-BE-20](1_historias_de_usuario.md#hu-be-20--não-deixar-um-painel-lento-prejudicar-os-demais)
- **Objetivo:** verificar o descarte de contínuos e a desconexão do painel lento.
- **Pré-condições:** AMB. PNL-lento (não lê o socket) e PNL-normal inscritos na mesma corrida.
- **Procedimentos:** SIM envia `posicao`, `energia` e `celula` com *payloads* grandes até o `bufferedAmount` do PNL-lento passar de 1 MB, e mantém a situação por 12 s.
- **Resultado esperado:** depois de passar de 1 MB, nenhum novo `continuo` é enfileirado para o PNL-lento. Em cerca de 10 s ele é desconectado com código `1013` e o fato aparece no log. PNL-normal recebe todas as mensagens durante todo o episódio.

### CT-BE-25 — Notificação de perda e retomada de sinal

- **Rastreabilidade:** [RF-92](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/172) · [HU-BE-21](1_historias_de_usuario.md#hu-be-21--ver-no-painel-a-perda-e-a-retomada-de-sinal)
- **Objetivo:** verificar os prazos de notificação.
- **Pré-condições:** AMB. PNL inscrito.
- **Procedimentos:**
  1. Provocar a perda de sinal como no CT-BE-03 e registrar o instante da detecção (evento `SINAL_PERDIDO`).
  2. SIM reconecta com o mesmo `boot` e envia `hello`. Registrar o instante em que o backend aceita o `hello` (evento `SINAL_RETOMADO`).
- **Resultado esperado:** PNL recebe `sinal PERDIDO` até 1 s após a detecção e `sinal RETOMADO` até 1 s após a aceitação do `hello`.

### CT-BE-26 — Listagem com filtros e paginação

- **Rastreabilidade:** [RF-93](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/173) · [HU-BE-22](1_historias_de_usuario.md#hu-be-22--consultar-o-histórico-de-corridas)
- **Objetivo:** verificar filtros, paginação e desempenho da listagem.
- **Pré-condições:** AMB com 200 corridas geradas por *seed*: 4x4, 8x4 e 12x4, com status variados, distribuídas em 3 dias.
- **Procedimentos:**
  1. `GET /api/corridas?tipo=4x4&status=CONCLUIDA&pagina=1&tamanho=20`.
  2. `GET /api/corridas?de=<dia2>&ate=<dia2>`.
  3. `GET /api/corridas?tamanho=500`.
- **Resultado esperado:** o passo 1 retorna no máximo 20 itens, todos 4x4 e `CONCLUIDA`, ordenados do mais recente para o mais antigo, com `total` igual à contagem feita por SQL. O passo 2 retorna só corridas do dia 2. O passo 3 é limitado a 100 itens. Todas as respostas chegam em menos de 2 s.

### CT-BE-27 — Linha do tempo para replay

- **Rastreabilidade:** [RF-94](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/174) · [HU-BE-23](1_historias_de_usuario.md#hu-be-23--rever-uma-corrida-passo-a-passo)
- **Objetivo:** verificar a completude e a ordem da linha do tempo.
- **Pré-condições:** AMB. Corrida concluída com 500 mensagens, algumas recebidas fora de ordem.
- **Procedimentos:** `GET /api/corridas/{id}/linha-do-tempo` e reproduzir as mensagens num `EstadoMapa` vazio.
- **Resultado esperado:** 500 registros em ordem estritamente crescente de `seq`. O mapa reproduzido é idêntico ao `estado` do snapshot final.

### CT-BE-28 — Ranking exclui corridas anuladas e não concluídas

- **Rastreabilidade:** [RF-95](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/175) · [HU-BE-24](1_historias_de_usuario.md#hu-be-24--ver-o-ranking-por-tipo-de-labirinto)
- **Objetivo:** verificar os filtros, a ordenação e o prazo de atualização do ranking.
- **Pré-condições:** AMB. No 4x4: corrida A `CONCLUIDA` (60 s), corrida B `CONCLUIDA` (50 s, anulada), corrida C `FALHOU`. PNL inscrito em `ao_vivo`.
- **Procedimentos:**
  1. `GET /api/leaderboard?labirinto=4x4`.
  2. SIM conclui a corrida D (60 s, com distância menor que a de A) e registra o instante do `fim_corrida`.
  3. Repetir a consulta após a notificação `leaderboard`.
- **Resultado esperado:** **(critério do RF-95)** com duas corridas CONCLUÍDAS no 4x4 sendo uma delas anulada, apenas a não anulada deve aparecer no leaderboard, atualizado em até 1 s após o fim da corrida. O passo 1 retorna só A. No passo 3, D aparece à frente de A (desempate por distância), e a notificação `leaderboard` chega em até 1 s após o fim de D.

### CT-BE-29 — Anulação autenticada com justificativa

- **Rastreabilidade:** [RF-96](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/176) · [HU-BE-25](1_historias_de_usuario.md#hu-be-25--anular-uma-corrida-inválida) · [RNF-55](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/233)
- **Objetivo:** verificar a anulação, a autenticação e a auditoria.
- **Pré-condições:** AMB. Corrida A `CONCLUIDA` no ranking 4x4.
- **Procedimentos:**
  1. `POST /api/corridas/A/anulacao` sem token.
  2. Com token de `op1` e motivo vazio.
  3. Com token de `op1` e motivo "houve toque manual".
  4. Repetir o passo 3.
  5. `GET /api/corridas/A` e `GET /api/leaderboard?labirinto=4x4`.
  6. Tentar anular uma corrida `EM_ANDAMENTO`.
- **Resultado esperado:** 1 → `401`. 2 → `400`. 3 → `201`, com uma linha em `anulacao` contendo autor `op1`, data e motivo. 4 → `409`. 5 → a corrida continua existindo, marcada como anulada, e não aparece no ranking. 6 → `409`.

### CT-BE-30 — Numeração de tentativas por tipo de labirinto

- **Rastreabilidade:** [RF-97](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/177) · [HU-BE-26](1_historias_de_usuario.md#hu-be-26--identificar-a-primeira-tentativa-em-cada-labirinto)
- **Objetivo:** verificar a numeração sequencial por (apresentação, tipo).
- **Pré-condições:** AMB com a apresentação "Teste" ativa e sem corridas.
- **Procedimentos:** SIM executa, em sequência: 4x4 (falha), 4x4 (sucesso), 8x4 (interrompida), 4x4 (sucesso, depois anulada). Em seguida, abrir a apresentação "Final" e executar 4x4.
- **Resultado esperado:** na apresentação "Teste", as corridas 4x4 recebem os números 1, 2 e 3, e a 8x4 recebe 1. Na apresentação "Final", a corrida 4x4 recebe 1.

### CT-BE-31 — Exportação em JSON e CSV

- **Rastreabilidade:** [RF-98](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/178) · [HU-BE-27](1_historias_de_usuario.md#hu-be-27--exportar-os-dados-de-uma-corrida)
- **Objetivo:** verificar o conteúdo e o formato das exportações.
- **Pré-condições:** AMB. Corrida concluída com 300 mensagens.
- **Procedimentos:** `GET .../exportacao?formato=json` e `GET .../exportacao?formato=csv`.
- **Resultado esperado:** o JSON contém resumo, métricas, trajeto e série de energia, consistentes com `GET /api/corridas/{id}`. O CSV tem cabeçalho e 300 linhas de dados em ordem de `seq`, com separador `,`, e abre corretamente numa planilha. Ambos são entregues com o `Content-Type` e o nome de arquivo adequados.

---

## Casos de teste — Requisitos Não-Funcionais

### CT-BE-32 — Latência servidor → painel e ponta a ponta

- **Rastreabilidade:** [RNF-48](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/226) · [HU-BE-17](1_historias_de_usuario.md#hu-be-17--receber-só-as-atualizações-da-corrida-acompanhada), [HU-BE-19](1_historias_de_usuario.md#hu-be-19--receber-dados-contínuos-em-ritmo-controlado)
- **Objetivo:** medir as latências p95.
- **Pré-condições:** AMB. 1 SIM a 20 mensagens/s e 5 PNL inscritos, na mesma rede local.
- **Procedimentos:** executar a corrida por 5 min. O backend registra o instante de recepção e o de envio de cada mensagem. SIM e PNL registram o envio e a recepção com relógios sincronizados (mesma máquina ou NTP local).
- **Resultado esperado:** p95 (recepção → envio ao painel) ≤ 50 ms e p95 ponta a ponta (robô → painel) ≤ 300 ms.

### CT-BE-33 — Carga sustentada sem bloqueio do event loop

- **Rastreabilidade:** [RNF-49](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/227), [RNF-51](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/229) · [HU-BE-08](1_historias_de_usuario.md#hu-be-08--guardar-o-registro-bruto-e-inalterável-da-corrida), [HU-BE-17](1_historias_de_usuario.md#hu-be-17--receber-só-as-atualizações-da-corrida-acompanhada)
- **Objetivo:** verificar a capacidade e a responsividade do backend sob carga.
- **Pré-condições:** AMB. SIM a 50 mensagens/s. 10 PNL inscritos.
- **Procedimentos:** manter a carga por 5 min. Durante o teste, pedir 3 exportações CSV e consultar `/health` a cada 5 s.
- **Resultado esperado:** **(critério do RNF-49)** sob carga de 50 mensagens/s por 5 min, o atraso do event loop deve manter p99 ≤ 20 ms. Todas as mensagens são persistidas (`count` = enviadas), sem desconexão de painel e sem rejeição por sobrecarga.

### CT-BE-34 — Recuperação após reinício do backend

- **Rastreabilidade:** [RNF-52](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/230) · [HU-BE-09](1_historias_de_usuario.md#hu-be-09--preservar-o-estado-do-mapa-periodicamente), [HU-BE-10](1_historias_de_usuario.md#hu-be-10--encerrar-ou-marcar-como-interrompida-cada-corrida)
- **Objetivo:** verificar a retomada da corrida em até 5 s sem perdas.
- **Pré-condições:** AMB. Corrida em andamento com 250 mensagens.
- **Procedimentos:**
  1. Encerrar o processo do backend (`docker compose kill backend`) no instante T0 e reiniciá-lo.
  2. SIM continua gerando mensagens e reenvia a partir do `ack` quando consegue reconectar.
  3. Concluir a corrida.
- **Resultado esperado:** **(critério do RNF-52)** encerrando e reiniciando o processo durante uma corrida simulada, ela deve ser retomada em até 5 s e, após o reenvio do robô, não deve haver lacunas nem duplicatas. `/health` responde "pronto" em até T0 + 5 s (descontado o tempo do contêiner). O estado reconstruído é igual ao de antes da queda, e `count(*) = count(DISTINCT seq) = max(seq)`.

### CT-BE-35 — Imutabilidade da corrida finalizada

- **Rastreabilidade:** [RNF-54](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/232) · [HU-BE-25](1_historias_de_usuario.md#hu-be-25--anular-uma-corrida-inválida)
- **Objetivo:** verificar que uma corrida finalizada só pode ser anulada.
- **Pré-condições:** AMB. Corrida `CONCLUIDA`.
- **Procedimentos:**
  1. Via SQL, `UPDATE corrida SET tempo_conclusao_ms = 1 WHERE id = X`.
  2. `DELETE FROM corrida WHERE id = X`.
  3. Anular pela API.
- **Resultado esperado:** os passos 1 e 2 falham com "corrida X não pode ser alterada". O passo 3 funciona, e a linha de `corrida` continua idêntica à de antes (a anulação fica só em `anulacao`, com autor, data e motivo).

### CT-BE-36 — Observabilidade

- **Rastreabilidade:** [RNF-56](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/234) · [HU-BE-04](1_historias_de_usuario.md#hu-be-04--rejeitar-mensagens-malformadas-sem-derrubar-a-conexão) a [HU-BE-06](1_historias_de_usuario.md#hu-be-06--não-duplicar-dados-reenviados)
- **Objetivo:** verificar logs estruturados, `/health` e contadores.
- **Pré-condições:** AMB.
- **Procedimentos:** SIM envia 10 mensagens válidas, 2 inválidas e 3 duplicadas. Depois, consultar `GET /health` e o log.
- **Resultado esperado:** `/health` responde `200` com o estado do banco, o atraso do *event loop* e os contadores `aceitas = 10`, `rejeitadas = 2` e `duplicadas = 3`. Cada linha de log é um JSON válido com `corrida` e `seq` quando aplicável.

### CT-BE-37 — Compatibilidade com a versão anterior do protocolo

- **Rastreabilidade:** [RNF-57](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/235) · [HU-BE-01](1_historias_de_usuario.md#hu-be-01--conectar-somente-robôs-autorizados)
- **Objetivo:** verificar que o backend aceita a versão atual e a anterior.
- **Pré-condições:** AMB com o backend suportando as versões N e N−1 (em teste, uma versão fictícia `v0` publicada em `protocolo/`).
- **Procedimentos:** SIM executa uma corrida completa em `v: 1` e outra em `v: 0`, e depois tenta `v: -1`.
- **Resultado esperado:** as duas primeiras corridas são aceitas e persistidas com a `versao_protocolo` correta. A terceira recebe `VERSAO_NAO_SUPORTADA`. Os esquemas das versões aceitas estão publicados em `src/backend/protocolo/`.

### CT-BE-38 — Implantação com um único comando

- **Rastreabilidade:** [RNF-58](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/236)
- **Objetivo:** verificar a implantação num notebook limpo.
- **Pré-condições:** notebook com Docker instalado, sem o repositório e sem imagens do projeto em cache. Rede com acesso ao registro de imagens, ou imagens previamente salvas em pendrive para uso em rede isolada.
- **Procedimentos:** clonar o repositório, copiar `.env.example` para `.env`, executar `docker compose up -d` e cronometrar até `/health` responder `200`.
- **Resultado esperado:** backend pronto em ≤ 2 min, sem nenhum outro passo manual. CT-BE-01 passa em seguida.
