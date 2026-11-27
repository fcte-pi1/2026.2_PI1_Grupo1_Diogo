# Mudanças no firmware (19/11/2026) e pendências

Fonte: `git log` da branch `feat/controle-motores-tensao` (commits `683e2c6` a `8282d64`), `LOGS_E_MEDIDAS.md`
(seções 6 e 7) e `MEDICOES.md`. Este arquivo NÃO existia antes; foi criado no início da bateria.
Regra: nenhuma mudança de código sem aprovação; cada mudança nova entra aqui (teste, valor medido, critério,
arquivos e linhas, valor antigo e novo; sem commit).

## O que foi feito (19/11)
| Item | Commit | Chave `calib` / padrão |
|:--|:--|:--|
| P1 ToF "muito perto" (frontal ≤ 40 mm; laterais só 0) e arco recua alvo−40 | 683e2c6 | (sem chave) |
| P2 arco com bitola efetiva 74,2 mm; limite de rumo na reta 30°→10° | 122ce8b | (constantes) |
| P3 desfazer do arco com conferência de progresso e motivo explícito | 4b2cde7 | (constantes) |
| P6 decisão do XSHUT e mensagem de Erro por sensor com teste | 46553cb | - |
| M5 modelo do corpo (CAD), preset_cad, aviso de boot, cabo_frente_mm | 2d572c9 | `preset_cad` 0, `cabo_frente_mm` 12 (proposta), `largura_frente` 101, `largura_com_rodas` 108, `tof_lado_ao_centro` 50,5, `tof_lado_a_frente_do_eixo` 59,15, `eixo_ate_frente` 87, `eixo_ate_tof_frente` 85 |
| M4 pose lateral por célula (limite de rumo 5°, proposta) | cec543b | `centralizar` 0 (desligado) |
| M1 curva com uma roda | 534ac40 | `modo_curva` 0 (arco), `freio_uma_roda` 3,2 |
| M3 velocidade −25% e limite de 10 min fixo | 53ec23d | `freio_arco` 3,2, `freio_pivo` 10,1 (propostas) |
| M2 Flood Fill: 7 testes de propriedade | 13e7cfe | - |
| M6 labirinto em pé por comando BLE `labirinto` (DIP 3 continua proibido) | 7cc1aaa | comando `labirinto 4x8\|4x12\|8x4\|12x4\|4x4\|dip` |
| Botão: toque curto larga ao soltar; toque longo alterna a orientação (inclui 4x4 girado) | 62ef8b5 | - |
| Bloco O no t.py (O1 a O4) e logs `labirinto da proxima largada` / `relato ao painel` | 8282d64 | - |

Chave da memória (NVS): `calib2` (a struct ganhou campos): na primeira gravação o robô volta aos padrões.

## Mudanças durante esta bateria
1. **APROVADA pelo operador (19/11):** correção do erro de compilação do P3. `include/adapters/Drv8833MotionAdapter.hpp:41`
   `char undoFailure_[112]` → `[192]`; `src/adapters/Drv8833MotionAdapter.cpp:1267-1268` `%.0f`/`undo.angle()` →
   `%d`/`static_cast<int>(undo.angle())`. Teste: host 317/317 sem avisos; placa compilou (saída 0, 0 avisos).

2. **APROVADA pelo operador ("aprovo A", ~11:05):** nova chave `calib tof_na_reta` (padrão 1 = como antes; 0 = não lê os ToF
   durante a reta, só nas paradas). Motivo: o `andar` (que lê ToF a cada 10 ms) reinicia a placa e o `motor` direto (sem ToF)
   não; hipótese de módulo ToF puxando o 3V3. Arquivos: `include/domain/Calibration.hpp` (campo `tofInStraight`, contagem 17->18),
   `src/domain/Calibration.cpp` (chave), `src/adapters/Drv8833MotionAdapter.cpp` (`readTofInStraight` em `straight()`: laterais e
   parada pela frente), `src/main.cpp` (chave da memória `calib2`->`calib3`). Teste: `CalibrationTest.TofInStraightDefaultsOnAndAcceptsOnlyZeroOrOne`.
   Host 318/318, 0 avisos; placa compilada (ver build.log).

3. **Calibração aprovada pelo operador ("arrumamos a calibração"): `calib ganho_rumo=1.0`** (era 0; gravado na memória do robô).
   Medido em 3 retas no corredor de MDF: com 0 o robô entortava para a esquerda (E: 33->19->6->0 mm, colado na parede,
   ~16 mm fora do centro pela foto); com 1.0 ficou reto (E: 35->39->40->44 mm, ~7 mm fora do centro, giro -0,1/+0,7/-0,2).
   Causa: roda esquerda mais lenta/fraca (H6: 5,4%): encoders iguais mas a trajetória curva; o giroscópio corrige. Voltar a 0:
   `python t.py calib "ganho_rumo=0"`. VALOR FINAL: `ganho_rumo=0.6` (E: 30->27->31->32->33 mm, desvio ~±3 mm do centro de 33,5; pulsos 503/511/510).

