# Ajustes finais: o que deve ser feito no firmware

Documento **único** para quem herda o firmware do micromouse "Rato Borrachudo". O estado do robô, o calib final e como operar estão em `PASSAGEM_CALIBRACAO.md`; as baterias de teste de ontem e de hoje, em `BATERIA_TESTES_20_11.md` e `BATERIA_TESTES_21_11.md`.

## Ponto de partida
O robô **completa a serpentina 4x4** (~52 s, 7 passos, giros de 88 a 89°) com o firmware `fase1-entrega-4` (tag `pista-21-11`, calib15, 60 chaves), mas **raspa na parede direita** na saída das curvas.
Ajustes de `calib` às cegas (`curva_dir_fora`, `alvo_lateral_dir_mm`, `max_parede`, `eixo_ate_tof_frente`) **já foram tentados** e não resolveram: ver o diário `CALIBRACAO.md`. **O que resta é mudar o firmware, nesta ordem.**
O operador decidiu o rumo final das curvas; **nada disto foi implementado**.

## Tarefa 1: a curva contínua deve DESAPARECER do projeto
**Decisão:** o projeto passa a ter **só dois tipos de curva**, os dois **parados no centro da célula da curva**:
1. **Arco parado com ré** (`arcTurn` -> `positionForArc`: a reta chega ao centro, o robô **recua** até a posição de início do arco (frontal alvo ou recuo fixo de `recuo_sem_parede`), faz o arco de 90° e o ajuste fino, e tem **desfazer + 2ª tentativa**).
2. **Curva em S** (`openCellTurn`, feita hoje): gira ~70°, anda ~76 mm na diagonal e completa o giro; com **2ª tentativa** se o 1º giro travar.

**Continua existindo a reta contínua** (`reta_continua`: o trecho de N células num movimento só, com a decisão antes de cada centro). O que sai é **virar sem parar dentro dessa reta**: o trecho passa a **terminar no centro da célula da curva** e a curva parada acontece depois.

**O que remover** (conferir com `grep -rnE "RunTurn|runTurn|continuousTurn|turnIn|setContinuousTurns|finishRunTurn|PathMove|curvac|curva_cont|antecipa_arco"`):
| Onde | O que sai |
|:--|:--|
| `include/controller/PathMove.hpp`, `src/controller/PathMove.cpp`, `test/controller/PathMoveTest.cpp` | o planejador do arco contínuo (**confirmar antes que nada mais usa o `PathMove`**) |
| `include/ports/MotionPort.hpp` | `RunTurn` e `IStraightRunObserver::turnIn` |
| `include/use_cases/Navigator.hpp`, `src/use_cases/Navigator.cpp` | `turnInRun`, `setContinuousTurns`, `StepReport::runTurn` e o ramo "curva sem parar" do passo |
| `include/adapters/Drv8833MotionAdapter.hpp`, `src/adapters/Drv8833MotionAdapter.cpp` | `runTurn_`, `runTurnAsked_`, `runTurnJammed_`, o parâmetro `path` de `straight()`, `finishRunTurn()` e o ramo do arco dentro de `advanceCells()` |
| `src/main.cpp` | o comando `curvac`, as chamadas de `setContinuousTurns` |
| `include/domain/Calibration.hpp`, `src/domain/Calibration.cpp` | 8 chaves: `curva_continua`, `antecipa_arco`, `curva_cont_vel`, `curva_cont_bitola`, `curva_cont_ganho`, `curva_cont_giro_max`, `curva_cont_trava`, `curva_cont_freio` (60 -> **52 chaves**) |
| `test/use_cases/ContinuousTurnTest.cpp`, `test/CMakeLists.txt` | o teste; em `SerpentineMazeTest.cpp` **manter o teste "célula a célula"** e tirar o da curva contínua |
| `robot-tests/suite/catalog/novelties.py`, `checks/motion.py`, `checks/sensors.py` | os testes `E16a`/`E16b`, `check_run_turn` e as 8 chaves do `EXPECTED_CALIBRATION` |
| `LOGS_E_MEDIDAS.md`, `robot-tests/relatorios/CURVA_CONTINUA_20_11.md` | documentar a retirada (manter o relatório como histórico) |

**Depois de remover:** subir `kCalibKey` para `"calib16"` em `src/main.cpp` (a memória do robô volta aos padrões: reaplicar o calib da seção 2 **sem** as 8 chaves), atualizar o `E0` (52 chaves) e rodar `ctest` (host) e as duas builds do ESP (calibração e prova) sem aviso. **TDD:** primeiro mude o `Navigator` e o teste da serpentina para que a reta de várias células pare no centro da curva e a curva parada seja pedida; só depois apague o código morto.

**Cuidado:** hoje `curva_continua=0` **piorou** (corridas 46 a 48): sem a curva contínua o arco parado em (l2,c2) travou no poste porque o robô chegou **encostado na parede direita**. Isso se resolve com a Tarefa 2 (chegar centrado), então **faça a Tarefa 2 junto ou antes** de apagar a curva contínua.

## Tarefa 2: a cada curva o robô deve se calibrar para ficar completamente reto e centralizado
**Decisão:** depois de **cada** curva (arco com ré e curva em S), o robô executa uma **rotina de calibração** antes de seguir, até ficar **reto e no centro do corredor**. Hoje só há o `trimArc` (ajuste fino pelo giroscópio) e a centralização durante a reta, que **tem um teto** (`max_parede`, 12,3 mm) e **não vê** o robô ser empurrado pela parede (o giroscópio mede o giro, mas o corpo encostado na parede não aparece nele).

