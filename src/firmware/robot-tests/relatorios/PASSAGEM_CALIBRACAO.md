# Passagem da calibração (noite de 21/11/2026)

Documento para quem assumir a calibração do robô. Leia este arquivo primeiro; os detalhes estão em `auditoria/AUDITORIA-2026-11-21.md` (raiz do
repositório, seção 9), `CALIBRACAO.md` (diário, uma linha por mudança) e `AJUSTES_FINAIS.md`.

## 1. Onde estamos
- **O robô completa a serpentina 4x4** (largada (l3,c0) virado ao norte, via 3 aberta, objetivo (l0,c3)): ~52 s, 7 passos, giros de 88 a 89°.
  Corridas que passaram na configuração final: 49, 50, 52, 53 (e 40 a 43 com a 2ª tentativa de 6 mm).
- **O que ainda não está bom:** o robô **raspa na parede direita** na saída dos arcos à direita (sensor direito em 0 mm) e na saída da última curva em S,
  e a estimativa lateral nas retas chega a 20 a 35 mm à direita. Isso **não** é arrasto de motor (com os motores limpos continua).
- Firmware gravado: `fase1-entrega-4-g264ef77` (tag `pista-21-11`), chave da memória `calib15` (60 chaves). **Não regravar sem necessidade**: o calib vive na memória do robô.

## 2. Calib final em uso (o `E0` espera exatamente isto)
Padrões, exceto:

| Chave | Valor | Observação |
|:--|:--|:--|
| `eixo_ate_frente` / `eixo_ate_tof_frente` / `largura_frente` | 100 / **88** / 112 | O 88 é o melhor medido na pista (medido com trena: 92 perto da parede, 96,5 a 229 mm); 84 travou a curva em S, 92/98 batiam no poste |
| `tof_lado_ao_centro` | 55,5 | |
| `escala_giro` / `freio_pivo` | 1,00 / 4 | |
| `centralizar` / `ganho_rumo` / `ganho_parede` / `max_parede` | 1 / 1,0 / 3 / **35** | 22 deixava o robô 14-22 mm à direita; 50 abortava por "rumo perdido" |
| `folga_arco` / `antecipa_arco` / `arco_esq_atraso` | 18 / 12 / -14 | |
| `desfazer_tensao_fora` / `desfazer_tensao_dentro` | 3,6 / 2,2 | |
| `ajuste_fino_min` | 0,4 | |
| `alvo_lateral_dir_mm` | **-8** | as retas miram 8 mm à esquerda do centro |
| `alvo_pos_esq_mm` | **0** | era 12; a saída das curvas em S já sai à direita |
| `curva_dir_fora` | **8** | **16 foi pior (54)**; 0 deixava as saídas dos arcos 22-27 mm à direita |
| `rumo_max_lateral` | 8 | |
| `ajuste_2a_tentativa` | **24** | a 2ª tentativa da curva em S desloca o eixo 12 mm (metade); também vale para o arco |
| `giro_aberto` | 1 | liga a curva em S em célula aberta |
| `bateria_minima` | 5,5 | só para testes: a INA219 lê 1,7 V abaixo do cellmeter |
| `cabo_esq_mm` | 10 (padrão) | **estimativa, falta medir** |

`curva_continua=1` (padrão). **Desligar não ajudou** (46 a 48: 0 de 3).

## 3. O que foi aprendido (resumo)
1. **Causa raiz das falhas originais:** o giro de 90° no lugar em célula aberta não cabe com os **postes dos cantos** (`domain/PivotClearance` não os tinha). Corrigido com a **curva em S** (`domain/CellTurn`): giro de ~70°, diagonal de ~76 mm, completa.
2. **A curva em S tem janela estreita:** ±5 mm de posição do eixo. Uma travada no 1º giro acontece em ~1 de cada 4 vezes; a **2ª tentativa automática** (gira de volta, desloca o eixo, tenta de novo) resolve a maioria.
3. **A diagonal do S aceita 18° de desvio de rumo** (um toque leve na parede não aborta).
4. **O ToF frontal lê ~4,5 mm a mais perto da parede**, então o `eixo_ate_tof_frente` depende da distância.
5. **O motor direito às vezes pesa** (corrida 51: 7,2 V contra 3,1 V para manter as rodas iguais; depois de limpar, 3,5 V contra 3,5 V). **Bom indicador:** compare a tensão máxima das duas rodas nas retas (linha `reta: ... V max E=.. D=..`); se diferirem mais de ~1,5x, limpe ou troque o N20 direito antes de calibrar.
6. **O ToF direito caiu sozinho** (volta ao endereço 0x29): `python t.py cmd tofrec` recupera. Rode `tofrec` e `tofmon 60` antes de cada sessão.
7. **A deriva das retas em malha aberta é pequena** (~+5 mm em 540 mm, com ±9 mm de ruído de posicionar à mão). Não é a causa dos 20-35 mm.