4. **`calib tof_na_reta=0` mantido (operador: "Testar")**, junto com `ganho_rumo=0.6`. Medido: 3 retas com `tof_na_reta=0`: laço 2,0 ms
   médio e pior 3,0 ms (com 1: pior 16-17 ms por I²C do ToF direito morto), pulsos 511/510, 506/505, 511/513, giro -0,4/+0,8/+1,1,
   SEM reinício. Com `tof_na_reta=1` houve 1 reinício em 3 rés (boot efa084->095c0d). Evidência a favor da hipótese
   "a leitura dos ToF (módulo direito defeituoso) durante o movimento provoca os reinícios". Reverter: `calib tof_na_reta=1`.

## Achados e pendências (bateria de 19/11)
1. **Compilação para a placa (P3): FALHOU em 1 arquivo (CORRIGIDO, ver acima; agora compila).** `src/adapters/Drv8833MotionAdapter.cpp:1267`:
   `snprintf` do motivo do desfazer (`undoFailure_[112]`) pode truncar (`-Werror=format-truncation`). Todo o
   resto compilou, inclusive `main.cpp`. **Proposta (aguarda aprovação):** `Drv8833MotionAdapter.hpp:41`
   `undoFailure_[112]` → `[192]` e `Drv8833MotionAdapter.cpp:1267-1268` `%.0f`/`undo.angle()` →
   `%d`/`static_cast<int>(undo.angle())`.
2. **Pista B, D1→A4 (inalcançável), em simulação:** o robô NÃO declara "sem caminho": fica em laço entre A3 e
   B3 (28 rés em 64 passos) até estourar o limite de passos. O Navigator esquece o mapa quando fecha o caminho,
   o que reabre as paredes desconhecidas, redescobre e esquece de novo. É achado do firmware (não do robô
   físico); no robô o teste D9 deve terminar em FALHA por limite de passos (~64 passos, ~3 min) ou pelo limite
   de 10 min.
3. **`t.py` D1/D2 estão escritos para outra pista:** D1 espera 12 passos e D2 espera 10 passos com 2 rés; nas
   pistas A e B da simulação o caminho tem 10 passos, sem rés. Usar `python t.py corrida ...` e comparar com a
   tabela de percursos, ou corrigir as sequências (aguarda aprovação).
4. Critérios de tempo do `t.py` (ex.: curva < 1500 ms) são da velocidade antiga (−25%): tratar como CONFERIR.

## Estado final da calibração (fim de 19/11): `ganho_rumo=0.6`, `centralizar=1`, `tof_na_reta=1` (demais em padrão)
Pendente de aprovação: subir o ganho do kWallCentering; modo que ignore só o ToF morto; commit das 2 mudanças de código.

## Mudança 5 (19/11, pedido do operador): FREIO SUAVE e velocidade menor
Motivo: o robô balançava para a frente e para trás ao frear (inércia). A frenagem é a aceleração do perfil, então ela caiu mais que a velocidade.
| Movimento | Antes (-25%) | Agora |
|---|---|---|
| Reta | 150 mm/s, 450 mm/s² | **120 mm/s, 225 mm/s²** (célula ~2,0 s, era ~1,5 s) |
| Giro no lugar | 225 °/s, 1125 °/s², freio 10,1° | **180 °/s, 562,5 °/s², freio 8,1°** |
| Arco e uma roda | 67,5 °/s, 337,5 °/s², freio 3,2° | **54 °/s, 168,75 °/s², freio 2,6°** |
Padrões do `calib` (freio_arco, freio_pivo, freio_uma_roda) acompanham. Testes: 320 passando; a placa compila com -Werror; NÃO gravado no robô.
Efeito no tempo: pior caso do 12x4 no modelo vai de ~514 s (16/11) para ~803 s, acima do limite fixo de 10 min: nas corridas do 12x4 o limite de 600 s passa a parar a corrida antes do fim.
Risco: a roda esquerda é mais fraca (5,4%): a 120 mm/s pode ficar perto da zona morta; conferir se a reta ainda termina 'ok' e sem 'nao chegou ao fim'.
Todos os valores são PROPOSTA A CONFIRMAR no robô (`calib freio_*` ajusta sem regravar).

