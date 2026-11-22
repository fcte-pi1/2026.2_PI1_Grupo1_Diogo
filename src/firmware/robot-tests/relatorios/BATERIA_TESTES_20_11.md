# Bateria de testes de 20/11/2026 (ontem)

Robô `rato-01`, firmware gravado em 20/11 de manhã (calib de 30 chaves) e regravado várias vezes ao longo do dia; no fim da noite `cd15948` (calib14, 56 chaves). Operador: equipe de software, com o robô no labirinto de MDF e a ponte BLE (`ponte.py` + `t.py`).
Resultados brutos: `robot-tests/resultados/RESULTADOS.md` (seção "BATERIA DE 20/11/2026"), `corridas.csv`, `logs/corridas/SERPENTINA-N/` e os arquivos `e16a_20_11*.txt`, `ciclos_partida*_20_11.txt`, `grade_ganhos_20_11.txt` (todos no pacote de passagem, pasta `logs/`).
Objetivo do dia: fechar o bloco 1 (robô apoiado), a reta e a ré contínuas, a **curva contínua** e as primeiras corridas da **serpentina 4x4**.

## 1. Como cada teste é rodado
`python t.py <ID>` (ex.: `E0`, `H1`, `E15`, `E16a`): mostra o preparo, espera o "ok" do operador, manda os comandos pela ponte, confere o log e escreve a seção em `RESULTADOS.md`. `--auto` roda sem perguntar (usado nas corridas). `python t.py corrida --auto <ROTULO> "<descrição>"` roda uma corrida inteira, grava `logs/corridas/<ROTULO>/` e uma linha em `corridas.csv`.
Antes de cada corrida: `python trava_execucao.py <ROTULO>` (um nome novo por corrida: a trava recusa repetir).

## 2. O que foi executado de manhã (09:30 a 12:30)
| Bloco | Testes | Resultado |
|:--|:--|:--|
| Gravação e calib | `E0` (30 chaves do calib) | PASSOU (3 vezes, depois de cada gravação) |
| Robô apoiado (bloco 1) | `H1`, `H2`, `H6`, `H7`, `H8`, `A1`, `A2`, `A3`, `A4`, `A5`, `O2`, `O3` | **PASSARAM** (`H5` falhou na 2ª tentativa; `O2` só passou na 5ª) |
| Rampa de tensão | `E10a`, `E10b` (rampa 50 V/s contra desligada, corredor MDF) | passaram na maioria; com 15 V/s a reta não chega ao fim da célula (satura em 7,5 V); **ficou 50** |
| Partida dos motores | `E4` | falhou 2x e passou na 3ª: **achado de energia** (seção 4) |
| Corredor de MDF | `B1M` | FALHOU: o corredor de MDF mede **~150 mm, não 168**; `largura_corredor` passou a 150 só para esse corredor |
| Reta contínua | `E15` (3 tentativas) | passou depois de ajustar o ganho do termo da parede; "movimento em arrancos" corrigido |
| Serpentina | SERPENTINAS 1 a 4 | **falharam** (passo 6 rumo perdido; passo 5 curva travada + desfazer para o lado errado; passo 7 curva travada 2x; passo 3 curva com uma roda travou a -53°) |

## 3. O que foi executado à tarde e à noite (19:30 em diante)
- **Curva contínua** (`E16a` à direita, `E16b` à esquerda, 9 rodadas do `E16a`, tabela em `CURVA_CONTINUA_20_11.md`): o giro foi de -55,8° (travou) a -105,6° até fechar em -88 a -90°. O que mudou: arco a 80 mm/s com o giroscópio mandando, soma do giro ao frear, filtro de leitura brusca da bateria e **`escala_giro` de 1,08 para 1,00** (medido com `giroang`: 90° à mão deram 97,1°; duas voltas de 720° deram 771,6°).
- **Grade de ganhos** (`grade_ganhos_20_11.txt`): abortada, o robô ficou perto da parede.
- **Ciclos de partida** (`ciclos_partida_20_11.txt`: 18 ciclos, 13 quedas de energia com rampa 0/15/50; `ciclos_partida2_20_11.txt`: **5 de 5 OK** com reinício por software).
- **SERPENTINAS 5 a 29** (25 corridas, **0 sucessos**): ver tabela na seção 5. As falhas sobraram em dois pontos: o arco à direita de (l0,c1) (passo 5) e a reta depois do giro no lugar à esquerda de (l2,c3) (passo 7).

