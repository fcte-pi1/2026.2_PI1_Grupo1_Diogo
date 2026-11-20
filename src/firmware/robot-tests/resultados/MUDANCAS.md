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

## Mudança 7 (19/11, pedido do operador): novas malhas fechadas (commits 1346633 a 9ae8faf)
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

## Mudança 8 (20/11, pedido do operador): reta contínua, fases 1 e 2 (commits eaf1e9f, 91ebe0b e seguintes)
Motivo: o operador observou que o tranco vem do para-e-anda (cada célula terminava parada); nos movimentos contínuos ele quase não ocorre.
- `RunProfile`: perfil que muda de alvo andando; `StraightMove::retarget`.
- `IMotionPort::advanceCells(máx, observador)` e `ISensorPort::senseMoving`: o robô anda várias células sem parar e, quando os ToF laterais passam sobre o centro da próxima célula (eixo ~59 mm antes), o Navigator lê as paredes, recalcula o flood fill e decide se passa; senão o alvo encurta para aquele centro (frear de 120 mm/s pede ~32 mm).
- Fase 1 (caminho conhecido) e fase 2 (células ainda não vistas) usam o mesmo mecanismo. Trechos de no máximo 8 células.
- No labirinto de testes (simulação): mesmo caminho e mesmas manobras, 12->7, 10->6, 16->11 e 8->6 passos.
- Chave `reta_continua` (padrão 1, LIGADA). Memória passa a `calib5`: reaplicar `ganho_rumo=0.6 centralizar=1` depois de gravar.
- Comando de teste `andar N` e teste E15. O `t.py` conta um passo de N células como N passos nas corridas D.
- Limitações: as paredes das células atravessadas são gravadas com a leitura em movimento (o painel recebe só a célula de cada passo); se o robô não conseguir frear a tempo numa célula, a reta falha com 'reta continua: nao freou a tempo na celula'. NADA disto foi testado no robô ainda.

## Mudanças 9 a 12 (20/11): movimento contínuo e limpo (commits 0c99d6b, 335d450, bc99c89, 486995a)
Sintoma (operador): "anda um pouco, para, anda um pouco, para". Diagnóstico com o registro novo de velocidade/tensão a cada 50 ms na reta (E15): com referência 120 mm/s a roda ia de 0 a ~270 mm/s e voltava a 0 a cada ~0,4 s, tensão de -2 a +5,5 V.
- **Causa principal: ganhos do WheelLoop** (I=3,0, D=0,004) oscilavam com a constante de tempo REAL da roda (~0,2-0,3 s; o simulador usava 0,03 s). Varredura no simulador: pior caso 505 mm/s. Retune I=0,1 e D=0,02: 7 mm/s em toda a faixa (teste de regressão `CruiseSpeedStaysSteadyEvenForSlowWheels`, que falha com os ganhos antigos).
- Termo da parede (RF-44) suavizado por filtro de 0,3 s e 20 mm/s (`OffsetFilter`): leituras ruidosas do ToF (e o ToF direito alternando válido/"perto") deixam de ser degraus de posição.
- Ré contínua (`reverseCells`, comando `re N`) e centralização também na ré.
- Registro por reta (50 ms): velocidade, tensão, ToF E e D (-1 = inválido), erro lateral e termo da parede; `t.py` confere cruzeiro, alternância válido/inválido dos ToF, corredor medido.
- Resultado no robô (E15, 11:48): ida e ré de 3 células contínuas e limpas (cruzeiro 104 a 134 mm/s, desvio 6 mm/s), 5036/5037 ms, tranco 0, zigue-zague quase imperceptível (operador).
- Calib no robô: centralizar 1, ganho_rumo 0.6, largura_corredor 150, ganho_parede 5, max_parede 100.
- Pendente: o ToF direito alterna válido/inválido (7 a 13 mm, perto do limite de alcance); a parede direita do corredor de teste não é reta (abertura em ~1,1-2,5 s e aproximação depois).

## Mudança 13 (20/11 tarde): curva só em arco que cabe, centro aprendido e folga do arco
- Centro aprendido nas retas (`learnCenters`): quando uma parede some, a outra é comparada com o centro medido com as duas, não com o de 168 mm (commit 01656cd). Recuo/avanço/ajuste antes da curva centralizam.
- Plano B do arco sem espaço para recuar: se o giro no lugar não cabe (com a frente real de 100 mm não cabe em lugar nenhum), a manobra FALHA com 'giro no lugar nao cabe nesta celula' em vez de raspar (commit 8667915).
- Modelo do arco (`domain/ArcClearance`, 5 testes): robô real (frente 100, largura 112, cabo à esquerda) numa curva em L de 168 mm. Janela longitudinal que cabe: -24 a -4 mm (o projeto antigo: -24 a +8); lateral +-26 mm (com o cabo: -16 a +26); num corredor de 153 mm só +-8 mm. O plano antigo (folga 20 mm) começava a -23 mm, colado no limite de trás.
- Chave `folga_arco` (padrão 12 mm => início a -15 mm, perto do ótimo de -16). A memória do robô passa a calib7 (reaplicar centralizar=1, ganho_rumo=0.6, ganho_parede=3, max_parede=50, eixo_ate_frente=100, eixo_ate_tof_frente=98, largura_frente=112, tof_lado_ao_centro=55.5 depois de gravar).
- NADA disto foi testado no robô. O modelo é uma reconstrução do arco (raio 90, quarto de círculo em volta do canto de dentro) e precisa ser validado na pista com `virar d` em A2 e A4 variando `folga_arco` (20 / 12 / 8).