## Análise (19/11): giro no lugar numa célula com parede na frente, atrás e num lado
Conta feita com `domain/PivotClearance` (novo, só no computador; NÃO muda o robô): corpo do CAD (traseira 17,25 mm, frente 87 de campo, largura 101, rodas 108), corredor livre 168 mm.
- Eixo no CENTRO da célula: o canto da frente (100,6 mm do eixo) bate 16,6 mm na parede da frente.
- Eixo com a traseira encostada na parede de trás (o que o plano B atual faz quando não consegue recuar): o canto de trás bate ~39 mm.
- Só cabe com o eixo **17 a 27,5 mm ATRÁS do centro** (faixa de 10,5 mm); com 5 mm de folga a faixa some. Com a frente do CAD (107,25 mm) NÃO cabe em posição nenhuma.
- Conclusão: o plano B atual ("sem espaço para recuar: gira no lugar", Drv8833MotionAdapter.cpp:1137) não é seguro nesse cenário. Proposta (aguarda aprovação): antes de girar, levar o eixo ao meio da faixa (-22 mm) com a ré/ToF frontal, e conferir a medida da frente do robô com paquímetro (87 x 107,25).
Teste físico novo no `t.py`: E9. Testes no computador: 326 passando; placa compila.

## Mudança 6 (19/11, pedido do operador): giro no lugar em célula fechada (itens 1 e 2 da análise do PivotClearance)
- `domain::planPivotInPlace` (testes: `PivotPlan.*`) decide: gira já / anda até a faixa e gira / não cabe. `Drv8833MotionAdapter::pivotInBoxedCell` o usa no plano B do arco ("sem espaço para recuar").
- Onde o eixo está: pelo ToF frontal (parede a 84 mm do centro, face do ToF a `eixo_ate_tof_frente`); sem leitura, supõe a traseira na parede de trás (-66,75 mm). Reposiciona SÓ pelos encoders (`suppressFrontStop_` desliga a parada pela frente durante esse avanço, porque no alvo o frontal lê ~21 mm, abaixo do mínimo dele).
- Se a frente configurada for a do CAD (107,25), o plano diz "NAO CABE": o robô avisa no log e gira como antes (comportamento antigo; não há alternativa de ré no Navigator).
- Item 1 (medida da frente do robô com paquímetro) continua pendente: o plano usa `eixo_ate_frente` e `eixo_ate_tof_frente` do `calib`. NÃO gravado no robô. Testes no computador: 332; a placa compila.

## Mudança 7 (19/11, pedido do operador): novas malhas fechadas (commits 1e1aebd a 622c234)
| Malha | Chave do calib | Padrão | Erro que ataca | Evidência |
|---|---|---|---|---|
| Rampa de tensão (`VoltageSlew`) | `rampa_tensao` 50 V/s | LIGADA | BROWNOUT na partida | simulador: subida de >100 V/s para 50 V/s, reta ainda chega à célula |
| Fusão giroscópio + encoders (`HeadingFusion`) | `fusao_rumo` | 0 (desligada) | deriva da reta, `ganho_rumo` instável | testes do filtro |
| Reancorar pela parede (`WallPosition`) | `reancorar_parede` | 0 | acúmulo de erro de posição | testes do cálculo; ganho esperado pequeno (odometria ~2 mm/célula) |
| Parada pela frente com velocidade (`DynamicFrontStop`) | `parada_dinamica` | 0 | parada a distância variável da parede | testes; a = 1600 mm/s² é ESTIMADA |
| Viés do giroscópio parado (`GyroBiasTracker`) | `vies_giro` | 0 | desvio do giroscópio com temperatura/tempo | testes do filtro |
- Só a rampa vem ligada. As outras 4 ficam desligadas até serem medidas (E10 a E14 no `t.py`, cada uma ligada contra desligada).
- A memória do robô passa a `calib4`: no 1º boot depois de gravar, a calibração volta ao padrão. REAPLICAR: `calib "ganho_rumo=0.6 centralizar=1"` e conferir os freios (8,1 / 2,6 / 2,6) e `cabo_frente_mm=0`.
- NÃO implementado (e por quê): limite de corrente pelo INA219 (ler o INA no laço de controle soma uma transação I²C por volta, e o I²C do ToF já causou travadas de 16-17 ms); estimador de ganho por roda (o I do WheelLoop já compensa); reduzir a velocidade ao se aproximar da parede (a parada dinâmica cobre o efeito sem mexer no perfil); ignorar só o ToF morto (contraria a regra de não desativar nada nos testes).
- Nada disto foi gravado ou testado no robô. Testes no computador: 366; a placa compila com -Werror.