**Por quê (os dados):** depois das curvas o robô sai **15 a 35 mm à direita** do centro (corredor de folga de 28 mm por lado): sensor direito em **0 mm** depois dos arcos à direita e da última curva em S, estimativa lateral nas retas de 20 a 35 mm (`reta: pose lateral`), e a reta seguinte esterça forte para voltar (rumo de 5 a 12°). Ajustar `curva_dir_fora`, `alvo_lateral_dir_mm`, `max_parede` e `eixo_ate_tof_frente` às cegas **não resolveu** (diário `CALIBRACAO.md`, 21/11).

**Especificação sugerida** (a pessoa pode melhorar, mas o **critério de aceitação** é este):
1. **Parar** no ponto de saída da curva e medir os três ToF (usar `settledReadings`).
2. **Alinhar (reto):** se houver parede lateral, medir o rumo pelo ToF dessa parede (com o robô se movendo uns 30 mm devagar, `atan(variação/avanço)`, o mesmo princípio da estimativa de pose lateral que já existe) ou, se houver parede à frente, girar de ±pequenos ângulos e achar o **mínimo do frontal** (perpendicular). Corrigir com um giro curto. **Referência pela parede, não pelo giroscópio.**
3. **Centralizar:** se `|E - D| / 2 > 3 mm`, corrigir o deslocamento lateral com **giro-anda-giro** (um "S" pequeno) ou, com os dois lados abertos, usar a parede da frente (o robô já sabe a distância à parede da frente). Com só uma parede lateral, usar a largura do corredor (168 mm) como referência.
4. Repetir até passar no critério (no máximo 2 vezes) ou **registrar no log e seguir**; nunca ficar em laço.
5. **Critério de aceitação (medido com o robô parado depois da rotina, nas duas curvas em S e nos arcos):** **|E - D| <= 6 mm** (dois lados com parede) e **rumo <= 1,5°** em relação ao corredor. Escrever o antes e o depois no log (`curva: pos-curva E=.. D=.. rumo=..`).
6. Custo esperado: 1 a 2 s por curva; aceitável (a corrida de hoje é de ~52 s).
7. Chaves novas no `calib` (todas com padrão, mínimo/máximo e unidade): tolerância lateral, tolerância de rumo, máximo de repetições, ligar/desligar a rotina. Sobe a chave da memória (`calib16`, ou `calib17` se a Tarefa 1 já usou a 16).
8. **Teste de aceitação na pista:** 5 corridas seguidas da serpentina **sem o operador ver o robô raspar** em parede, com `curva_dir_fora=0` e `alvo_lateral_dir_mm=0` (esses dois ajustes de hoje existem só para compensar o que a rotina deve eliminar).

## Tarefa 3 em diante: outras pendências de firmware
1. **Reiniciar o ToF que cai durante a reta/curva** (hoje só reinicia parado): `Vl53l1xSensorAdapter::sense()` e `recoverFailed()`; memória `tof-recuperacao-na-reta-pendente`.
2. **Linha de log de desequilíbrio de tensão das rodas** (aviso quando uma roda pedir mais de 1,5x a tensão da outra numa reta): foi o melhor indicador do motor direito arrastando (corrida 51).
3. **Reduzir o tempo do boot** (4 planos da curva em S x 8 a 12 s): busca mais grossa ou um plano por vez (`domain/CellTurn.cpp`, `planCellTurn`).
4. Medir o **cabo da bateria** (`cabo_esq_mm`) e, se prender-se ao chassi, rever `giro_s_beta_max`.
5. Decidir o destino da **curva com uma roda** (`modo_curva=1`, `oneWheelTurn`) e do **giro no lugar** (`pivotInBoxedCell`): hoje não são usados na corrida; ou entram no projeto como curva, ou saem.

## Como saber que terminou (critério de aceitação do conjunto)
1. `ctest` no computador e as **duas builds do ESP** (calibração e prova) **sem nenhum aviso**.
2. `python t.py E0 --auto` passa com a lista de chaves nova (52 chaves se a Tarefa 1 estiver feita).
3. **5 corridas seguidas** da serpentina com sucesso **sem o operador ver o robô raspar** em parede ou poste, com `curva_dir_fora=0` e `alvo_lateral_dir_mm=0`.
4. Depois de cada curva, o log mostra `pos-curva E=.. D=.. rumo=..` dentro do critério.

## O que não repetir (aprendido em 20 e 21/11)
- **Não ajustar o calib às cegas** para compensar o desvio para a direita: 4 chaves foram testadas e a saída continua 15 a 35 mm à direita.
- **Não desligar a curva contínua sozinha** (`curva_continua=0` piorou: 0 de 3 corridas), porque o robô chega encostado na parede direita e o arco parado trava no poste. Faça a **Tarefa 2 antes ou junto**.
- **Não regravar sem conferir `CONFIG_RATO_LOG_RETA=y`** (uma gravação saiu sem o log). **Bateria fora e USB ligado** para gravar; depois de um erro, **reiniciar** o robô.
- **Medir com trena, não com paquímetro** (o operador não tem): método por diferença e pelo próprio ToF em `MEDICOES.md`, seção "Medidas com trena".
