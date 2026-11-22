# Bateria de testes de 21/11/2026 (hoje)

Robô `rato-01`. Firmware: `cd15948` gravado no robô no começo do dia; gravado `fase1-entrega-4` (calib15, 60 chaves) à tarde (tag `pista-21-11`). Operador: equipe de software, com a ponte BLE (`ponte.py` e `t.py` pelo Python do Windows).
Resultados brutos: `corridas.csv`, `logs/corridas/SERPENTINA-30` a `-54`, `log_robo.txt` (todos no pacote de passagem, pasta `logs/`). Cada mudança de `calib` e seu resultado: `CALIBRACAO.md`.
Objetivo do dia: **fazer o robô completar a serpentina** (as duas falhas que sobraram de 20/11) e deixar o roteiro de calibração para o próximo responsável.

## 1. Fase 1 (de manhã, sem o robô)
Auditoria dos logs de 20/11, modelo geométrico e correção (curva em S, `domain/CellTurn`): **430 testes de host passam** (eram 421) e o ESP32 compila **sem aviso nos dois modos** (calibração e prova). Detalhes: `AUDITORIA-2026-11-21.md`, `PROGRESSO_FASE1.md`.

## 2. Procedimento da pista (o que foi rodado e como)
1. **Gravar** só com a **bateria fora**; confirmar `INA219 PAROU` pela serial; reaplicar o calib (a chave da memória passou para `calib15`) em comandos de no máximo 4 chaves; `python t.py E0 --auto` (60 chaves).
2. **Conferir os sensores:** `python t.py cmd tof` (5 leituras dos três ToF), `cmd tofrec` (reinício do que cair) e `cmd "tofmon 60"` (60 s de leitura contínua).
3. **Corrida:** posicionar em (l3,c0) virado ao norte e centrado, ler os ToF da largada, `python trava_execucao.py SERPENTINA-N` e `python t.py corrida --auto SERPENTINA-N "<descrição com calib e largada>"`. Parar: a chave do robô (ou `parar.sh`).
4. Depois de um erro: `python t.py reiniciar` (~45 s: calcula os 4 planos da curva em S).

## 3. Testes executados e resultados
| Teste | O que foi feito | Resultado |
|:--|:--|:--|
| Medida do eixo ao sensor frontal (trena) | robô de frente para a parede: parede ao eixo (P) e o ToF (F) | a 229 mm: P-F = **96,5**; a 51 mm: **92**. O ToF lê ~4,5 mm a mais perto da parede. `eixo_ate_tof_frente` ficou em **88** (o melhor na pista) |
| Curva em S isolada (`virar e`) em (l2,c1) | 2 vezes, robô parado no começo e olhando a saída | com o valor 92: saída **centrada** (E=38/D=30 e E=41/D=27), sem bater |
| 10 giros no lugar em piso livre (`pivo e/d`) | 5 à esquerda, 5 à direita, sem paredes | **88 a 91°**, rodas simétricas (esquerda ≈ direita: ~186 pulsos na que avança, ~179 na que recua); **só o 1º giro depois do reinício patinou** (288 pulsos contra ~180) |
| `tofmon 90` (monitoramento do ToF) | 90 s com o robô parado | direito **988 de 988 leituras**, 0 falhas, 0 erros de I²C (depois do `tofrec`) |
| 5 retas de 3 células em **malha aberta** (`centralizar=0`, `ganho_rumo=0`, `andar 3`) | larguei centrado e medi E/D no fim | desvios à direita **+15, +12, +11 e -4 mm** (a reta 2, com D=0, foi **retirada** da análise a pedido do operador para não contaminar os dados). Média ~+11 mm com ±9 mm de ruído do posicionamento à mão |
| 2 retas **invertidas** (virado ao sul, de (l0,c0) para a largada) | para separar defeito do robô de posição no labirinto | **~0 mm** na 1ª e **~+7 mm** na 2ª: **inconclusivo** |
| `E0` | rodado várias vezes depois de cada mudança do calib | passou com as 60 chaves; a lista esperada foi atualizada para o calib final |
| Curva à direita isolada em (l0,c1) | tentei posicionar o robô | **não executada**: o robô estava na largada, não em (l0,c1) |