## Mudança 8 (20/11, pedido do operador): reta contínua, fases 1 e 2 (commits 065d7c4, 00a7c45 e seguintes)
Motivo: o operador observou que o tranco vem do para-e-anda (cada célula terminava parada); nos movimentos contínuos ele quase não ocorre.
- `RunProfile`: perfil que muda de alvo andando; `StraightMove::retarget`.
- `IMotionPort::advanceCells(máx, observador)` e `ISensorPort::senseMoving`: o robô anda várias células sem parar e, quando os ToF laterais passam sobre o centro da próxima célula (eixo ~59 mm antes), o Navigator lê as paredes, recalcula o flood fill e decide se passa; senão o alvo encurta para aquele centro (frear de 120 mm/s pede ~32 mm).
- Fase 1 (caminho conhecido) e fase 2 (células ainda não vistas) usam o mesmo mecanismo. Trechos de no máximo 8 células.
- No labirinto de testes (simulação): mesmo caminho e mesmas manobras, 12->7, 10->6, 16->11 e 8->6 passos.
- Chave `reta_continua` (padrão 1, LIGADA). Memória passa a `calib5`: reaplicar `ganho_rumo=0.6 centralizar=1` depois de gravar.
- Comando de teste `andar N` e teste E15. O `t.py` conta um passo de N células como N passos nas corridas D.
- Limitações: as paredes das células atravessadas são gravadas com a leitura em movimento (o painel recebe só a célula de cada passo); se o robô não conseguir frear a tempo numa célula, a reta falha com 'reta continua: nao freou a tempo na celula'. NADA disto foi testado no robô ainda.

## Mudanças 9 a 12 (20/11): movimento contínuo e limpo (commits 77c0d8c, 68216b0, db1e11c, 7c9f644)
Sintoma (operador): "anda um pouco, para, anda um pouco, para". Diagnóstico com o registro novo de velocidade/tensão a cada 50 ms na reta (E15): com referência 120 mm/s a roda ia de 0 a ~270 mm/s e voltava a 0 a cada ~0,4 s, tensão de -2 a +5,5 V.
- **Causa principal: ganhos do WheelLoop** (I=3,0, D=0,004) oscilavam com a constante de tempo REAL da roda (~0,2-0,3 s; o simulador usava 0,03 s). Varredura no simulador: pior caso 505 mm/s. Retune I=0,1 e D=0,02: 7 mm/s em toda a faixa (teste de regressão `CruiseSpeedStaysSteadyEvenForSlowWheels`, que falha com os ganhos antigos).
- Termo da parede (RF-44) suavizado por filtro de 0,3 s e 20 mm/s (`OffsetFilter`): leituras ruidosas do ToF (e o ToF direito alternando válido/"perto") deixam de ser degraus de posição.
- Ré contínua (`reverseCells`, comando `re N`) e centralização também na ré.
- Registro por reta (50 ms): velocidade, tensão, ToF E e D (-1 = inválido), erro lateral e termo da parede; `t.py` confere cruzeiro, alternância válido/inválido dos ToF, corredor medido.
- Resultado no robô (E15, 11:48): ida e ré de 3 células contínuas e limpas (cruzeiro 104 a 134 mm/s, desvio 6 mm/s), 5036/5037 ms, tranco 0, zigue-zague quase imperceptível (operador).
- Calib no robô: centralizar 1, ganho_rumo 0.6, largura_corredor 150, ganho_parede 5, max_parede 100.
- Pendente: o ToF direito alterna válido/inválido (7 a 13 mm, perto do limite de alcance); a parede direita do corredor de teste não é reta (abertura em ~1,1-2,5 s e aproximação depois).

## Mudança 13 (20/11 tarde): curva só em arco que cabe, centro aprendido e folga do arco
- Centro aprendido nas retas (`learnCenters`): quando uma parede some, a outra é comparada com o centro medido com as duas, não com o de 168 mm (commit 93ea302). Recuo/avanço/ajuste antes da curva centralizam.
- Plano B do arco sem espaço para recuar: se o giro no lugar não cabe (com a frente real de 100 mm não cabe em lugar nenhum), a manobra FALHA com 'giro no lugar nao cabe nesta celula' em vez de raspar (commit ac961bc).
- Modelo do arco (`domain/ArcClearance`, 5 testes): robô real (frente 100, largura 112, cabo à esquerda) numa curva em L de 168 mm. Janela longitudinal que cabe: -24 a -4 mm (o projeto antigo: -24 a +8); lateral +-26 mm (com o cabo: -16 a +26); num corredor de 153 mm só +-8 mm. O plano antigo (folga 20 mm) começava a -23 mm, colado no limite de trás.
- Chave `folga_arco` (padrão 12 mm => início a -15 mm, perto do ótimo de -16). A memória do robô passa a calib7 (reaplicar centralizar=1, ganho_rumo=0.6, ganho_parede=3, max_parede=50, eixo_ate_frente=100, eixo_ate_tof_frente=98, largura_frente=112, tof_lado_ao_centro=55.5 depois de gravar).
- NADA disto foi testado no robô. O modelo é uma reconstrução do arco (raio 90, quarto de círculo em volta do canto de dentro) e precisa ser validado na pista com `virar d` em A2 e A4 variando `folga_arco` (20 / 12 / 8).