## 4. Achados do dia
1. **Quedas de energia na partida dos motores** (3 de 4 primeiras partidas depois de ligar o balancim; o reinício por software não reproduz): relatório para a equipe de energia (`ACHADOS_EQUIPE_ENERGIA.md`, `PARA_EQUIPE_ENERGIA_ELETRONICA.md`).
2. **O robô deriva para a direita** ao longo de ~20 manobras (o ToF direito chega a 0 perto da parede) e a centralização não segura a deriva: já aparecia **de manhã**. É o mesmo viés que continuou em 21/11.
3. **Corredor de MDF de teste tem ~150 mm** (o do labirinto oficial, 168 mm).
4. **INA219** lê 1,7 V abaixo do cellmeter em parte das leituras; `bateria_minima=5,5` só nos testes.
5. **O cabo da bateria** (lateral esquerda, ~10 mm) e a largada fora do centro travam as curvas à esquerda.
6. Funcionou: reta e ré contínuas, centralização no corredor reto, exploração do labirinto (beco com ré contínua) e o desfazer do arco.

## 5. As 25 corridas da serpentina de 20/11 (SERPENTINAS 5 a 29)
| Corrida | Resultado | Passos | Tempo (s) | Curvas travadas | Posição final |
|:--|:--|:--|:--|:--|:--|
| SERPENTINA-5 | FALHA | 3 | 16.6 | 3 | l2,c0 |
| SERPENTINA-6 | FALHA | 3 | 16.1 | 0 | l2,c1 |
| SERPENTINA-7 | FALHA | 4 | 21.4 | 3 | l2,c1 |
| SERPENTINA-8 | FALHA | 1 | 6.1 | 0 | l0,c0 |
| SERPENTINA-9 | FALHA | 3 | 18.7 | 0 | l2,c1 |
| SERPENTINA-10 | FALHA | 1 | 3.1 | 0 | l2,c0 |
| SERPENTINA-11 | FALHA | 1 | 3.3 | 0 | l2,c0 |
| SERPENTINA-12 | FALHA | 1 | 3.3 | 0 | l2,c0 |
| SERPENTINA-13 | FALHA | 3 | 18.6 | 0 | l2,c1 |
| SERPENTINA-14 | FALHA | 3 | 18.7 | 0 | l2,c1 |
| SERPENTINA-15 | FALHA | 4 | 24.3 | 3 | l2,c1 |
| SERPENTINA-16 | FALHA | 4 | 26.8 | 0 | l0,c1 |
| SERPENTINA-17 | FALHA | 5 | 26.1 | 3 | l2,c1 |
| SERPENTINA-18 | FALHA | 7 | 53.8 | 5 | l1,c3 |
| SERPENTINA-19 | FALHA | 5 | 34.3 | 3 | l0,c1 |
| SERPENTINA-20 | FALHA | 7 | 55.5 | 5 | l1,c3 |
| SERPENTINA-21 | FALHA | 5 | 35.2 | 3 | l0,c1 |
| SERPENTINA-22 | FALHA | 5 | 35.2 | 3 | l0,c1 |
| SERPENTINA-23 | FALHA | 7 | 53.7 | 0 | l2,c3 |
| SERPENTINA-24 | FALHA | 7 | 55.3 | 0 | l2,c3 |
| SERPENTINA-25 | FALHA | 7 | 72.0 | 2 | l2,c3 |
| SERPENTINA-26 | FALHA | 7 | 68.1 | 0 | l2,c3 |
| SERPENTINA-27 | FALHA | 2 | 10.0 | 0 | l2,c0 |
| SERPENTINA-28 | FALHA | 5 | 41.4 | 3 | l0,c1 |
| SERPENTINA-29 | FALHA | 5 | 42.3 | 3 | l0,c1 |

## 6. Calib no fim do dia (as chaves fora do padrão)
`eixo_ate_frente=100 eixo_ate_tof_frente=98 largura_frente=112 tof_lado_ao_centro=55.5 escala_giro=1.00 freio_pivo=4 centralizar=1 ganho_rumo=1.0 ganho_parede=3 max_parede=22 folga_arco=18 antecipa_arco=12 arco_esq_atraso=-14 desfazer_tensao_fora=3.6 desfazer_tensao_dentro=2.2 ajuste_fino_min=0.4 alvo_pos_esq_mm=12 rumo_max_lateral=8 giro_aberto=1 bateria_minima=5.5`.
Não executados em 20/11: `B1M/B1A` formais, `E1` a `E3`, `E4b`, `B4/B5`, `C`, `D` oficiais, `F`, `G`.