## 4. As 25 corridas da serpentina de 21/11 (SERPENTINAS 30 a 54): 15 sucessos
| Corrida | Resultado | Passos | Tempo (s) | Curvas travadas | Posição final |
|:--|:--|:--|:--|:--|:--|
| SERPENTINA-30 | SUCESSO | 7 | 52.5 | 0 | l0,c3 |
| SERPENTINA-31 | SUCESSO | 7 | 53.5 | 0 | l0,c3 |
| SERPENTINA-32 | FALHA | 4 | 23.2 | 3 | l2,c1 |
| SERPENTINA-33b | SUCESSO | 7 | 53.6 | 0 | l0,c3 |
| SERPENTINA-34 | SUCESSO | 7 | 53.7 | 0 | l0,c3 |
| SERPENTINA-35 | FALHA | 4 | 23.2 | 3 | l2,c1 |
| SERPENTINA-36 | SUCESSO | 7 | 51.6 | 0 | l0,c3 |
| SERPENTINA-37 | FALHA | 4 | 23.2 | 3 | l2,c1 |
| SERPENTINA-38 | SUCESSO | 7 | 53.0 | 0 | l0,c3 |
| SERPENTINA-39 | FALHA | 7 | 47.2 | 0 | l2,c3 |
| SERPENTINA-40 | SUCESSO | 7 | 52.7 | 0 | l0,c3 |
| SERPENTINA-41 | SUCESSO | 7 | 52.5 | 0 | l0,c3 |
| SERPENTINA-42 | SUCESSO | 7 | 53.3 | 0 | l0,c3 |
| SERPENTINA-43 | SUCESSO | 7 | 57.1 | 1 | l0,c3 |
| SERPENTINA-44 | FALHA | 6 | 43.6 | 0 | l2,c3 |
| SERPENTINA-45 | FALHA | 6 | 40.7 | 0 | l1,c2 |
| SERPENTINA-46 | FALHA | 6 | 43.2 | 0 | l2,c2 |
| SERPENTINA-47 | FALHA | 4 | 27.0 | 3 | l2,c1 |
| SERPENTINA-48 | FALHA | 7 | 52.1 | 3 | l2,c3 |
| SERPENTINA-49 | SUCESSO | 7 | 53.1 | 0 | l0,c3 |
| SERPENTINA-50 | SUCESSO | 7 | 52.3 | 0 | l0,c3 |
| SERPENTINA-51 | FALHA | 2 | 9.0 | 0 | l2,c0 |
| SERPENTINA-52 | SUCESSO | 7 | 51.2 | 0 | l0,c3 |
| SERPENTINA-53 | SUCESSO | 7 | 53.4 | 0 | l0,c3 |
| SERPENTINA-54 | SUCESSO | 7 | 52.8 | 0 | l0,c3 |

Observações por corrida:
- **30, 31, 33b, 34, 36, 38:** passaram; a 2ª curva em S às vezes raspou na parede de fora. **32, 35, 37:** a 1ª curva em S travou (57°, 26° e 36°) antes de existir a 2ª tentativa; a 38 passou com ela já gravada.
- **39:** falhou por "rumo perdido: 10,1°" na diagonal da curva em S (limite subiu para 18°).
- **40, 41, 42, 43:** 4 seguidas com sucesso; na **43** a **2ª tentativa funcionou** (travou a 55,9°, voltou, recuou 6 mm, deu certo).
- **44 e 45** (curva contínua ligada): o operador **parou** o robô arrastando na parede direita, na 3ª curva à direita (a contínua). **46** (contínua desligada): também parada pelo operador.
- **46, 47, 48:** com `curva_continua=0` (e `curva_dir_fora=16`): **0 de 3** (47 e 48 travaram; a 48 passou o S com a 2ª tentativa de 12 mm, mas travou o arco parado em (l2,c2)). Voltou a 1.
- **49, 50, 52, 53:** passaram na configuração final. **51:** falhou por arrasto do motor direito (**7,2 V contra 3,1 V** na ré). Depois de **limpar os motores**, a 52 e a 53 tiveram **3,5 V contra 3,5 V**.
- **54:** passou com `curva_dir_fora=16`, **pior** (estimativa lateral 20 a 35 mm à direita contra 3 a 10 na 52); desfeito para 8.

## 5. Achados do dia
1. A **janela da curva em S** é de ~±5 mm de posição do eixo, e a 1ª curva travou ~1 de cada 4 vezes: a **2ª tentativa automática** resolve a maioria.
2. **O ToF direito cai sozinho** (volta ao 0x29) e o `tofrec` recupera; não é o cálculo dos planos.
3. **Motor direito com arrasto intermitente** (corrida 51); limpar resolve por um tempo.
4. **O robô raspa na parede direita** na saída das curvas (arcos à direita e curva em S): causa não fechada; ajustes cegos de calib não resolveram. Próximo passo: **calibrar reto e centralizado a cada curva** (`PASSAGEM_CALIBRACAO.md`, seção 7).
5. Cada plano da curva em S leva **8 a 12 s** no ESP32 (~45 s de boot).

## 6. Calib no fim do dia
Ver `PASSAGEM_CALIBRACAO.md`, seção 2 (`eixo_ate_tof_frente=88`, `max_parede=35`, `alvo_lateral_dir_mm=-8`, `alvo_pos_esq_mm=0`, `curva_dir_fora=8`, `ajuste_2a_tentativa=24`, entre outras) e `firmware/calib_em_uso_no_robo.txt` no pacote.