## Mudança 14 (23/11, branch `feat/testes-pista-diogo`): Tarefa 1 do `AJUSTES_FINAIS.md`, remover a curva contínua
Pedido e aprovado pelo operador, feito por partes, sem commit. Base: `97eaadd`. Motivo: decisão do operador (21/11) de deixar só
o arco parado com ré e a curva em S; a reta contínua fica. Aviso do próprio `AJUSTES_FINAIS.md`: `curva_continua=0` sozinho piorou
as corridas de 21/11 (0 de 3); a Tarefa 2 (calibrar a cada curva) é o que corrige.

Antes de começar (23/11, robô apoiado, firmware `fase1-entrega-4-g264ef77`): H6 FALHOU por hardware (roda direita mais dura:
partida E 0,6-1,8 V x D 2,4-3,0 V, limite de diferença 1,0 V; a 6 V E 2236-2248 x D 1899-1937 pulsos/s). Operador limpando as rodas.

**Parte 1 (teste primeiro):** `test/use_cases/SerpentineMazeTest.cpp`: o teste `WithContinuousRunsAndTurnsTheRunMatchesTheLogsAndArrives`
(ligava a curva contínua e exigia uma curva sem parar) virou `WithContinuousRunsEveryTurnIsStoppedAtTheTurnCellCenter`: só a reta
contínua, mesmo caminho dos logs, chega sem bater, toda curva parada. O teste célula a célula ficou. Host 430/430.

**Parte 2 (Navigator):**
- `include/use_cases/Navigator.hpp`: saem `StepReport::runTurn`, `continuousTurns_`, `runTurn_`, `turnInRun()` e `setContinuousTurns()`.
- `src/use_cases/Navigator.cpp`: sai `RunObserver::turnIn`; o trecho contínuo vale só com `maxCells > 1` (era `maxCells > 1 || continuousTurns_`);
  sai o ramo que terminava o trecho virando; sai `Navigator::turnInRun`.
- `src/main.cpp`: sai `navigator.setContinuousTurns(...)` e o texto " (curva X sem parar)" da linha `nav: passo`.
- `test/use_cases/ContinuousTurnTest.cpp` apagado (5 testes) e tirado de `test/CMakeLists.txt`; o robô simulado da serpentina não vira mais sem parar.
- Host 425/425 sem aviso; build da placa (calibração, `CONFIG_RATO_LOG_RETA=y`) sem aviso.
- `RunTurn` e `IStraightRunObserver::turnIn` (`include/ports/MotionPort.hpp`) ficam até a parte 3: o `Drv8833MotionAdapter` ainda os usa.

**Parte 3 (adaptador dos motores, porta e PathMove):**
- `src/adapters/Drv8833MotionAdapter.cpp`: saem as constantes `kRunTurnDecisionMm`, `kRunTurnLateMm`, `kRunTurnMaxStartFixDeg`, `kDegToRad`,
  `kRunTurnJamFailure` e o `#include "controller/PathMove.hpp"`; o caso `RunTurnLeft/RunTurnRight` do `testManeuver`; em `advanceCells`, uma
  célula só vai sempre para `advanceCell()` (era só com `curva_continua=0`) e sai o fim por `finishRunTurn`; sai `finishRunTurn()` inteira;
  em `straight()`, saem as variáveis `path*`, o tempo-limite do arco, o giroscópio só do arco, o ramo da trajetória do arco, a decisão de
  virar no trecho (`turnIn`), a soma do giro depois de frear o arco e a linha de log `curva continua a ...`. A reta e a reta contínua ficam iguais.
- `include/adapters/Drv8833MotionAdapter.hpp`: saem `runTurnAsked_`, `runTurn_`, `runTurnCell_`, `runTurnJammed_`, `runTurnStartHeadingDeg_`,
  `runTurnGyroDeg_`, `finishRunTurn()` e as manobras `RunTurnLeft/RunTurnRight` (eram as últimas do enum: as outras não mudam de número).