## 4. Como operar (WSL2, ponte BLE, Windows Python)
- A ponte tem de rodar pelo Python do Windows (o Bluetooth não funciona pelo WSL):
  `C:\Users\samue\AppData\Local\Programs\Python\Python312\python.exe` com o caminho de `wslpath -w src/firmware/robot-tests/ponte.py`; os comandos `t.py` também.
- **Depois de um erro o robô precisa reiniciar** (`t.py reiniciar`, ~45 s: calcula os 4 planos da curva em S, 8 a 12 s cada). Ele ignora `largar` em erro.
- **Gravar:** só com a **bateria fora**; confirmar pela serial `INA219 PAROU`. Build com `CONFIG_RATO_LOG_RETA=y` (modo calibração); compile também o modo prova (sem o log). Veja `CLAUDE.md` local (não versionado) e `LOGS_E_MEDIDAS.md`, seção 6.
- **Corrida:** `python trava_execucao.py SERPENTINA-N` e depois `python t.py corrida --auto SERPENTINA-N "<descrição>"` (um nome novo por corrida).
- **`calib`:** no máximo 4 chaves por comando (o BLE perde linhas longas); `python t.py E0 --auto` confere as 60 chaves.
- **Para parar rápido:** a chave do robô. O `parar` pelo BLE leva alguns segundos.
- Depois de mudar a lista de chaves do `calib`: subir `kCalibKey` (`src/main.cpp`) e o `EXPECTED_CALIBRATION` do E0.

## 5. Pendências de pista e hardware, em ordem de valor

> As duas tarefas de **firmware** decididas pelo operador (remover a curva contínua e calibrar a cada curva) estão na seção 7 e vêm **antes** de tudo isto.
1. **Viés para a direita na saída das curvas** (arcos à direita e curva em S): é o que o operador vê como arrasto. Ajustes cegos de `curva_dir_fora`, `alvo_lateral_dir_mm`, `max_parede` e `eixo_ate_tof_frente` já foram testados (tabela do `CALIBRACAO.md`). **Próximo passo: filmar de cima uma curva isolada e medir o ângulo e a posição da saída**, e comparar com o giroscópio.
2. **Reiniciar o ToF que cai DURANTE a reta/curva** (hoje só reinicia com o robô parado): ver a memória do projeto `tof-recuperacao-na-reta-pendente`.
3. **Cabo da bateria:** medir (`cabo_esq_mm` é estimativa) e prender rente ao chassi: com o cabo rente a folga do plano à esquerda sobe de 4,4 para ~7 mm.
4. **Pneus e motores (estrutura):** nada de WD-40 nem limpa-contatos nas rodas ou nas caixas; só fita adesiva e álcool no pneu. Trocar o N20 direito se o arrasto voltar.
5. **Tempo do boot** (4 planos x 8-12 s): busca mais grossa ou um plano por vez.
6. **Linha de log do desequilíbrio de tensão das rodas** (aviso quando passar de 1,5x).

## 6. Regras do projeto que continuam valendo
Responder e documentar em português; commits em Angular em português, **sem `Co-Authored-By` nem `Claude-Session`**, assinados (`ssh-add` se falhar); nunca `git add -A`;
nenhum `.zip`; não desativar componentes para um teste passar; sem push nem reescrita de histórico sem pedido; hardware só muda na segunda-feira.

## 7. O que a pessoa que assumir deve fazer no firmware (decisão do operador, 21/11)

O operador decidiu o rumo final das curvas. **Nada disto foi implementado**: são as tarefas do próximo responsável, em ordem.

### Tarefa 1: a curva contínua deve DESAPARECER do projeto
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

### Tarefa 2: a cada curva o robô deve se calibrar para ficar completamente reto e centralizado
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

### Outras pendências de firmware (depois das duas)
1. **Reiniciar o ToF que cai durante a reta/curva** (hoje só reinicia parado): `Vl53l1xSensorAdapter::sense()` e `recoverFailed()`; memória `tof-recuperacao-na-reta-pendente`.
2. **Linha de log de desequilíbrio de tensão das rodas** (aviso quando uma roda pedir mais de 1,5x a tensão da outra numa reta): foi o melhor indicador do motor direito arrastando (corrida 51).
3. **Reduzir o tempo do boot** (4 planos da curva em S x 8 a 12 s): busca mais grossa ou um plano por vez (`domain/CellTurn.cpp`, `planCellTurn`).
4. Medir o **cabo da bateria** (`cabo_esq_mm`) e, se prender-se ao chassi, rever `giro_s_beta_max`.
5. Decidir o destino da **curva com uma roda** (`modo_curva=1`, `oneWheelTurn`) e do **giro no lugar** (`pivotInBoxedCell`): hoje não são usados na corrida; ou entram no projeto como curva, ou saem.

## 8. Índice do pacote de passagem
O pacote com **todos os logs, documentos, o resumo da sessão, o firmware gravado e o repositório (git bundle)** está descrito em `LEIA-ME.md` na raiz do pacote (`passagem-2026-11-21/`, fora do repositório).