- `src/main.cpp`: sai o comando BLE `curvac d|e [N]`.
- `include/ports/MotionPort.hpp`: saem `enum class RunTurn` e `IStraightRunObserver::turnIn`.
- Apagados `include/controller/PathMove.hpp`, `src/controller/PathMove.cpp` e `test/controller/PathMoveTest.cpp` (8 testes; nada mais usava o
  `PathMove`), e tirados de `CMakeLists.txt`, `esp32/main/CMakeLists.txt` e `test/CMakeLists.txt`.
- Host 417/417 sem aviso; build da placa (calibração) sem aviso. As 8 chaves do `calib` ainda existem (parte 4).

**Parte 4 (calibração, `t.py` e documentação):**
- `include/domain/Calibration.hpp`: saem os campos `continuousTurn` (`curva_continua`, padrão 1), `continuousArcLeadMm` (`antecipa_arco`, 16),
  `runTurnSpeedMmPerS` (`curva_cont_vel`, 80), `runTurnTrackMm` (`curva_cont_bitola`, 100), `runTurnHeadingGain` (`curva_cont_ganho`, 1,0),
  `runTurnSteerMaxMm` (`curva_cont_giro_max`, 30), `runTurnJamDeg` (`curva_cont_trava`, 20) e `runTurnGyroBrakeDeg` (`curva_cont_freio`, 4);
  `kCalibrationFieldCount` 60 -> 52.
- `src/domain/Calibration.cpp`: saem as 8 linhas dessas chaves da tabela `kFields`.
- `src/main.cpp:91`: `kCalibKey` `"calib15"` -> `"calib16"`. **Na primeira vez que ligar com este firmware o robô volta aos padrões** e o calib
  tem de ser reaplicado (seção 2 da `PASSAGEM_CALIBRACAO.md`, sem `antecipa_arco=12` e `curva_continua`).
- `test/domain/CalibrationTest.cpp`: o número de chaves esperado 60 -> 52.
- `robot-tests/suite/checks/sensors.py`: o `EXPECTED_CALIBRATION` do E0 perde as 8 chaves (52; o E0 esperava `antecipa_arco` 12 e `curva_continua` 1).
- `robot-tests/suite/catalog/novelties.py`: saem os testes E16a/E16b (`curvac d|e`) e o import de `check_run_turn`.
- `robot-tests/suite/checks/motion.py`: saem `_RUN_TURN` e `check_run_turn`.
- `LOGS_E_MEDIDAS.md`: saem as 8 linhas da tabela do `calib`; nota da retirada; a chave da memória passa a `calib16`, 52 chaves.
- Host 417/417 sem aviso; build da placa (calibração) sem aviso; o `t.py` importa e lista os testes sem os E16.

**Parte 5 (fechamento):**
- Nenhuma referência à curva contínua no código (só dois comentários que registram a retirada).
- As duas builds da placa sem nenhum aviso: calibração (`esp32/build/teste-v3`, `CONFIG_RATO_LOG_RETA=y`, log `build.log`) e prova
  (`esp32/build/prova`, `CONFIG_RATO_LOG_RETA` desligado, log `build-prova.log`); nas duas `CONFIG_RATO_FIOS_MOTORES_TROCADOS=y` e
  `RATO_BANCADA`, `RATO_CENTRALIZAR_PAREDES` e `RATO_SLOW_DECAY` desligados. Grava-se a de calibração.
- Calib gravado no robô antes de regravar (log do boot de 23/11, chaves ALTERADO, `calib15`): 22 chaves. Depois de gravar (`calib16`, tudo
  em padrão) reaplicar as 21 que continuam existindo (sai só `antecipa_arco=12`), no máximo 4 por comando:
  1. `eixo_ate_frente=100 largura_frente=112 eixo_ate_tof_frente=88 tof_lado_ao_centro=55.5`
  2. `escala_giro=1.0 freio_pivo=4 centralizar=1 ganho_rumo=1.0`
  3. `ganho_parede=3 max_parede=35 folga_arco=18 arco_esq_atraso=-14`
  4. `desfazer_tensao_fora=3.6 desfazer_tensao_dentro=2.2 ajuste_2a_tentativa=24 ajuste_fino_min=0.4`
  5. `alvo_lateral_dir_mm=-8 curva_dir_fora=8 rumo_max_lateral=8 giro_aberto=1`
  6. `bateria_minima=5.5`
  Depois: `python t.py E0 --auto` (52 chaves; `cabo_esq_mm` fica no padrão 10, como estava).

## Mudança 15 (23/11, branch `feat/testes-pista-diogo`): vigia de temperatura e corrente (`ThermalWatch`)
Pedido do operador: medir a temperatura da ESP32-S3 para detectar curtos por subida súbita. Decisões do operador: **só registrar no
log** (não para os motores), com os três sinais (temperatura da ESP, temperatura do MPU6050 e corrente do INA219), em partes, sem commit.
Aviso registrado: o sensor interno mede o próprio chip; um curto longe dele (motor, ponte H, ToF) chega devagar ou não chega. O sinal
rápido para um curto é a corrente.

**Parte 1 (lógica pura, TDD):**
- Novo `include/domain/ThermalWatch.hpp` (só cabeçalho, como o `GyroBiasTracker`: a lista de fontes da placa não muda). Alarmes em bits:
  subida da ESP, ESP quente, subida do MPU, MPU quente, corrente alta. `raised`/`cleared` avisam só na mudança (o log não repete a cada
  amostra). Leitura inválida fica de fora e não entra na janela.
- Limites (constantes, não chaves do `calib`, para não subir a `calib16` e perder a calibração de novo), **proposta a confirmar**:
  subida de 3 C em 10 s; ESP acima de 75 C; MPU acima de 70 C; corrente acima de 1,5 A por 0,5 s.
- Novo `test/domain/ThermalWatchTest.cpp` (8 testes) e a entrada em `test/CMakeLists.txt`. Host 425/425 sem aviso.

**Parte 2 (leitura na placa e log; só registra, não para motores):**
- `include/domain/ThermalWatch.hpp`: `describeThermalAlarms()` (os nomes dos alarmes para o log), com teste (`AlarmNamesForTheLog`).
- `src/main.cpp`: includes `domain/ThermalWatch.hpp`, `soc/soc_caps.h` e `driver/temperature_sensor.h` (só com `SOC_TEMP_SENSOR_SUPPORTED`);
  globais `gSensorsReady` e `gEspTempCenti`; `gSensorsReady = true` logo depois do `gPower.begin()` da navegação; nova tarefa
  `thermalTask` (4 kB, prioridade 1, núcleo 0, fora da bancada): 1 amostra/s da ESP (faixa -10 a 80 C), do MPU6050 (`readAll`) e do
  INA219 (|corrente|; inválida se o contador de erros subiu); linhas `termico: esp=.. C imu=.. C corrente=.. A | alarmes: ..` a cada 10 s,
  `termico: ALARME <nomes>: ...` (W) quando um alarme começa e `termico: fim do alarme ...` quando acaba. O `saude 1/2` ganha no fim
  `, temp esp=X C` (-99 sem leitura; a expressão do `t.py` continua casando).
- `esp32/main/CMakeLists.txt`: `esp_driver_tsens` no `REQUIRES`.
- O MPU6050 e o INA219 passam a ser lidos também por esta tarefa (o INA219 já era lido pela telemetria; o driver de I²C serializa o barramento).
- Host 426/426 sem aviso; builds da placa (calibração e prova) sem aviso. A `calib16` não muda: a calibração do robô continua.

## Mudança 16 (23/11): a calibração do robô passa a ser o padrão do firmware
Pedido do operador: a ESP foi trocada (memória vazia), o Bluetooth não conectava e o firmware não aceita `calib` pelo cabo.
- `include/domain/Calibration.hpp`: padrões trocados pelos valores em uso no robô: eixo_ate_frente 100, largura_frente 112,
  eixo_ate_tof_frente 88, tof_lado_ao_centro 55,5, escala_giro 1,0, freio_pivo 4, centralizar 1, ganho_rumo 1,0, ganho_parede 3,
  max_parede 35, folga_arco 18, arco_esq_atraso -14, desfazer_tensao_fora 3,6, desfazer_tensao_dentro 2,2, ajuste_2a_tentativa 24,
  ajuste_fino_min 0,4, alvo_lateral_dir_mm -8, curva_dir_fora 8, rumo_max_lateral 8, giro_aberto 1, bateria_minima 5,5.
- Host: **29 testes falham** porque ainda esperam os padrões antigos (grupos Calibration, RobotModel, WallPosition, PivotClearance,
  PivotPlan, LateralPose*, SweptFootprint, WallCenteringConfigFromCalibration). Testes não alterados: falta decisão do operador.
- 25/11: conferido numa ESP nova pelo BLE, 52/52 chaves corretas.
- Atenção: são medidas do corpo antigo. Na montagem em protoboard (Mudança 18) as medidas do corpo precisam ser refeitas.

## Mudança 17 (23/11): estouro de pilha da tarefa do vigia de temperatura (erro da Mudança 15)
- Sintoma: `***ERROR*** A stack overflow in task termico has been detected`, a ESP reiniciava sem parar (BLE não conectava).
- `src/main.cpp`: pilha da `thermalTask` de 4096 para 8192. Boot estável depois (conferido na serial em 23/11 e 25/11).

## Mudança 18 (25/11, pedido do operador): montagem em protoboard e contagem antes da largada
Compilada e testada no computador. 25/11: gravada na ESP principal (MAC 68:9d:d2:c2:d0:74), solta, só no USB: G3 (boot estável,
mapa "protoboard (25/11)") e G4 (botão BOOT, contagem 5 a 1 de 1 em 1 s, auto-teste reprovando só pela falta dos sensores)
passaram. **Ainda não testada com as peças ligadas.**
- Opção de compilação nova `RATO_PROTOBOARD` (`esp32/main/Kconfig.projbuild`), desligada por padrão;
  `RATO_FIOS_MOTORES_TROCADOS` passa a depender dela desligada. Defaults da build: `esp32/build/proto.defaults` (ignorado pelo git:
  CONFIG_RATO_PROTOBOARD=y e CONFIG_RATO_LOG_RETA=y; os demais desligados).
- `include/adapters/BoardPins.hpp`: mapa da protoboard (tudo na barra J1 da DevKit): motores E 4/5 e D 6/7; encoders E 13/14 e
  D 15/16; SDA 8, SCL 9; XSHUT frente 10, esquerdo 11, direito 18; buzzer 12; DIP 3, 46, 17; botão = BOOT (GPIO 0); sem LEDs;
  INT da MPU solto. Sentido de motores e encoders A CONFIRMAR com as rodas no ar. O mapa do robô anterior não muda.
- `src/adapters/LocalInterfaceAdapter.cpp`: LEDs em `GPIO_NUM_NC` não são configurados nem acionados.
- `src/main.cpp`: contagem de 5 s entre o toque no botão (ou `largar`) e a largada, um bip por segundo e um longo no fim; um novo
  toque ou `parar` cancela. Vale em todas as builds.
- Novo `test/adapters/BoardPinsProtoTest.cpp` (4 testes). Host: 401 passam e os 29 da Mudança 16 falham (430 no total).
- Sensores ToF: chegou a ser escrito um driver para o VL53L0X; o operador decidiu voltar aos VL53L1X (a estrutura foi feita para
  eles). O adaptador e o `diag` voltaram ao original; o driver ficou fora do repositório (pasta temporária da sessão).
- Builds `proto` e `teste-v3` sem erro. Sem commit.

## Bancada 25/11: ToF antigos (VL53L1X) um a um na protoboard
ESP reserva (MAC c4:9e:7e:14:9a:48), firmware `proto` da Mudança 18, só USB, sensor na posição frontal (VIN 3V3, SDA 8, SCL 9,
XSHUT 10). Logs: `resultados/logs/tofmon_sensor1.log` e `tofmon_sensor2.log` (ignorados pelo git).
- Sensor 1: **não aprovado.** Reconhecido; em `tofmon 60` mediu só nos segundos 1-2 e 32-34 (38 medidas, 1 erro de I2C). Antes
  disso houve cabo puxado e pino errado. Causa (sensor ou mau contato) ainda não separada: repetir com os fios firmes.
- Sensor 2: **passou** no `tofmon 60`: 661 de 661 medidas válidas, 60 a 66 mm (média 63,3). Exatidão contra régua não conferida.
- Sensor 3: **passou** no `tofmon 60`: 646 de 646 medidas válidas, 127 a 136 mm (média 131,3), 0 erros de I2C. Exatidão contra régua não conferida. Log `tofmon_sensor3.log`.

## Mudança 19 (25/11, pedido do operador): pinagem da protoboard usando também a barra escondida
Na protoboard, a barra J1 (3V3, 3V3, RST, 4, 5...) fica com um furo livre por pino; a J3 (GND, TX, RX, 1, 2...) fica sem furo
livre e só é alcançada por jumpers retos postos antes da ESP, por baixo dela, até as fileiras livres acima dela (lado do USB).
- `include/adapters/BoardPins.hpp` (bloco `RATO_PROTOBOARD`): DIP via 1 de GPIO 3 para **GPIO 21** e via 2 de GPIO 46 para
  **GPIO 47** (os dois pinos da J3 mais perto das fileiras livres). Via 3 continua no 17. As 3 vias são obrigatórias e ficam.
  Com isso nenhum pino de strapping (0, 3, 45, 46) leva fio, fora o botão BOOT da placa. O resto do mapa não muda.
- `test/adapters/BoardPinsProtoTest.cpp`: só J1 mais os pinos 21 e 47 da J3; nenhum strapping nem proibido (19-20 USB,
  35-37 PSRAM octal, 43-44 log, 48 LED RGB).
- Host: os 4 testes do mapa passam; continuam as 29 falhas da Mudança 16. Build `proto` sem erro. Não gravada. Sem commit.
