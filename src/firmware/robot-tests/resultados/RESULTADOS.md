# Bateria completa — 19/11/2026 (calib padrão = linha de base)

Repositório: branch `feat/controle-motores-tensao`, commit 8282d64. Linha de base: 16/11 (RESULTADOS.md em
`/mnt/c/Users/samue/Downloads/markdown/resultados/resultados/16-11/`).

## Etapa 0 (reconhecer a máquina) — feita
- Commits `683e2c6` a `8282d64` presentes; `Calibration.hpp` com `modo_curva`/`preset_cad`/`cabo_frente_mm`;
  `ArcUndo`, `SweptFootprint`, `RaceTimeModel`, `ReportFrame`, comando `labirinto` no `main.cpp`, `FreeRace` e
  bloco O: tudo existe. `git status`: só `PROMPT_BATERIA_COMPLETA.md` e arquivos novos desta bateria.
- ESP-IDF 5.3 em `~/esp/esp-idf`; Python do Windows 3.12 em `C:\Users\samue\AppData\Local\Programs\Python\Python312\`.
- `usbipd list` (19/11): a placa do robô (CH343/CP2102) aparece só como "Persisted", ou seja, **não conectada agora**.
- `robot-tests/resultados/` estava vazia: nada a mover.

## Bloco P — provas no computador
- **P1 testes de host:** PASSOU. 317 de 317 (eram 252), 0 avisos (`-DFIRMWARE_WARNINGS_AS_ERRORS=ON`).
- **P2 simulação das pistas (Navigator + SimulatedRobot, sem robô):**
  - Pista A D4→A1: chegou, 10 passos, 0 batidas, 0 meias-voltas. Caminho D4 C4 C3 B3 A3 A2 B2 C2 C1 B1 A1 (igual à tabela).
  - Pista A D1→A4: chegou, 10 passos, 0 batidas. Caminho D1 C1 C2 B2 A2 A3 B3 C3 C4 B4 A4 (igual à tabela).
  - Pista B D4→A1: chegou, 10 passos, 0 batidas, sem visitar A4/B4.
  - Pista B D1→A4: **ACHADO.** Não chega (inalcançável) e não declara "sem caminho": entra em laço A3↔B3
    (28 rés em 64 passos) até o limite de passos. Ver `MUDANCAS.md`, achado 2.
  - 4x4, 4x8, 8x4, 4x12, 12x4, nos dois cantos (12 labirintos cada): todos chegam, sem bater.
- **P3 compilação da placa:** **FALHOU** na 1ª tentativa (1 arquivo); depois da correção aprovada (MUDANCAS.md, mudança 1) **PASSOU**: saída 0, 0 avisos, opções RATO conferidas (LOG_RETA=y, FIOS_MOTORES_TROCADOS=y, o resto desligado). Texto original do erro: `Drv8833MotionAdapter.cpp:1267` (`snprintf` do motivo do
  desfazer, `-Werror=format-truncation`). O resto compilou, inclusive `main.cpp`. Correção proposta em
  `MUDANCAS.md` (aguarda aprovação). Log: `build.log`; início do build em `build.hora`.

## Pendente até aqui
Etapa 0b (fotos do robô), Etapa 1 (gravar, depende de aprovar a correção do P3) e todos os blocos com o robô.

## Etapa 0b — conhecer o robô (em andamento)
- Fotos em `fotos/` (traseira, lado_a, lado_b, frente, cima). Peças confirmadas nas fotos: chassi lilás, 2 rodas
  amarelas atrás, chave liga/desliga preta (balancim "O/—") atrás à esquerda, bateria dentro do chassi (etiqueta
  "839" pela janela lateral), esfera metálica de apoio na frente, 3 ToF (frontal, esquerdo, direito), ESP32-S3 com
  2 USB-C (cabo na porta UART/CH343), MPU-6050, INA219, regulador verde, ponte H vermelha, 2 encoders, placa de pé
  com botão, DIP, LED vermelho e azul e buzzer.
- **DIP:** a chave tem 6 vias, mas só as vias 1, 2 e 3 foram soldadas (informação do operador); as outras 3 são
  inutilizáveis. Coincide com o firmware (lê as vias 1, 2 e 3).
- **Cabo da bateria (vermelho/preto com conector branco):** faz uma alça PARA FORA da lateral do chassi
  (fotos lado_a/lado_b). O operador disse "1 cm do fim do chassi esquerdo ao fio": a confirmar se é este cabo e se
  sai 1 cm para fora. Se sim, a largura nesse lado passa de ~50 mm para ~60 mm do centro (folga lateral desse lado
  cai de 30 para ~24 mm): recolher o cabo para dentro do chassi antes dos testes no labirinto.

## Etapa 1 — gravação (19/11, 09:4x)
Gravado `micromouse_firmware.bin` (commit 8282d64 + correção do P3), bateria DESLIGADA (INA219 sem leitura), pela
UART. Boot conferido (`boot.log`): compilado Nov 19 2026 09:41:26; ToF esquerdo/frontal/direito prontos em
0x30/0x31/0x32; giroscópio ok; DIP 4x4 partida pela esquerda; todos os `calib` em padrão (chave calib2); aviso
esperado da frente CAD x campo (22,8 mm); arco começa com o frontal a 100,3 mm.

## Etapa 2 — ponte e primeiro contato — PASSOU
Ponte conectada por Bluetooth (`rato-01`, boot bb3e6e). `saude`: zero erros de I²C, zero quedas de ToF, bat=0,80 V
(bateria desligada, esperado). `calib-ver`: todos os valores em padrão, inclusive as chaves novas.

## Etapa 0b item 4 — treino sem motor (bateria desligada)
- T1 (1ª tentativa): dedo no sensor "esquerdo" do operador: reagiu o D (30 mm). Causa: o operador apontou o lado
  oposto (confirmado: "A"). Não é defeito.
- T1 (2ª tentativa, referência = lado do cabo da bateria): reagiu o ESQUERDO (E=40 mm; F=255; D=869). PASSOU.
- T2 (frontal): reagiu o FRONTAL (F=51 mm; E=985; D=869). PASSOU.
- T3 (roda esquerda, +1 volta): encoder E=+293, D=0. PASSOU. T3b (roda direita): D=+189, E=0 (volta parcial). PASSOU.
Conclusão: sensores E/F/D e encoders E/D correspondem aos lados reais (esquerdo = lado do cabo da bateria).
## O1 (tentativa 1) — PASSOU (falta a resposta do operador) — 09:51:49

Toque longo alterna em pé e deitado (sem mover). Comando(s): .

- PASSOU: 1o toque longo: labirinto EM PE
- PASSOU: 2o toque longo: voltou a deitado
- PASSOU: o toque longo NÃO largou a corrida

Respostas do operador ao O1 (tentativa 1), 09:52:16:

- PASSOU: operador: Ouviu 3 bips curtos no 1o toque e 1 bip longo no 2o? -> s
- veredito final: PASSOU


## Etapa 0b item 4(c) / O1 — botão e buzzer — PASSOU
Dois toques longos contados (EM PE, depois deitado), sem largar a corrida; operador ouviu 3 bips curtos e 1 bip longo.
Botão (GPIO 13, ressoldado) e buzzer funcionam.

## T4 — ligar a bateria limpo — PASSOU
Na 1ª troca USB→bateria (09:53) o reset foi BROWNOUT (1 evento, o balancim quicou ao ligar). Depois de desligar 10 s e
ligar uma vez, reset=LIGOU (poweron), bat=8,01 V. Evento isolado, não repetido. Se reaparecer: hardware (alimentação).
## H1 (tentativa 1) — PASSOU — 09:55:49

Diagnóstico geral do hardware. Comando(s): diag.

- PASSOU: diag: fim: OK
- PASSOU: firmware gravado: versão 8282d64, compilado em Nov 19 2026 09:41:26; base do repositório 8282d64. Confira que a data e a hora são as da compilação que você acabou de fazer

## H2 (tentativa 1) — PASSOU — 09:56:37

ToF parados por 30 s. Comando(s): tofmon 30.

- PASSOU: tofmon: OK: nenhuma falha
- dado: ToF E: 323 medidas, 0 falhas, média 984.1 mm (978 a 990)
- dado: ToF F: 323 medidas, 0 falhas, média 258.2 mm (244 a 261)
- dado: ToF D: 323 medidas, 0 falhas, média 849.8 mm (833 a 863)


## H1 — PASSOU (diag: fim: OK; firmware 8282d64, 19/11 09:41:26)
## H2 — PASSOU (ToF 323 medidas, 0 falhas; E 978-990, F 244-261, D 833-863 mm)
## H4 — 1ª tentativa INVALIDADA (erro de preparo do operador)
O operador esqueceu de desligar e religar a bateria: o boot continuava o mesmo (4e5d3a) e o log dizia "ligado ha
175 s" na 1ª leitura (giroscópio já aquecido, 50,1 C). Interrompida; será refeita desde o desliga/liga.
## H4 (tentativa 1) — PASSOU — 10:03:18

Giroscópio parado por 3 minutos, logo depois de ligar. Comando(s): giro.

- PASSOU: 7 de 7 leituras do giroscópio
- PASSOU: aos 11 s: média -0.078 graus/s, variação 0.61 (limite 3,0), temp 50.3 C
- PASSOU: aos 43 s: média -0.085 graus/s, variação 0.76 (limite 3,0), temp 50.6 C
- PASSOU: aos 74 s: média -0.089 graus/s, variação 0.64 (limite 3,0), temp 50.7 C
- PASSOU: aos 106 s: média -0.068 graus/s, variação 0.70 (limite 3,0), temp 50.6 C
- PASSOU: aos 138 s: média -0.080 graus/s, variação 0.76 (limite 3,0), temp 50.6 C
- PASSOU: aos 169 s: média -0.084 graus/s, variação 0.67 (limite 3,0), temp 50.8 C
- PASSOU: aos 201 s: média -0.093 graus/s, variação 0.64 (limite 3,0), temp 50.8 C
- PASSOU: desvio entre -0.09 e -0.07 graus/s (limite ±25)
- dado: mudança do desvio nos 3 min: 0.02 graus/s (o firmware desconta o desvio; anote para a equipe)

## H5 (tentativa 1) — PASSOU — 10:05:10

Encoders, girando as rodas à mão. Comando(s): enc 25.

- PASSOU: roda esquerda: 266 pulsos (uma volta para a frente = +285, aceito 225 a 345)
- PASSOU: roda direita: 229 pulsos (aceito 225 a 345)

## H6 (tentativa 1) — PASSOU — 10:06:34

Cada roda sozinha, nos dois sentidos. Comando(s): rodas.

- dado: rodas: roda E para frente: parte com 1.6 V | 3 V: 1112 pulsos/s (392 mm/s) 0.09 A | 6 V: 2348 pulsos/s (828 mm/s) 0.10 A | encoder: 2376 pulsos, sentido certo | outra roda: 0 pulsos
- dado: rodas: roda E para tras: parte com 1.8 V | 3 V: -1117 pulsos/s (-394 mm/s) 0.09 A | 6 V: -2370 pulsos/s (-836 mm/s) 0.10 A | encoder: -2394 pulsos, sentido certo | outra roda: 0 pulsos
- dado: rodas: roda D para frente: parte com 1.8 V | 3 V: 1330 pulsos/s (469 mm/s) 0.09 A | 6 V: 2463 pulsos/s (869 mm/s) 0.09 A | encoder: 2593 pulsos, sentido certo | outra roda: 0 pulsos
- dado: rodas: roda D para tras: parte com 1.4 V | 3 V: -1347 pulsos/s (-475 mm/s) 0.09 A | 6 V: -2475 pulsos/s (-873 mm/s) 0.09 A | encoder: -2576 pulsos, sentido certo | outra roda: 0 pulsos
- PASSOU: rodas: a 6 V de 2348 a 2475 pulsos/s (dif 5%, limite 25%); partida de 1.4 a 1.8 V (limites 3.5 V e dif 1.0 V); bat=7.98 V -> OK

## H7 (tentativa 1) — PASSOU — 10:08:41

As duas rodas a 6 V (a bateria aguenta?). Comando(s): motor ed 6 1500.

- PASSOU: bateria mínima com as duas rodas a 6 V: 7.95 V (mínimo 6,5)
- dado: motor fim: roda E+D a 6.0 V por 1500 ms: enc E=3360 D=3507, velocidade no fim E=2350 D=2480 pulsos/s (829 / 875 mm/s), corrente media 0.12 A max 0.17 A, bateria minima 7.95 V

## H8 (tentativa 1) — FALHOU — 10:08:47

Contadores de erro depois do bloco H. Comando(s): saude.

- FALHOU: motivo do último reset: BROWNOUT (a tensao caiu)
- PASSOU: bateria 7.99 V (mínimo 7,0)
- PASSOU: BLE perdidos: linhas=0 eventos=0 pedaços=0
- PASSOU: erros de I2C desde que ligou: ToF E=0 F=0 D=0 IMU=0 INA=0
- PASSOU: ToF: quedas 0/0/0, reinícios 0/0/0, reinícios falhos 0/0/0 (E/F/D)

## H8 (tentativa 2) — PASSOU — 10:11:03

Contadores de erro depois do bloco H. Comando(s): saude.

- PASSOU: motivo do último reset: LIGOU (poweron)
- PASSOU: bateria 8.00 V (mínimo 7,0)
- PASSOU: BLE perdidos: linhas=0 eventos=0 pedaços=0
- PASSOU: erros de I2C desde que ligou: ToF E=0 F=0 D=0 IMU=0 INA=0
- PASSOU: ToF: quedas 0/0/0, reinícios 0/0/0, reinícios falhos 0/0/0 (E/F/D)

## O2 (tentativa 1) — FALHOU (falta a resposta do operador) — 10:12:47

Toque curto larga ao soltar e não alterna. Comando(s): .

- FALHOU: a largada não veio: apertou e soltou rápido (menos de 1 s)?
- PASSOU: nenhum toque longo foi contado
- PASSOU: largada recusada (sem paredes): rodas paradas


## H4/H5/H6/H7/H8 — resumo (19/11)
H4 PASSOU (desvio -0,09 grau/s, variação 0,6-0,76; 1ª tentativa invalidada: operador não religou a bateria).
H5 PASSOU (266 e 229 pulsos). H6 PASSOU no critério automático; REGRESSÃO LEVE: diferença entre rodas a 6 V de 5,4%
(E 2348, D 2475 pulsos/s; 16/11: 1%) e ~20% a 3 V (E 1112, D 1330). H7 PASSOU (bateria mín. 7,95 V; E 2350, D 2480).
H8 FALHOU na 1ª tentativa (reset=BROWNOUT, só na partida) e PASSOU na 2ª (poweron). BROWNOUT intermitente ao ligar o
balancim: 2 de 5 partidas; nunca em movimento. ACHADO DE HARDWARE (alimentação na partida): contato do balancim ou do
conector da bateria. Decisão do operador (19/11, bloco R): SEGUIR para o bloco A mesmo com a diferença de rodas
(5,4%), registrada como "conhecida, a investigar".

## O2 — 1ª tentativa FALHOU por temporização (erro de preparo)
O robô emitiu "botao de largada acionado" 46 ms antes da janela do teste (operador apertou junto com o comando);
recusa da largada e rodas paradas corretas. Repetida.
## O2 (tentativa 2) — PASSOU (falta a resposta do operador) — 10:14:07

Toque curto larga ao soltar e não alterna. Comando(s): .

- PASSOU: o toque curto largou ao soltar
- PASSOU: nenhum toque longo foi contado
- PASSOU: largada recusada (sem paredes): rodas paradas

Respostas do operador ao O2 (tentativa 2), 10:14:40:

- PASSOU: operador: As rodas ficaram PARADAS? -> s
- veredito final: PASSOU

## O3 (tentativa 1) — PASSOU (falta a resposta do operador) — 10:15:41

4x4 girado pelo toque longo: o relato ao painel gira 90 graus. Comando(s): largar.

- PASSOU: relato girado
- PASSOU: largada relatada x=3 y=3 rumo O (esperado x=3 y=3 rumo O)
- PASSOU: largada recusada (sem paredes): rodas paradas

- nota sobre o O3 (10:17:16): Confirmado pelo log do firmware (relato girado x=3 y=3 rumo O). Painel NAO verificado: operador nao viu a tela.

## O4 (tentativa 1) — PASSOU — 10:17:28

Comando 'labirinto 4x8' (em pé) relatado como o deitado, girado. Comando(s): labirinto 4x8, largar.

- PASSOU: relato girado
- PASSOU: largada relatada x=7 y=3 rumo O (esperado x=7 y=3 rumo O)
- PASSOU: largada recusada (sem paredes): rodas paradas

## A1 (tentativa 1) — PASSOU — 10:18:49

ToF sem nada por perto. Comando(s): tof.

- PASSOU: 5 de 5 linhas do tof
- PASSOU: nenhum sensor em falha (-1)

## A2 (tentativa 1) — PASSOU — 10:20:03

Uma célula para a frente, no ar. Comando(s): andar.

- PASSOU: 1 de 1 retas 'andar 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=506 D=506 (esperado 511 ± 15)
- PASSOU: reta 1: giro=0.0 graus (limite 3.0)
- PASSOU: laço da reta: média 2.4 ms (limite 4,0)
- PASSOU: 1 de 1 manobra(s) terminaram ok

## A3 (tentativa 1) — PASSOU — 10:20:23

Uma célula de ré, no ar. Comando(s): re.

- PASSOU: 1 de 1 retas 're de 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=-509 D=-509 (esperado -511 ± 15)
- PASSOU: reta 1: giro=-0.0 graus (limite 3.0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: 1 de 1 manobra(s) terminaram ok

## A4 (tentativa 1) — PASSOU — 10:20:52

Curva com o robô travado (tem de detectar que não girou). Comando(s): virar d.

- PASSOU: 'curva travada' apareceu 2 vezes
- PASSOU: fez a tentativa 2 do arco
- PASSOU: desfez o arco antes da tentativa 2

## A5 (tentativa 1) — PASSOU (falta a resposta do operador) — 10:21:27

Largada sem paredes (tem de recusar). Comando(s): largar.

- PASSOU: largada recusada
- PASSOU: 0 passos

Respostas do operador ao A5 (tentativa 1), 10:21:59:

- PASSOU: operador: As rodas ficaram PARADAS? -> s
- veredito final: PASSOU


## Bloco O — PASSOU (O1, O2 [2ª tentativa], O3 [painel não verificado], O4)
## Bloco A — PASSOU
A1 ToF livres 5/5. A2 reta 506/506 pulsos, giro 0,0, laço 2,4 ms, perfil 1,533 s (modelo -25% confere; tensão da roda
direita menor que a da esquerda: o controle compensa a assimetria do H6). A3 ré -509/-509. A4 curva travada 2x, desfez o
arco e tentativa 2 (falhou como devia, ~4 s). A5 largada recusada, rodas paradas.
## B3-E50 (tentativa 1) — PASSOU — 10:25:25

Calibração do ToF esquerdo a 50 mm. Comando(s): tofmon 5.

- PASSOU: tofmon: OK: nenhuma falha
- dado: ToF E: 54 medidas, 0 falhas, média 56.7 mm (55 a 58)
- dado: ToF F: 54 medidas, 0 falhas, média 163.2 mm (159 a 167)
- dado: ToF D: 54 medidas, 0 falhas, média 384.4 mm (353 a 393)
- PASSOU: ToF esquerdo a 50 mm reais: leu 56.7 mm, erro +6.7 mm (meta ±10)

## B3-E100 (tentativa 1) — PASSOU — 10:25:58

Calibração do ToF esquerdo a 100 mm. Comando(s): tofmon 5.

- PASSOU: tofmon: OK: nenhuma falha
- dado: ToF E: 54 medidas, 0 falhas, média 107.1 mm (105 a 109)
- dado: ToF F: 54 medidas, 0 falhas, média 189.8 mm (187 a 193)
- dado: ToF D: 54 medidas, 0 falhas, média 656.8 mm (650 a 662)
- PASSOU: ToF esquerdo a 100 mm reais: leu 107.1 mm, erro +7.1 mm (meta ±10)

## B3-E150 (tentativa 1) — PASSOU — 10:26:26

Calibração do ToF esquerdo a 150 mm. Comando(s): tofmon 5.

- PASSOU: tofmon: OK: nenhuma falha
- dado: ToF E: 55 medidas, 0 falhas, média 156.9 mm (155 a 159)
- dado: ToF F: 55 medidas, 0 falhas, média 198.6 mm (195 a 201)
- dado: ToF D: 55 medidas, 0 falhas, média 593.9 mm (591 a 598)
- PASSOU: ToF esquerdo a 150 mm reais: leu 156.9 mm, erro +6.9 mm (meta ±10)

## B3-E200 (tentativa 1) — CONFERIR — 10:27:07

Calibração do ToF esquerdo a 200 mm. Comando(s): tofmon 5.

- PASSOU: tofmon: OK: nenhuma falha
- dado: ToF E: 55 medidas, 0 falhas, média 210.4 mm (208 a 214)
- dado: ToF F: 55 medidas, 0 falhas, média 194.3 mm (192 a 196)
- dado: ToF D: 55 medidas, 0 falhas, média 558.6 mm (555 a 563)
- CONFERIR: ToF esquerdo a 200 mm reais: leu 210.4 mm, erro +10.4 mm (meta ±10)

## B3-F50 (tentativa 1) — FALHOU — 10:27:51

Calibração do ToF frontal a 50 mm. Comando(s): tofmon 5.

- FALHOU: tofmon: PROBLEMA: houve falha de leitura
- dado: ToF E: 24 medidas, 0 falhas, média 224.9 mm (199 a 486)
- dado: ToF F: 24 medidas, 24 falhas, média -1.0 mm (-1 a -1)
- dado: ToF D: 24 medidas, 0 falhas, média 169.7 mm (168 a 171)
- FALHOU: o ToF frontal não deu nenhuma medida válida


## B3 — calibração dos ToF (parcial)
E50 PASSOU (56,7 mm, +6,7); E100 PASSOU (107,1, +7,1); E150 PASSOU (156,9, +6,9); E200 CONFERIR (210,4, +10,4; 16/11: +9,5,
diferença 0,9 mm, sem regressão). Alvo: parede real do labirinto, trena.
B3-F50 (1ª tentativa) FALHOU por HARDWARE: corte de energia (poweron) e ToF frontal fora (id=0x0000, 0x29). Recuperado com
`tofrec`. Detalhes e pedidos à equipe em `ACHADOS_EQUIPE_ENERGIA.md`. Decisão do operador: seguir o teste.
## B3-F50 (tentativa 2) — CONFERIR — 10:30:21

Calibração do ToF frontal a 50 mm. Comando(s): tofmon 5.

- PASSOU: tofmon: OK: nenhuma falha
- dado: ToF E: 54 medidas, 0 falhas, média 139.7 mm (138 a 142)
- dado: ToF F: 54 medidas, 0 falhas, média 63.1 mm (61 a 64)
- dado: ToF D: 54 medidas, 0 falhas, média 169.0 mm (167 a 171)
- CONFERIR: ToF frontal a 50 mm reais: leu 63.1 mm, erro +13.1 mm (meta ±10)

## B3-F100 (tentativa 1) — PASSOU — 10:31:14

Calibração do ToF frontal a 100 mm. Comando(s): tofmon 5.

- PASSOU: tofmon: OK: nenhuma falha
- dado: ToF E: 55 medidas, 0 falhas, média 216.6 mm (124 a 372)
- dado: ToF F: 55 medidas, 0 falhas, média 107.0 mm (106 a 109)
- dado: ToF D: 55 medidas, 0 falhas, média 165.9 mm (164 a 168)
- PASSOU: ToF frontal a 100 mm reais: leu 107.0 mm, erro +7.0 mm (meta ±10)

## B3-F150 (tentativa 1) — FALHOU — 10:31:46

Calibração do ToF frontal a 150 mm. Comando(s): tofmon 5.

- FALHOU: tofmon: PROBLEMA: houve falha de leitura
- dado: ToF E: 24 medidas, 0 falhas, média 157.6 mm (33 a 277)
- dado: ToF F: 24 medidas, 24 falhas, média -1.0 mm (-1 a -1)
- dado: ToF D: 24 medidas, 0 falhas, média 163.7 mm (161 a 165)
- FALHOU: o ToF frontal não deu nenhuma medida válida

## B3-F150 (tentativa 2) — CONFERIR — 10:33:26

Calibração do ToF frontal a 150 mm. Comando(s): tofmon 5.

- PASSOU: tofmon: OK: nenhuma falha
- dado: ToF E: 55 medidas, 0 falhas, média -1.0 mm (-1 a -1)
- dado: ToF F: 55 medidas, 0 falhas, média 134.8 mm (133 a 136)
- dado: ToF D: 55 medidas, 0 falhas, média 163.5 mm (161 a 166)
- CONFERIR: ToF frontal a 150 mm reais: leu 134.8 mm, erro -15.2 mm (meta ±10)

## B3-F200 (tentativa 1) — FALHOU — 10:35:13

Calibração do ToF frontal a 200 mm. Comando(s): tofmon 5.

- FALHOU: tofmon: PROBLEMA: houve falha de leitura
- dado: ToF E: 24 medidas, 0 falhas, média 319.1 mm (301 a 333)
- dado: ToF F: 24 medidas, 24 falhas, média -1.0 mm (-1 a -1)
- dado: ToF D: 24 medidas, 0 falhas, média 162.2 mm (161 a 163)
- FALHOU: o ToF frontal não deu nenhuma medida válida

## B3-F200 (tentativa 2) — CONFERIR — 10:35:45

Calibração do ToF frontal a 200 mm. Comando(s): tofmon 5.

- PASSOU: tofmon: OK: nenhuma falha
- dado: ToF E: 56 medidas, 0 falhas, média -1.0 mm (-1 a -1)
- dado: ToF F: 56 medidas, 0 falhas, média 210.6 mm (208 a 214)
- dado: ToF D: 56 medidas, 0 falhas, média 161.8 mm (160 a 164)
- CONFERIR: ToF frontal a 200 mm reais: leu 210.6 mm, erro +10.6 mm (meta ±10)

## B3-D50 (tentativa 1) — FALHOU — 10:39:09

Calibração do ToF direito a 50 mm. Comando(s): tofmon 5.

- FALHOU: o teste não chegou ao fim (sem resposta do robô, ou interrompido)
- FALHOU: O ROBÔ REINICIOU SOZINHO durante o teste (boot c9b043 -> 0d7b97): queda de tensão ou travamento. Rode 'python t.py H1' e veja o 'reset='
- FALHOU: o tofmon não terminou
- FALHOU: o ToF direito não deu nenhuma medida válida


## B3 — frontal e direito (hardware instável; interrompido pelo operador/regra 10)
F50 CONFERIR (63,1; +13,1), F100 PASSOU (107,0; +7,0), F150 CONFERIR (134,8; -15,2: montagem da parede), F200 CONFERIR
(210,6; +10,6). O ToF frontal caiu 3 vezes (recuperado por tofrec). D50: a placa reiniciou por BROWNOUT no início do
teste (bat 7,69 V): sem medida válida (FALHOU por hardware). D100, D150 e D200 NÃO medidos.
## B3-D50 (tentativa 2) — CONFERIR — 10:40:46

Calibração do ToF direito a 50 mm. Comando(s): tofmon 5.

- PASSOU: tofmon: OK: nenhuma falha
- dado: ToF E: 55 medidas, 0 falhas, média 373.9 mm (360 a 381)
- dado: ToF F: 55 medidas, 0 falhas, média 1272.9 mm (1231 a 1298)
- dado: ToF D: 55 medidas, 0 falhas, média 38.7 mm (36 a 40)
- CONFERIR: ToF direito a 50 mm reais: leu 38.7 mm, erro -11.3 mm (meta ±10)

## B3-D100 (tentativa 1) — PASSOU — 10:41:31

Calibração do ToF direito a 100 mm. Comando(s): tofmon 5.

- PASSOU: tofmon: OK: nenhuma falha
- dado: ToF E: 55 medidas, 0 falhas, média 390.1 mm (377 a 421)
- dado: ToF F: 55 medidas, 0 falhas, média 454.5 mm (454 a 455)
- dado: ToF D: 55 medidas, 0 falhas, média 101.2 mm (99 a 103)
- PASSOU: ToF direito a 100 mm reais: leu 101.2 mm, erro +1.2 mm (meta ±10)

## B3-D150 (tentativa 1) — PASSOU — 10:42:04

Calibração do ToF direito a 150 mm. Comando(s): tofmon 5.

- PASSOU: tofmon: OK: nenhuma falha
- dado: ToF E: 54 medidas, 0 falhas, média 624.8 mm (621 a 627)
- dado: ToF F: 54 medidas, 0 falhas, média -1.0 mm (-1 a -1)
- dado: ToF D: 54 medidas, 0 falhas, média 146.8 mm (144 a 151)
- PASSOU: ToF direito a 150 mm reais: leu 146.8 mm, erro -3.2 mm (meta ±10)

## B3-D200 (tentativa 1) — FALHOU — 10:42:35

Calibração do ToF direito a 200 mm. Comando(s): tofmon 5.

- FALHOU: tofmon: PROBLEMA: houve falha de leitura
- dado: ToF E: 24 medidas, 0 falhas, média 612.2 mm (609 a 616)
- dado: ToF F: 24 medidas, 0 falhas, média 334.2 mm (323 a 352)
- dado: ToF D: 24 medidas, 24 falhas, média -1.0 mm (-1 a -1)
- FALHOU: o ToF direito não deu nenhuma medida válida

## B3-D200 (tentativa 2) — PASSOU — 10:43:09

Calibração do ToF direito a 200 mm. Comando(s): tofmon 5.

- PASSOU: tofmon: OK: nenhuma falha
- dado: ToF E: 54 medidas, 0 falhas, média 611.3 mm (608 a 614)
- dado: ToF F: 54 medidas, 0 falhas, média -1.0 mm (-1 a -1)
- dado: ToF D: 54 medidas, 0 falhas, média 192.7 mm (189 a 200)
- PASSOU: ToF direito a 200 mm reais: leu 192.7 mm, erro -7.3 mm (meta ±10)


## B3 — tabela final (real -> lido, erro em mm; alvo = parede do labirinto, trena, +-3 mm de montagem manual)
E: 50->56,7 (+6,7) P | 100->107,1 (+7,1) P | 150->156,9 (+6,9) P | 200->210,4 (+10,4) CONFERIR
F: 50->63,1 (+13,1) CONFERIR | 100->107,0 (+7,0) P | 150->134,8 (-15,2) CONFERIR (parede mal posta) | 200->210,6 (+10,6) CONFERIR
D: 50->38,7 (-11,3) CONFERIR | 100->101,2 (+1,2) P | 150->146,8 (-3,2) P | 200->192,7 (-7,3) P
Regressão vs 16/11 (mudança de erro > 5 mm): F50 (+6,9), D100 (-5,1), D150 (-8,8), D200 (-12,0): o direito mudou de offset
(antes +4,7 a +6,3 acima; agora abaixo). Possível troca/ressolda do módulo ou montagem manual. Nenhuma leitura 0 "ok".
Quedas de ToF durante o B3 (robô parado, após mexer na parede): frontal 3x, direito 1x; recuperados por tofrec.
## B1 (tentativa 1) — FALHOU (falta a resposta do operador) — 10:47:33

5 células em linha reta no chão. Comando(s): andar.

- FALHOU: o teste não chegou ao fim (sem resposta do robô, ou interrompido)
- FALHOU: O ROBÔ REINICIOU SOZINHO durante o teste (boot 0d7b97 -> 684ac0): queda de tensão ou travamento. Rode 'python t.py H1' e veja o 'reset='
- FALHOU: 0 de 5 retas 'andar 1 celula' no log
- FALHOU: manobra falhou: []

## B1 (tentativa 2) — FALHOU (falta a resposta do operador) — 10:51:06

5 células em linha reta no chão. Comando(s): andar.

- FALHOU: o teste não chegou ao fim (sem resposta do robô, ou interrompido)
- FALHOU: O ROBÔ REINICIOU SOZINHO durante o teste (boot 26d89b -> d4f9ac): queda de tensão ou travamento. Rode 'python t.py H1' e veja o 'reset='
- FALHOU: 0 de 5 retas 'andar 1 celula' no log
- FALHOU: manobra falhou: []

- calibração (19/11 11:10:48): gravado no robô: tof_na_reta=0

- calibração (19/11 11:11:44): gravado no robô: tof_na_reta=1


## Teste decisivo de `tof_na_reta` (11:1x) — DESCARTADO (erro de preparo do operador)
O robô estava no SUPORTE (rodas no ar), não no corredor do labirinto, embora a mensagem dissesse o contrário. No ar o `andar`
nunca reiniciou, nem antes de `tof_na_reta=0`; portanto as 4 manobras sem reinício (retas 508/507 e 509/508 pulsos, rés
-512/-514) NÃO provam nada sobre a chave. O controle com `tof_na_reta=1` foi interrompido pelo operador. Refazer no chão
liso do labirinto (MDF).

## Retas/rés no MDF do labirinto (padrão, tof_na_reta=1) — PASSOU
andar 504/504 (giro 1,0), andar 507/507 (-0,2), re -511/-511 (giro 0,0), re -507/-507 (-0,2): 4/4 sem reinício. Linha de base 506-510.

## Veredito parcial (19/11/2026)
- Testes de host: 318/318 passando, 0 avisos (317 + 1 da chave tof_na_reta). Compilação da placa: PASSOU (após correção aprovada).
- Gravação: feita 2x (09:41 e 11:01); calib padrão com as chaves novas.
- Bloco H: PASSOU (regressão leve nas rodas 5,4%; BROWNOUT intermitente na partida).
- Bloco O: PASSOU (painel não verificado). Bloco A: PASSOU.
- Regressão (R): rodas 6 V (5,4% contra 1%); ToF direito mudou de offset (D100 a D200: -5 a -12 mm); frontal 50 mm +13.
- B3: esquerdo ok; frontal 3 CONFERIR; direito 1 CONFERIR (hardware instável durante a medição).
- B1/B2 formais (azulejo): FALHARAM por reinício de energia; retas/rés no MDF: PASSARAM (4/4).
- NÃO EXECUTADOS: B4, B5 (curvas), C (labirinto manobra a manobra), D (corridas), E (novidades), F (layouts), G (resistência).
- Achados: pista B D1->A4 entra em laço (não declara "sem caminho"); ToF direito/frontal caem; BROWNOUT na partida;
  reinício no azulejo; cabo da bateria pendendo. Operador só pode mexer em software (ver ACHADOS_EQUIPE_ENERGIA.md).
- Mudanças de código nesta bateria: 2 (MUDANCAS.md): correção do snprintf do P3 e chave `tof_na_reta`.
- calibração (19/11 11:18:38): gravado no robô: ganho_rumo=1.0


## Calibração da reta (11:2x) — ganho_rumo
ganho_rumo=0: 3 retas, desvio para a esquerda 33 mm (E 33->0). ganho_rumo=1.0: desvio ~9 mm (E 35->44), robô paralelo e
~7 mm fora do centro (foto). Mantido em 1.0.
- calibração (19/11 11:21:26): gravado no robô: ganho_rumo=0.6


## Calibração da reta — valor final: ganho_rumo=0.6
0 -> desvio 33 mm (colado na parede); 1.0 -> ~9 mm; 0.6 -> ~±3 mm do centro (E 30->27->31->32->33). Gravado na memória do robô.
Rés de volta ao início: -514/-515, -510/-510, -507/-506 (giro <= 0,9), sem reinício. Curvas não testadas (corredor reto, sem saída lateral).
- calibração (19/11 11:23:53): gravado no robô: tof_na_reta=0


## Teste tof_na_reta=0 (11:3x) — A FAVOR da hipótese de leitura de ToF
Com tof_na_reta=1: reinício em 1 de 3 rés (boot efa084->095c0d); laço com travadas de 16-17 ms. Com tof_na_reta=0: 3 retas sem
reinício, laço 2,0 ms (pior 3,0), giro -0,4/+0,8/+1,1. Mantido tof_na_reta=0 e ganho_rumo=0.6. Amostra pequena (3 retas):
confirmar com mais manobras e, idealmente, trocar/consertar o ToF direito.

## Sequência reta/ré/reta no MDF (11:4x, tof_na_reta=0, ganho_rumo=0.6) — PASSOU
andar 504/503 (giro +0,5), andar 510/509 (+0,3), re -511/-511 (-1,9), re -508/-506 (-0,4), andar 504/503 (+0,6), andar 509/509 (+0,3):
6/6 ok, sem reinício (boot 095c0d). Avanço líquido: 2 células (confere com o operador: "andou 2 células"). O ToF frontal leu 523 -> 239 mm
(284 mm) contra ~358 mm da odometria: o frontal não é confiável como régua a ~500 mm (B3 só calibrou até 200 mm).
Dado anterior a rever: no teste "3 retas" de tof_na_reta=0, o operador viu o robô andar 2 células, não 3, enquanto os encoders contaram 3 retas
(o robô havia reiniciado na 3ª ré; posição de partida incerta): inconclusivo.
- calibração (19/11 11:28:38): gravado no robô: tof_na_reta=1


## Sequência 3 retas + 3 rés + 3 retas, tudo ligado (tof_na_reta=1, ganho_rumo=0.6) — 9/9 ok, sem reinício
retas 510/512, 511/511, 521/520 | rés -512, -509, -505 | retas 504/505, 503/504, 531/531. Giro entre -1,6 e +1,4.
Sensor esquerdo 32->45->63 e 41->57->75 mm: deriva de ~15 mm/célula para a DIREITA (antes, com 0.6, ficou +-3 mm). A 3ª reta de cada série
termina com o nariz na parede do fundo (frente 0 perto, 521/531 pulsos, tempo 1395 ms): empurrou ~7 mm. Pendente: o operador diz se raspou
na parede direita. Se sim, voltar ganho_rumo=1.0 (mais estável) ou investigar a diferença da partida.

## Confirmação do operador + fotos (sequência 3+3+3)
Operador: "ele não bateu em nada, somente andou". Fotos: após as 3 rés o robô ficou no início, centrado (~31/27 mm de folga, ~27 mm da parede
de trás); no fim da subida ficou a ~7 mm da parede direita e com o nariz na parede do fundo, sem contato. Corredor real ~3,7 células (~670 mm):
a 3ª reta chega à parede do fundo (521/531 pulsos). Deriva na ida ~15 mm/célula para a direita; a ré volta ao centro. Proposta pendente:
`calib centralizar=1` (RF-44, só a parede esquerda) com 2 retas + 2 rés.
- calibração (19/11 11:33:04): gravado no robô: centralizar=1


## centralizar=1 com tudo ligado (tof_na_reta=1, ganho_rumo=0.6) — 6/6 ok, sem reinício
andar 504/504 (giro -0,8; E=37; pose +2,7 mm; corr 0,8), andar 503/505 (+1,2; E=45; +12,8; 3,6), re -511/-511, re -503/-503,
andar 504/507 (-0,1; E=45; +11,4; 3,2), andar 502/507 (+0,9; E=52; +19,4; 5,5). A pose lateral acompanha a deriva (confere com o ToF E).
Correção fraca (ganho 0,8 pulso/mm, máx 16): deriva ~8 mm/célula para a direita (antes ~15). ToF direito: tofrec reinicia mas lê -1 (hardware).
Estado final do robô: ganho_rumo=0.6, centralizar=1, tof_na_reta=1. Pendente (aprovação): aumentar o ganho de kWallCentering e consertar o ToF direito.

## Sequência final 3 retas + 3 rés + 3 retas, tudo ligado (tof_na_reta=1, ganho_rumo=0.6, centralizar=1) — 9/9 ok, sem reinício, sem batida
retas 505/501, 512/510, 511/510 | rés -511/-511, -510/-509, -504/-504 | retas 504/505, 505/507, 508/509. Giro entre -1,5 e +1,3.
A parada pela parede da frente funcionou: a 3ª reta terminou com o ToF frontal em 65 e 67 mm (sem encostar). ToF esquerdo 21->27->32 e 38->41->42 mm
(perto do centro de 33,5); pose lateral -12,8 -> -1,6 mm (ida) e +5,1 -> +9,8 mm (volta). Estado final do robô: ganho_rumo=0.6, centralizar=1, tof_na_reta=1.

# BATERIA DE 20/11/2026 (continuação)
## Gravação do firmware novo — 09:33:40
- Firmware: commit 266c748 (malhas fechadas, freio suave, giro em célula fechada); 367 testes no computador; placa compilada sem avisos (sdkconfig do projeto, RATO_LOG_RETA=y). Gravado com a bateria FORA (`INA219 PAROU de ler`), hash verificado.
- Boot (boot_20_11_flash.log): `calib: nada gravado: valores padrao` (calib4 limpa), 23 chaves em padrão, freios 2,6 / 8,1 / 2,6, cabo_frente_mm 0, rampa_tensao 50, 3 ToF prontos (E 0x30, F 0x31, D 0x32), DIP 4x4 esquerda. Aviso esperado de frente CAD x campo (22,8 mm).
- Medida da frente com paquímetro: AINDA NÃO feita pelo operador (pendente).
- Calibração de reta de 19/11 (ganho_rumo=0.6, centralizar=1) perdida pelo calib4: reaplicar depois de ligar a bateria.
- calibração (20/11 09:36:17): gravado no robô: ganho_rumo=0.6 centralizar=1

## E0 (tentativa 1) — PASSOU — 09:36:19

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- PASSOU: 23 chaves do calib no log (esperado 23)
- PASSOU: eixo_ate_frente = 87.0 (esperado 87.0)
- PASSOU: largura_frente = 101.0 (esperado 101.0)
- PASSOU: eixo_ate_tof_frente = 85.0 (esperado 85.0)
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 50.5 (esperado 50.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.08 (esperado 1.08)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 8.1 (esperado 8.1)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- dado: ganho_rumo = 0.6 (valor de reta de 19/11: 0.6)
- dado: centralizar = 1.0 (valor de reta de 19/11: 1.0)

## H1 (tentativa 2) — PASSOU — 09:44:10

Diagnóstico geral do hardware. Comando(s): diag.

- PASSOU: diag: fim: OK
- PASSOU: firmware gravado: versão 266c748, compilado em Nov 20 2026 09:28:58; base do repositório 266c748. Confira que a data e a hora são as da compilação que você acabou de fazer

## H2 (tentativa 2) — PASSOU — 09:44:42

ToF parados por 30 s. Comando(s): tofmon 30.

- PASSOU: tofmon: OK: nenhuma falha
- dado: ToF E: 323 medidas, 0 falhas, média 1042.7 mm (1031 a 1065)
- dado: ToF F: 323 medidas, 0 falhas, média 247.4 mm (242 a 252)
- dado: ToF D: 323 medidas, 0 falhas, média 1215.6 mm (5 a 1300)

## H6 (tentativa 2) — PASSOU — 09:45:01

Cada roda sozinha, nos dois sentidos. Comando(s): rodas.

- dado: rodas: roda E para frente: parte com 1.8 V | 3 V: 1090 pulsos/s (385 mm/s) 0.09 A | 6 V: 2257 pulsos/s (796 mm/s) 0.09 A | encoder: 2246 pulsos, sentido certo | outra roda: 0 pulsos
- dado: rodas: roda E para tras: parte com 1.8 V | 3 V: -1095 pulsos/s (-386 mm/s) 0.09 A | 6 V: -2274 pulsos/s (-802 mm/s) 0.09 A | encoder: -2249 pulsos, sentido certo | outra roda: 0 pulsos
- dado: rodas: roda D para frente: parte com 1.6 V | 3 V: 1301 pulsos/s (459 mm/s) 0.09 A | 6 V: 2348 pulsos/s (828 mm/s) 0.09 A | encoder: 2419 pulsos, sentido certo | outra roda: 0 pulsos
- dado: rodas: roda D para tras: parte com 1.6 V | 3 V: -1311 pulsos/s (-462 mm/s) 0.09 A | 6 V: -2362 pulsos/s (-833 mm/s) 0.09 A | encoder: -2418 pulsos, sentido certo | outra roda: 0 pulsos
- PASSOU: rodas: a 6 V de 2257 a 2362 pulsos/s (dif 4%, limite 25%); partida de 1.6 a 1.8 V (limites 3.5 V e dif 1.0 V); bat=8.29 V -> OK

## H7 (tentativa 2) — PASSOU — 09:45:04

As duas rodas a 6 V (a bateria aguenta?). Comando(s): motor ed 6 1500.

- PASSOU: bateria mínima com as duas rodas a 6 V: 8.26 V (mínimo 6,5)
- dado: motor fim: roda E+D a 6.0 V por 1500 ms: enc E=3166 D=3288, velocidade no fim E=2250 D=2360 pulsos/s (794 / 832 mm/s), corrente media 0.11 A max 0.16 A, bateria minima 8.26 V

## H8 (tentativa 3) — PASSOU — 09:45:12

Contadores de erro depois do bloco H. Comando(s): saude.

- PASSOU: motivo do último reset: LIGOU (poweron)
- PASSOU: bateria 8.30 V (mínimo 7,0)
- PASSOU: BLE perdidos: linhas=0 eventos=0 pedaços=0
- PASSOU: erros de I2C desde que ligou: ToF E=0 F=0 D=0 IMU=0 INA=0
- PASSOU: ToF: quedas 0/0/0, reinícios 0/0/0, reinícios falhos 0/0/0 (E/F/D)

## A1 (tentativa 2) — PASSOU — 09:45:14

ToF sem nada por perto. Comando(s): tof.

- PASSOU: 5 de 5 linhas do tof
- PASSOU: nenhum sensor em falha (-1)

## A2 (tentativa 2) — PASSOU — 09:45:18

Uma célula para a frente, no ar. Comando(s): andar.

- PASSOU: 1 de 1 retas 'andar 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=505 D=506 (esperado 511 ± 15)
- PASSOU: reta 1: giro=0.0 graus (limite 3.0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: 1 de 1 manobra(s) terminaram ok

## A3 (tentativa 2) — PASSOU — 09:45:22

Uma célula de ré, no ar. Comando(s): re.

- PASSOU: 1 de 1 retas 're de 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=-507 D=-508 (esperado -511 ± 15)
- PASSOU: reta 1: giro=0.0 graus (limite 3.0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: 1 de 1 manobra(s) terminaram ok

## A5 (tentativa 2) — PASSOU (falta a resposta do operador) — 09:45:25

Largada sem paredes (tem de recusar). Comando(s): largar.

- PASSOU: largada recusada
- PASSOU: 0 passos

Respostas do operador ao A5 (tentativa 2), 09:46:39:

- PASSOU: operador: As rodas ficaram PARADAS? -> s
- veredito final: PASSOU

## H5 (tentativa 2) — FALHOU — 09:47:06

Encoders, girando as rodas à mão. Comando(s): enc 25.

- FALHOU: roda esquerda: 0 pulsos (uma volta para a frente = +285, aceito 225 a 345)
- FALHOU: roda direita: 0 pulsos (aceito 225 a 345)

- nota sobre o H5 (09:49:05): 20/11: 1a tentativa --auto deu 0/0 pulsos por falta de sincronia (a janela de 25 s abriu antes de o operador poder girar). Refeito com 'enc 60' (janela de 60 s): E=297 D=296 pulsos em uma volta cada, sentido certo, dentro de 225 a 345: PASSOU.

## A4 (tentativa 2) — PASSOU — 09:49:38

Curva com o robô travado (tem de detectar que não girou). Comando(s): virar d.

- PASSOU: 'curva travada' apareceu 2 vezes
- PASSOU: fez a tentativa 2 do arco
- PASSOU: desfez o arco antes da tentativa 2

## O2 (tentativa 3) — FALHOU (falta a resposta do operador) — 09:52:10

Toque curto larga ao soltar e não alterna. Comando(s): .

- FALHOU: o teste não chegou ao fim (sem resposta do robô, ou interrompido)
- FALHOU: a largada não veio: apertou e soltou rápido (menos de 1 s)?
- PASSOU: nenhum toque longo foi contado
- FALHOU: largada recusada (sem paredes): rodas paradas

- nota sobre o O2 (09:52:40): 20/11 1a tentativa: FALHOU so por sincronia. O aperto do operador chegou depois de a janela de 60 s fechar; o log do robo mostra 'botao de largada acionado' e 'largada recusada: sem parede a esquerda' (comportamento correto). Refeito com a janela aberta em segundo plano.

## O2 (tentativa 4) — FALHOU (falta a resposta do operador) — 09:53:09

Toque curto larga ao soltar e não alterna. Comando(s): .

- PASSOU: o toque curto largou ao soltar
- FALHOU: contou toque longo: soltou rápido o bastante?
- PASSOU: largada recusada (sem paredes): rodas paradas

Respostas do operador ao O2 (tentativa 4), 09:53:40:

- PASSOU: operador: As rodas ficaram PARADAS? -> s
- veredito final: FALHOU

- nota sobre o O2 (09:53:40): 20/11 2a tentativa: 1o aperto durou mais de 1 s (toque longo aos 14 s de uptime), 2o foi curto aos 25 s: o robo agiu certo nos dois (alternou para 4x4 EM PE e depois largou, recusado, com 'labirinto diferente do DIP (4x4): 4x4 (toque longo), relatado como o deitado, mapa girado' = evidencia do O3). Teste falhou so pelo toque longo do operador.

## O2 (tentativa 5) — PASSOU (falta a resposta do operador) — 09:54:05

Toque curto larga ao soltar e não alterna. Comando(s): .

- PASSOU: o toque curto largou ao soltar
- PASSOU: nenhum toque longo foi contado
- PASSOU: largada recusada (sem paredes): rodas paradas

Respostas do operador ao O2 (tentativa 5), 09:54:49:

- PASSOU: operador: As rodas ficaram PARADAS? -> s
- veredito final: PASSOU

## O3 (tentativa 2) — PASSOU (falta a resposta do operador) — 09:55:01

4x4 girado pelo toque longo: o relato ao painel gira 90 graus. Comando(s): largar.

- PASSOU: relato girado
- PASSOU: largada relatada x=3 y=3 rumo O (esperado x=3 y=3 rumo O)
- PASSOU: largada recusada (sem paredes): rodas paradas

- nota sobre o O3 (09:55:36): 20/11: relato girado e largada x=3 y=3 rumo O confirmados no log; operador confirmou rodas paradas; painel NAO verificado (sem resposta).

## E10a (tentativa 1) — FALHOU — 09:58:54

Rampa de tensão LIGADA (rampa_tensao=50): 10 partidas sem BROWNOUT. Comando(s): andar, calib rampa_tensao=50, re.

- FALHOU: o teste não chegou ao fim (sem resposta do robô, ou interrompido)
- FALHOU: O ROBÔ REINICIOU SOZINHO durante o teste (boot 573acc -> 4f4a13): queda de tensão ou travamento. Rode 'python t.py H1' e veja o 'reset='
- FALHOU: 0 de 5 retas 'andar 1 celula' no log
- FALHOU: manobra falhou: []
- PASSOU: sem BROWNOUT nem reinício de energia
- FALHOU: 0 de 5 retas 're de 1 celula' no log

## E10a (tentativa 2) — PASSOU — 10:00:37

Rampa de tensão LIGADA (rampa_tensao=50): 10 partidas sem BROWNOUT. Comando(s): andar, calib rampa_tensao=50, re.

- PASSOU: 5 de 5 retas 'andar 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=506 D=509 (esperado 511 ± 25)
- PASSOU: reta 1: giro=-0.8 graus (limite 3.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=509 D=509 (esperado 511 ± 25)
- PASSOU: reta 2: giro=-0.4 graus (limite 3.0)
- PASSOU: reta 3: terminou ok
- PASSOU: reta 3: pulsos E=510 D=511 (esperado 511 ± 25)
- PASSOU: reta 3: giro=-0.4 graus (limite 3.0)
- PASSOU: reta 4: terminou ok
- PASSOU: reta 4: pulsos E=509 D=512 (esperado 511 ± 25)
- PASSOU: reta 4: giro=1.0 graus (limite 3.0)
- PASSOU: reta 5: terminou ok
- PASSOU: reta 5: pulsos E=500 D=502 (esperado 511 ± 25)
- PASSOU: reta 5: giro=-0.6 graus (limite 3.0)
- PASSOU: laço da reta: média 3.1 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.6 ms (limite 4,0)
- PASSOU: laço da reta: média 2.8 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: 10 de 10 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia
- PASSOU: 5 de 5 retas 're de 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=-499 D=-500 (esperado -511 ± 25)
- PASSOU: reta 1: giro=0.8 graus (limite 3.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=-507 D=-507 (esperado -511 ± 25)
- PASSOU: reta 2: giro=-0.6 graus (limite 3.0)
- PASSOU: reta 3: terminou ok
- PASSOU: reta 3: pulsos E=-506 D=-506 (esperado -511 ± 25)
- PASSOU: reta 3: giro=-2.6 graus (limite 3.0)
- PASSOU: reta 4: terminou ok
- PASSOU: reta 4: pulsos E=-507 D=-507 (esperado -511 ± 25)
- PASSOU: reta 4: giro=0.9 graus (limite 3.0)
- PASSOU: reta 5: terminou ok
- PASSOU: reta 5: pulsos E=-506 D=-506 (esperado -511 ± 25)
- PASSOU: reta 5: giro=0.2 graus (limite 3.0)
- PASSOU: laço da reta: média 3.1 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.6 ms (limite 4,0)
- PASSOU: laço da reta: média 2.8 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)

## E10b (tentativa 1) — PASSOU — 10:01:49

Rampa de tensão DESLIGADA (rampa_tensao=0), para comparar com o E10a. Comando(s): andar, calib rampa_tensao=0, re.

- PASSOU: 5 de 5 retas 'andar 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=506 D=507 (esperado 511 ± 25)
- PASSOU: reta 1: giro=0.1 graus (limite 3.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=504 D=509 (esperado 511 ± 25)
- PASSOU: reta 2: giro=0.6 graus (limite 3.0)
- PASSOU: reta 3: terminou ok
- PASSOU: reta 3: pulsos E=501 D=507 (esperado 511 ± 25)
- PASSOU: reta 3: giro=-0.2 graus (limite 3.0)
- PASSOU: reta 4: terminou ok
- PASSOU: reta 4: pulsos E=510 D=514 (esperado 511 ± 25)
- PASSOU: reta 4: giro=0.3 graus (limite 3.0)
- PASSOU: reta 5: terminou ok
- PASSOU: reta 5: pulsos E=502 D=507 (esperado 511 ± 25)
- PASSOU: reta 5: giro=1.0 graus (limite 3.0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.8 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: 10 de 10 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia
- PASSOU: 5 de 5 retas 're de 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=-502 D=-501 (esperado -511 ± 25)
- PASSOU: reta 1: giro=-1.6 graus (limite 3.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=-505 D=-505 (esperado -511 ± 25)
- PASSOU: reta 2: giro=-1.5 graus (limite 3.0)
- PASSOU: reta 3: terminou ok
- PASSOU: reta 3: pulsos E=-508 D=-508 (esperado -511 ± 25)
- PASSOU: reta 3: giro=-0.2 graus (limite 3.0)
- PASSOU: reta 4: terminou ok
- PASSOU: reta 4: pulsos E=-507 D=-507 (esperado -511 ± 25)
- PASSOU: reta 4: giro=-1.2 graus (limite 3.0)
- PASSOU: reta 5: terminou ok
- PASSOU: reta 5: pulsos E=-507 D=-507 (esperado -511 ± 25)
- PASSOU: reta 5: giro=-1.0 graus (limite 3.0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.8 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)

## E10a (tentativa 3) — PASSOU — 10:02:43

Rampa de tensão LIGADA (rampa_tensao=50): 10 partidas sem BROWNOUT. Comando(s): andar, calib rampa_tensao=50, re.

- PASSOU: 5 de 5 retas 'andar 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=499 D=503 (esperado 511 ± 25)
- PASSOU: reta 1: giro=1.5 graus (limite 3.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=509 D=512 (esperado 511 ± 25)
- PASSOU: reta 2: giro=1.4 graus (limite 3.0)
- PASSOU: reta 3: terminou ok
- PASSOU: reta 3: pulsos E=509 D=511 (esperado 511 ± 25)
- PASSOU: reta 3: giro=0.5 graus (limite 3.0)
- PASSOU: reta 4: terminou ok
- PASSOU: reta 4: pulsos E=505 D=509 (esperado 511 ± 25)
- PASSOU: reta 4: giro=-0.0 graus (limite 3.0)
- PASSOU: reta 5: terminou ok
- PASSOU: reta 5: pulsos E=505 D=508 (esperado 511 ± 25)
- PASSOU: reta 5: giro=-0.7 graus (limite 3.0)
- PASSOU: laço da reta: média 3.1 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.6 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: 10 de 10 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia
- PASSOU: 5 de 5 retas 're de 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=-512 D=-512 (esperado -511 ± 25)
- PASSOU: reta 1: giro=-0.5 graus (limite 3.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=-502 D=-502 (esperado -511 ± 25)
- PASSOU: reta 2: giro=-0.5 graus (limite 3.0)
- PASSOU: reta 3: terminou ok
- PASSOU: reta 3: pulsos E=-500 D=-501 (esperado -511 ± 25)
- PASSOU: reta 3: giro=-0.2 graus (limite 3.0)
- PASSOU: reta 4: terminou ok
- PASSOU: reta 4: pulsos E=-506 D=-506 (esperado -511 ± 25)
- PASSOU: reta 4: giro=0.8 graus (limite 3.0)
- PASSOU: reta 5: terminou ok
- PASSOU: reta 5: pulsos E=-509 D=-509 (esperado -511 ± 25)
- PASSOU: reta 5: giro=1.3 graus (limite 3.0)
- PASSOU: laço da reta: média 3.1 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.6 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)

## E10b (tentativa 2) — PASSOU — 10:03:31

Rampa de tensão DESLIGADA (rampa_tensao=0), para comparar com o E10a. Comando(s): andar, calib rampa_tensao=0, re.

- PASSOU: 5 de 5 retas 'andar 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=505 D=510 (esperado 511 ± 25)
- PASSOU: reta 1: giro=1.2 graus (limite 3.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=506 D=509 (esperado 511 ± 25)
- PASSOU: reta 2: giro=0.5 graus (limite 3.0)
- PASSOU: reta 3: terminou ok
- PASSOU: reta 3: pulsos E=507 D=513 (esperado 511 ± 25)
- PASSOU: reta 3: giro=0.1 graus (limite 3.0)
- PASSOU: reta 4: terminou ok
- PASSOU: reta 4: pulsos E=509 D=513 (esperado 511 ± 25)
- PASSOU: reta 4: giro=0.7 graus (limite 3.0)
- PASSOU: reta 5: terminou ok
- PASSOU: reta 5: pulsos E=505 D=509 (esperado 511 ± 25)
- PASSOU: reta 5: giro=0.1 graus (limite 3.0)
- PASSOU: laço da reta: média 2.6 ms (limite 4,0)
- PASSOU: laço da reta: média 2.4 ms (limite 4,0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.8 ms (limite 4,0)
- PASSOU: laço da reta: média 2.4 ms (limite 4,0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: 10 de 10 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia
- PASSOU: 5 de 5 retas 're de 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=-510 D=-510 (esperado -511 ± 25)
- PASSOU: reta 1: giro=-0.4 graus (limite 3.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=-511 D=-511 (esperado -511 ± 25)
- PASSOU: reta 2: giro=-0.3 graus (limite 3.0)
- PASSOU: reta 3: terminou ok
- PASSOU: reta 3: pulsos E=-507 D=-507 (esperado -511 ± 25)
- PASSOU: reta 3: giro=-0.8 graus (limite 3.0)
- PASSOU: reta 4: terminou ok
- PASSOU: reta 4: pulsos E=-509 D=-509 (esperado -511 ± 25)
- PASSOU: reta 4: giro=-0.5 graus (limite 3.0)
- PASSOU: reta 5: terminou ok
- PASSOU: reta 5: pulsos E=-511 D=-510 (esperado -511 ± 25)
- PASSOU: reta 5: giro=-0.7 graus (limite 3.0)
- PASSOU: laço da reta: média 2.6 ms (limite 4,0)
- PASSOU: laço da reta: média 2.4 ms (limite 4,0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.8 ms (limite 4,0)
- PASSOU: laço da reta: média 2.4 ms (limite 4,0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)

## E10a (tentativa 4) — PASSOU — 10:04:20

Rampa de tensão LIGADA (rampa_tensao=50): 10 partidas sem BROWNOUT. Comando(s): andar, calib rampa_tensao=50, re.

- PASSOU: 5 de 5 retas 'andar 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=501 D=505 (esperado 511 ± 25)
- PASSOU: reta 1: giro=-0.3 graus (limite 3.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=502 D=506 (esperado 511 ± 25)
- PASSOU: reta 2: giro=-0.4 graus (limite 3.0)
- PASSOU: reta 3: terminou ok
- PASSOU: reta 3: pulsos E=506 D=511 (esperado 511 ± 25)
- PASSOU: reta 3: giro=0.5 graus (limite 3.0)
- PASSOU: reta 4: terminou ok
- PASSOU: reta 4: pulsos E=509 D=513 (esperado 511 ± 25)
- PASSOU: reta 4: giro=0.6 graus (limite 3.0)
- PASSOU: reta 5: terminou ok
- PASSOU: reta 5: pulsos E=508 D=513 (esperado 511 ± 25)
- PASSOU: reta 5: giro=0.6 graus (limite 3.0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: 10 de 10 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia
- PASSOU: 5 de 5 retas 're de 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=-511 D=-509 (esperado -511 ± 25)
- PASSOU: reta 1: giro=0.4 graus (limite 3.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=-500 D=-499 (esperado -511 ± 25)
- PASSOU: reta 2: giro=0.4 graus (limite 3.0)
- PASSOU: reta 3: terminou ok
- PASSOU: reta 3: pulsos E=-513 D=-511 (esperado -511 ± 25)
- PASSOU: reta 3: giro=-0.3 graus (limite 3.0)
- PASSOU: reta 4: terminou ok
- PASSOU: reta 4: pulsos E=-510 D=-509 (esperado -511 ± 25)
- PASSOU: reta 4: giro=-2.6 graus (limite 3.0)
- PASSOU: reta 5: terminou ok
- PASSOU: reta 5: pulsos E=-505 D=-505 (esperado -511 ± 25)
- PASSOU: reta 5: giro=-0.7 graus (limite 3.0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)

## E10b (tentativa 3) — PASSOU — 10:05:09

Rampa de tensão DESLIGADA (rampa_tensao=0), para comparar com o E10a. Comando(s): andar, calib rampa_tensao=0, re.

- PASSOU: 5 de 5 retas 'andar 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=506 D=513 (esperado 511 ± 25)
- PASSOU: reta 1: giro=-0.0 graus (limite 3.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=503 D=508 (esperado 511 ± 25)
- PASSOU: reta 2: giro=0.5 graus (limite 3.0)
- PASSOU: reta 3: terminou ok
- PASSOU: reta 3: pulsos E=507 D=511 (esperado 511 ± 25)
- PASSOU: reta 3: giro=1.0 graus (limite 3.0)
- PASSOU: reta 4: terminou ok
- PASSOU: reta 4: pulsos E=500 D=505 (esperado 511 ± 25)
- PASSOU: reta 4: giro=1.4 graus (limite 3.0)
- PASSOU: reta 5: terminou ok
- PASSOU: reta 5: pulsos E=507 D=511 (esperado 511 ± 25)
- PASSOU: reta 5: giro=0.2 graus (limite 3.0)
- PASSOU: laço da reta: média 2.8 ms (limite 4,0)
- PASSOU: laço da reta: média 2.4 ms (limite 4,0)
- PASSOU: laço da reta: média 2.8 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.8 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: 10 de 10 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia
- PASSOU: 5 de 5 retas 're de 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=-504 D=-505 (esperado -511 ± 25)
- PASSOU: reta 1: giro=0.7 graus (limite 3.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=-505 D=-505 (esperado -511 ± 25)
- PASSOU: reta 2: giro=-0.3 graus (limite 3.0)
- PASSOU: reta 3: terminou ok
- PASSOU: reta 3: pulsos E=-505 D=-505 (esperado -511 ± 25)
- PASSOU: reta 3: giro=0.0 graus (limite 3.0)
- PASSOU: reta 4: terminou ok
- PASSOU: reta 4: pulsos E=-509 D=-509 (esperado -511 ± 25)
- PASSOU: reta 4: giro=0.2 graus (limite 3.0)
- PASSOU: reta 5: terminou ok
- PASSOU: reta 5: pulsos E=-507 D=-506 (esperado -511 ± 25)
- PASSOU: reta 5: giro=-0.2 graus (limite 3.0)
- PASSOU: laço da reta: média 2.8 ms (limite 4,0)
- PASSOU: laço da reta: média 2.4 ms (limite 4,0)
- PASSOU: laço da reta: média 2.8 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.8 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)

## E10a (tentativa 5) — PASSOU — 10:05:58

Rampa de tensão LIGADA (rampa_tensao=50): 10 partidas sem BROWNOUT. Comando(s): andar, calib rampa_tensao=50, re.

- PASSOU: 5 de 5 retas 'andar 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=506 D=510 (esperado 511 ± 25)
- PASSOU: reta 1: giro=1.2 graus (limite 3.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=504 D=508 (esperado 511 ± 25)
- PASSOU: reta 2: giro=0.9 graus (limite 3.0)
- PASSOU: reta 3: terminou ok
- PASSOU: reta 3: pulsos E=504 D=508 (esperado 511 ± 25)
- PASSOU: reta 3: giro=0.8 graus (limite 3.0)
- PASSOU: reta 4: terminou ok
- PASSOU: reta 4: pulsos E=498 D=502 (esperado 511 ± 25)
- PASSOU: reta 4: giro=0.3 graus (limite 3.0)
- PASSOU: reta 5: terminou ok
- PASSOU: reta 5: pulsos E=511 D=513 (esperado 511 ± 25)
- PASSOU: reta 5: giro=0.2 graus (limite 3.0)
- PASSOU: laço da reta: média 2.9 ms (limite 4,0)
- PASSOU: laço da reta: média 2.6 ms (limite 4,0)
- PASSOU: laço da reta: média 3.1 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: 10 de 10 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia
- PASSOU: 5 de 5 retas 're de 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=-502 D=-502 (esperado -511 ± 25)
- PASSOU: reta 1: giro=-1.0 graus (limite 3.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=-513 D=-512 (esperado -511 ± 25)
- PASSOU: reta 2: giro=-0.3 graus (limite 3.0)
- PASSOU: reta 3: terminou ok
- PASSOU: reta 3: pulsos E=-501 D=-501 (esperado -511 ± 25)
- PASSOU: reta 3: giro=-0.5 graus (limite 3.0)
- PASSOU: reta 4: terminou ok
- PASSOU: reta 4: pulsos E=-503 D=-502 (esperado -511 ± 25)
- PASSOU: reta 4: giro=0.0 graus (limite 3.0)
- PASSOU: reta 5: terminou ok
- PASSOU: reta 5: pulsos E=-502 D=-502 (esperado -511 ± 25)
- PASSOU: reta 5: giro=-0.6 graus (limite 3.0)
- PASSOU: laço da reta: média 2.9 ms (limite 4,0)
- PASSOU: laço da reta: média 2.6 ms (limite 4,0)
- PASSOU: laço da reta: média 3.1 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)

## E10b (tentativa 4) — FALHOU — 10:06:40

Rampa de tensão DESLIGADA (rampa_tensao=0), para comparar com o E10a. Comando(s): andar, calib rampa_tensao=0, re.

- FALHOU: o teste não chegou ao fim (sem resposta do robô, ou interrompido)
- FALHOU: a ponte perdeu a conexão com o robô durante o teste
- FALHOU: 3 de 5 retas 'andar 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=504 D=509 (esperado 511 ± 25)
- PASSOU: reta 1: giro=1.0 graus (limite 3.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=504 D=507 (esperado 511 ± 25)
- PASSOU: reta 2: giro=0.7 graus (limite 3.0)
- PASSOU: reta 3: terminou ok
- PASSOU: reta 3: pulsos E=502 D=507 (esperado 511 ± 25)
- PASSOU: reta 3: giro=-0.2 graus (limite 3.0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.8 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.8 ms (limite 4,0)
- FALHOU: manobra falhou: []
- PASSOU: sem BROWNOUT nem reinício de energia
- FALHOU: 2 de 5 retas 're de 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=-511 D=-512 (esperado -511 ± 25)
- PASSOU: reta 1: giro=-0.5 graus (limite 3.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=-511 D=-511 (esperado -511 ± 25)
- PASSOU: reta 2: giro=0.3 graus (limite 3.0)
- PASSOU: laço da reta: média 2.7 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.8 ms (limite 4,0)
- PASSOU: laço da reta: média 2.3 ms (limite 4,0)
- PASSOU: laço da reta: média 2.8 ms (limite 4,0)

- calibração (20/11 10:06:45): gravado no robô: rampa_tensao=50


## Bloco 1 (robô apoiado) — 20/11 — PASSOU
E0 (23 chaves, freios 2,6/8,1/2,6), H1, H2, H5 (E=297 D=296, refeito com janela longa: a 1a tentativa deu 0/0 por falta de sincronia), H6 (rodas a 6 V, dif 4%), H7 (bateria min 8,26 V, SEM BROWNOUT), H8, A1, A2 (505/506), A3 (-507/-508), A4 (curva travada x2, desfez, tentativa 2), A5, O2 (apos 2 tentativas: o 1o aperto passou de 1 s), O3 (painel NAO verificado: o painel exige a ponte oficial + docker). 
- Achado de energia: 09:37:16 o robo perdeu a energia por inteiro ao ser manuseado para ir ao suporte (voltou so as 09:43); a hipotese de travamento do firmware foi descartada (reset=LIGOU poweron).
- ToF direito: minimo de 5 mm no H2 (suporte vazio), e D=9/10 mm no corredor com E=39/40: ou o robo esta encostado a direita, ou o D le curto.

## E10 — rampa de tensão (rampa_tensao=50) contra desligada — corredor MDF
- E10a (rampa LIGADA): 1a tentativa FALHOU (queda de energia na 1a partida, reset=LIGOU poweron, boot 573acc -> 4f4a13); depois 4 rodadas PASSARAM (5 pares reta+ré cada, retas 500-512 pulsos, giro <= 1 grau, laço ~3 ms, 2,1 a 2,3 s por celula).
- E10b (rampa DESLIGADA): 3 rodadas PASSARAM e a 4a foi interrompida por nova queda de energia (poweron) apos 5 manobras.
- Conclusao: ~1 queda de energia (poweron) a cada 35-40 partidas COM OU SEM rampa: a rampa nao distingue; a causa parece ser o contato da bateria (equipe de energia). A rampa fica ligada (50 V/s) por nao ter custo (+0,2 s por celula no perfil suave, mesma precisao).
## E4 (tentativa 1) — FALHOU (falta a resposta do operador) — 10:10:57

Velocidade e frenagem suave: 3 retas de 1 célula (sem balançar ao parar). Comando(s): andar.

- FALHOU: o teste não chegou ao fim (sem resposta do robô, ou interrompido)
- FALHOU: O ROBÔ REINICIOU SOZINHO durante o teste (boot ab2d9a -> cd8666): queda de tensão ou travamento. Rode 'python t.py H1' e veja o 'reset='
- FALHOU: 0 de 3 retas 'andar 1 celula' no log
- FALHOU: 0 de 3 retas 'andar 1 celula' com tempo no log
- FALHOU: manobra falhou: []

## E4 (tentativa 2) — FALHOU (falta a resposta do operador) — 10:11:36

Velocidade e frenagem suave: 3 retas de 1 célula (sem balançar ao parar). Comando(s): andar.

- FALHOU: o teste não chegou ao fim (sem resposta do robô, ou interrompido)
- FALHOU: a ponte perdeu a conexão com o robô durante o teste
- FALHOU: 0 de 3 retas 'andar 1 celula' no log
- FALHOU: 0 de 3 retas 'andar 1 celula' com tempo no log
- FALHOU: manobra falhou: []

- calibração (20/11 10:12:34): gravado no robô: rampa_tensao=50

- calibração (20/11 10:17:05): gravado no robô: rampa_tensao=15

- calibração (20/11 10:21:09): gravado no robô: rampa_tensao=0

- calibração (20/11 10:25:02): gravado no robô: rampa_tensao=50

- calibração (20/11 10:28:57): gravado no robô: rampa_tensao=50

- calibração (20/11 10:34:26): gravado no robô: rampa_tensao=15

- calibração (20/11 10:37:41): gravado no robô: rampa_tensao=0

- calibração (20/11 10:37:53): gravado no robô: rampa_tensao=50


## Quedas de energia na partida dos motores — 20/11 (achado para a equipe de energia)
- Padrão: a PRIMEIRA partida dos motores depois de um boot por energia (balancim, ou o boot que segue uma queda) derrubou a energia por inteiro (reset=LIGOU poweron, não BROWNOUT, não PANICO) em 3 de 4 vezes: E10a (1a), E4 (1a e 2a). Passou 1 vez (E10a 2a). Mais 1 queda no meio do E10b (rampa 0), ~35 partidas depois do boot.
- Ciclos controlados (reinicio por SOFTWARE + reta + ré, rampa 50): 5 de 5 OK, zero quedas (reset depois = "reinicio por comando (sw)"). Ou seja: o boot por software NÃO reproduz; o boot por energia sim.
- Rampa de tensão: com 50 V/s não mudou as quedas (1 queda com rampa ligada, 1 com desligada nos E10). Com 15 V/s a reta NÃO chega ao fim da célula (479 e 462 pulsos de 511, satura em 7,5 V): lento demais. Fica 50.
- Hipótese (hardware, para a equipe de energia): a primeira corrente de arranque depois da ligação por balancim colapsa a alimentação (contato do balancim/conector da bateria, ou capacitor de entrada). Procedimento de contorno hoje: depois de ligar, fazer uma partida curta de "escorva" e aceitar a queda, antes dos testes.
- Observação: o ToF direito lê 8 a 10 mm no início do corredor e o robô deriva para a direita ao longo de ~20 manobras (D chega a 0 perto): a centralização (centralizar=1) não segura a deriva.
## E4 (tentativa 3) — PASSOU (falta a resposta do operador) — 10:42:46

Velocidade e frenagem suave: 3 retas de 1 célula (sem balançar ao parar). Comando(s): andar.

- PASSOU: 3 de 3 retas 'andar 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=503 D=503 (esperado 511 ± 20)
- PASSOU: reta 1: giro=0.3 graus (limite 3.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=512 D=516 (esperado 511 ± 20)
- PASSOU: reta 2: giro=1.0 graus (limite 3.0)
- PASSOU: reta 3: terminou ok
- PASSOU: reta 3: pulsos E=506 D=508 (esperado 511 ± 20)
- PASSOU: reta 3: giro=1.5 graus (limite 3.0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.9 ms (limite 4,0)
- PASSOU: 3 de 3 retas 'andar 1 celula' com tempo no log
- PASSOU: reta 1: 2334 ms (esperado 1800 a 2900)
- PASSOU: reta 2: 2099 ms (esperado 1800 a 2900)
- PASSOU: reta 3: 2336 ms (esperado 1800 a 2900)
- PASSOU: 3 de 3 manobra(s) terminaram ok

Respostas do operador ao E4 (tentativa 3), 10:43:30:

- FALHOU: operador: Ao frear, o robô parou SEM o balanço (tranco para frente e para trás) que acontecia antes? -> n
- PASSOU: operador: Quanto balançou ao parar? 0 = nada, 1 = pouco, 2 = como antes, 3 = pior -> 1.0
- veredito final: FALHOU

- nota sobre o E4 (10:43:30): 20/11: freio suave (120 mm/s, 225 mm/s2): 3 retas ok, 2,1 a 2,3 s por celula. Operador: AINDA balanca ao parar, nota 1 (pouco; antes era nota 2 'como antes'). Proximo ajuste possivel: aceleracao menor (150 mm/s2) so na frenagem, ou perfil em S (jerk limitado).

## B1M (tentativa 1) — FALHOU (falta a resposta do operador) — 10:45:20

Retas e rés no corredor de MDF do labirinto (3 retas, 3 rés, 3 retas; 2 vezes). Comando(s): andar, re.

- PASSOU: 6 de 6 retas 'andar 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=506 D=509 (esperado 511 ± 15)
- PASSOU: reta 1: giro=-0.2 graus (limite 2.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=499 D=503 (esperado 511 ± 15)
- FALHOU: reta 2: giro=2.0 graus (limite 2.0)
- PASSOU: reta 3: terminou ok
- PASSOU: reta 3: pulsos E=510 D=513 (esperado 511 ± 15)
- PASSOU: reta 3: giro=1.7 graus (limite 2.0)
- PASSOU: reta 4: terminou ok
- PASSOU: reta 4: pulsos E=502 D=505 (esperado 511 ± 15)
- PASSOU: reta 4: giro=0.6 graus (limite 2.0)
- PASSOU: reta 5: terminou ok
- PASSOU: reta 5: pulsos E=502 D=502 (esperado 511 ± 15)
- PASSOU: reta 5: giro=0.7 graus (limite 2.0)
- PASSOU: reta 6: terminou ok
- FALHOU: reta 6: pulsos E=535 D=531 (esperado 511 ± 15)
- PASSOU: reta 6: giro=0.1 graus (limite 2.0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.8 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: 3 de 3 retas 're de 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=-507 D=-507 (esperado -511 ± 15)
- PASSOU: reta 1: giro=0.0 graus (limite 2.0)
- PASSOU: reta 2: terminou ok
- PASSOU: reta 2: pulsos E=-509 D=-508 (esperado -511 ± 15)
- FALHOU: reta 2: giro=-2.2 graus (limite 2.0)
- PASSOU: reta 3: terminou ok
- PASSOU: reta 3: pulsos E=-511 D=-510 (esperado -511 ± 15)
- PASSOU: reta 3: giro=-0.7 graus (limite 2.0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 2.5 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.8 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: 6 de 6 retas 'andar 1 celula' com tempo no log
- PASSOU: reta 1: 2217 ms (esperado 1800 a 2900)
- PASSOU: reta 2: 2335 ms (esperado 1800 a 2900)
- PASSOU: reta 3: 2141 ms (esperado 1800 a 2900)
- PASSOU: reta 4: 2335 ms (esperado 1800 a 2900)
- PASSOU: reta 5: 2336 ms (esperado 1800 a 2900)
- PASSOU: reta 6: 2069 ms (esperado 1800 a 2900)
- PASSOU: 9 de 9 manobra(s) terminaram ok

## B1M (tentativa 2) — FALHOU (falta a resposta do operador) — 10:46:26

Retas e rés no corredor de MDF do labirinto (3 retas, 3 rés, 3 retas; 2 vezes). Comando(s): andar, re.

- FALHOU: o teste não chegou ao fim (sem resposta do robô, ou interrompido)
- FALHOU: a ponte perdeu a conexão com o robô durante o teste
- FALHOU: 3 de 6 retas 'andar 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=510 D=506 (esperado 511 ± 15)
- PASSOU: reta 1: giro=0.1 graus (limite 2.0)
- FALHOU: reta 2: NÃO terminou ok: at E=5 D=58 rumo perdido: desviou 10 graus na reta (parede?)
- FALHOU: reta 2: pulsos E=107 D=101 (esperado 511 ± 15)
- FALHOU: reta 2: giro=10.1 graus (limite 2.0)
- FALHOU: reta 3: NÃO terminou ok: t E=15 D=70 rumo perdido: desviou 10 graus na reta (parede?)
- FALHOU: reta 3: pulsos E=109 D=104 (esperado 511 ± 15)
- FALHOU: reta 3: giro=10.1 graus (limite 2.0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.6 ms (limite 4,0)
- PASSOU: laço da reta: média 2.4 ms (limite 4,0)
- PASSOU: laço da reta: média 2.4 ms (limite 4,0)
- PASSOU: 3 de 3 retas 're de 1 celula' no log
- PASSOU: reta 1: terminou ok
- PASSOU: reta 1: pulsos E=-505 D=-505 (esperado -511 ± 15)
- PASSOU: reta 1: giro=-0.5 graus (limite 2.0)
- FALHOU: reta 2: NÃO terminou ok: =146 D=148 rumo perdido: desviou -10 graus na reta (parede?)
- FALHOU: reta 2: pulsos E=-117 D=-123 (esperado -511 ± 15)
- FALHOU: reta 2: giro=-10.1 graus (limite 2.0)
- FALHOU: reta 3: NÃO terminou ok: =150 D=119 rumo perdido: desviou -10 graus na reta (parede?)
- FALHOU: reta 3: pulsos E=-150 D=-147 (esperado -511 ± 15)
- FALHOU: reta 3: giro=-10.0 graus (limite 2.0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 3.0 ms (limite 4,0)
- PASSOU: laço da reta: média 2.6 ms (limite 4,0)
- PASSOU: laço da reta: média 2.4 ms (limite 4,0)
- PASSOU: laço da reta: média 2.4 ms (limite 4,0)
- FALHOU: 3 de 6 retas 'andar 1 celula' com tempo no log
- PASSOU: reta 1: 2245 ms (esperado 1800 a 2900)
- CONFERIR: reta 2: 573 ms (esperado 1800 a 2900)
- CONFERIR: reta 3: 576 ms (esperado 1800 a 2900)
- FALHOU: manobra falhou: ['teste: manobra andar 1 celula: rumo perdido: desviou 10 graus na reta (parede?)', 'teste: manobra andar 1 celula: rumo perdido: desviou 10 graus na reta (parede?)']


## B1M (MDF) — 20/11 — FALHOU; achado: o corredor de MDF mede ~150 mm, não 168
- Rodada 1: giro 2,0 / -2,2 graus (limite 2,0) e uma reta com 535/531 pulsos (empurrou a parede do fundo); a 3a ré terminou com 'rumo perdido: desviou 10 graus'. Rodada 2: queda de energia na partida e novo 'rumo perdido' (robô provavelmente raspando).
- Medida pelos ToF (E + D + 101 mm entre as faces dos sensores): 150, 147, 153, 149, 153 mm em cinco leituras. O regulamento é 168 mm; a folga por lado do robô (108 mm) cai de 30 para ~20 mm.
- Consequência para o firmware: `centralizar=1` leva o ToF esquerdo a 33,5 mm (valor de 168 mm) quando só um lado lê; num corredor de 150 mm isso empurra o robô ~9 mm para a parede do outro lado (D=8-10 mm, depois 0). Explica a deriva para a direita e boa parte dos 'rumo perdido'.
- Proposta (aprovação): o alvo da centralização com UM lado deve vir da largura medida do corredor (soma dos dois ToF quando ambos leem), ou o corredor de teste ser alargado/medido com paquimetro e a chave `tof_lado_ao_centro`/largura ajustada. Os testes de 19/11 (B3 etc.) usaram o mesmo corredor.

## Gravação 2 — 11:03:23 — reta contínua (commit 1466e00)
Bateria fora (INA219 parado), hash verificado. Boot: 3 ToF prontos, calib5 limpa (padrão), reta_continua=1, rampa 50, freios 2,6/8,1/2,6. 382 testes no computador. Falta reaplicar ganho_rumo=0.6 e centralizar=1.
- calibração (20/11 11:05:18): gravado no robô: ganho_rumo=0.6 centralizar=1

## E0 (tentativa 2) — PASSOU — 11:05:20

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- PASSOU: 24 chaves do calib no log (esperado 24)
- PASSOU: eixo_ate_frente = 87.0 (esperado 87.0)
- PASSOU: largura_frente = 101.0 (esperado 101.0)
- PASSOU: eixo_ate_tof_frente = 85.0 (esperado 85.0)
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 50.5 (esperado 50.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.08 (esperado 1.08)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 8.1 (esperado 8.1)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- dado: ganho_rumo = 0.6 (valor de reta de 19/11: 0.6)
- dado: centralizar = 1.0 (valor de reta de 19/11: 1.0)

## E15 (tentativa 1) — PASSOU (falta a resposta do operador) — 11:06:28

Reta contínua: 3 células num movimento só (andar 3) e volta de ré. Comando(s): andar 3, re.

- PASSOU: trecho contínuo: 3 de 3 células
- PASSOU: pulsos E=1521 D=1526 (esperado 1533 ± 25)
- PASSOU: giro=-1.6 graus (limite 3)
- dado: tempo do trecho: 5336 ms (3 células paradas uma a uma: ~6,9 s)
- PASSOU: 4 de 4 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia

Respostas do operador ao E15 (tentativa 1), 11:07:35:

- FALHOU: operador: O robô andou as 3 células SEM parar no meio? -> n
- PASSOU: operador: Tranco ao parar no fim: 0 = nada, 1 = pouco, 2 = como antes, 3 = pior -> 1.0
- veredito final: FALHOU

- nota sobre o E15 (11:07:35): 20/11 (reta continua, 1a vez): trecho de 3 celulas ok (1521/1526 pulsos, 5336 ms contra perfil 5033 ms, ~6,9 s parando em cada). Operador: 'nao' ao 'andou sem parar no meio' (o tempo medido sugere que nao houve parada; ficou a duvida de hesitacao), tranco 1, e o robo NAO andou reto nem centralizado: pose lateral +25,8 mm a direita, correcao so 5,6 mm (termo da parede limitado a 16 pulsos), ToF D=-1 (perto) e E-so compara com 33,5 mm (corredor de 168; o de MDF mede ~150).


## E15 (reta contínua, 1a vez, 11:07) — FALHOU pelo critério do operador
Trecho de 3 células: 1521/1526 pulsos, 5336 ms (perfil 5033), sem queda de energia. Operador: tranco 1; "não" a "andou sem parar no meio" (o tempo medido sugere que não houve parada); e NÃO andou reto nem centralizado. Log: pose lateral +25,8 mm à direita, correção só 5,6 mm (termo da parede limitado a 16 pulsos), ToF D = -1 (perto) e o esquerdo comparado com 33,5 mm (corredor de 168; o de MDF mede ~150).
## Gravação 3 — 11:10:35 — largura do corredor e ganho do termo da parede (commit ba4e1e5)
Bateria fora. Boot: 3 ToF prontos, calib6 limpa, largura_corredor 168, ganho_parede 0,8, max_parede 16. Próximo: reaplicar ganho_rumo=0.6 centralizar=1 largura_corredor=150 ganho_parede=2.5 max_parede=60 e repetir o E15.
- calibração (20/11 11:12:03): gravado no robô: ganho_rumo=0.6 centralizar=1 largura_corredor=150 ganho_parede=2.5 max_parede=60

## E15 (tentativa 2) — PASSOU (falta a resposta do operador) — 11:13:10

Reta contínua: 3 células num movimento só (andar 3) e volta de ré. Comando(s): andar 3, re.

- PASSOU: trecho contínuo: 3 de 3 células
- PASSOU: pulsos E=1537 D=1553 (esperado 1533 ± 25)
- PASSOU: giro=2.1 graus (limite 3)
- dado: tempo do trecho: 4888 ms (3 células paradas uma a uma: ~6,9 s)
- PASSOU: 4 de 4 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia

Respostas do operador ao E15 (tentativa 2), 11:14:09:

- FALHOU: operador: O robô andou as 3 células SEM parar no meio? -> n
- PASSOU: operador: Tranco ao parar no fim: 0 = nada, 1 = pouco, 2 = como antes, 3 = pior -> 1.0
- veredito final: FALHOU

- calibração (20/11 11:14:11): gravado no robô: ganho_parede=2.5 max_parede=60 ganho_rumo=0.6

- calibração (20/11 11:17:25): gravado no robô: ganho_parede=5 max_parede=100 ganho_rumo=0.6


## Ajuste da centralização no corredor de ~150 mm (11:14) e gravação 4
- `andar 3` com ganho_parede=5, max_parede=100, largura_corredor=150: saindo de E=32/D=18 (7 mm à direita), terminou E=28 D=27, eixo a 0,4 mm do centro, rumo -0,2 graus, 1531/1528 pulsos, giro -0,1, 5035 ms. Operador: "A" (reto e centrado), mas "ainda não é um movimento contínuo e limpo".
- Com os ganhos antigos (ganho_parede 0,8 / max 16) o mesmo trecho terminou 21,6 mm à direita (E=46 D=7).
- Gravação 4 — 11:21:47 (commit 9efc0de): registro da velocidade da reta a cada 50 ms, conferência `check_clean_motion` no t.py (E15) e centralização também na ré. A calibração (calib6) ficou: centralizar 1, ganho_rumo 0.6, largura_corredor 150, ganho_parede 5, max_parede 100.
## E15 (tentativa 3) — CONFERIR (falta a resposta do operador) — 11:24:34

Reta contínua: 3 células num movimento só (andar 3) e volta de ré. Comando(s): andar 3, re.

- PASSOU: trecho contínuo: 3 de 3 células
- PASSOU: pulsos E=1530 D=1526 (esperado 1533 ± 25)
- PASSOU: giro=1.5 graus (limite 3)
- dado: tempo do trecho: 5335 ms (3 células paradas uma a uma: ~6,9 s)
- dado: velocidade a cada 50 ms (mm/s): 0 8 34 64 67 56 34 23 34 77 160 210 218 176 101 34 0 25 92 193 257 244 193 59 0 0 34 80 193 268 252 200 84 -16 -8 25 80 193 257 260 208 76 -8 0 8 92 184 273 265 200 84 -16 8 34 92 176 224 241 176 72
- CONFERIR: cruzeiro: mínimo 0 mm/s (esperado ~120, mínimo aceito 84)
- CONFERIR: cruzeiro: média 124 mm/s, desvio 88.1 (limite 12)
- CONFERIR: 22 amostra(s) de 50 ms abaixo de 60% do cruzeiro no meio do trecho
- PASSOU: 4 de 4 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia


## E15 com velocidade a cada 50 ms (11:24) — CONFERIR: movimento em ARRANCOS
Velocidade medida pelo controle: 0 8 34 64 67 56 34 23 34 77 160 210 218 176 101 34 0 25 92 193 257 244 193 59 0 0 34 ... : com referência 120 mm/s a roda vai de 0 a ~270 mm/s e volta a 0 a cada ~0,4 s (22 amostras de 50 ms abaixo de 72 mm/s no meio do trecho; desvio 88 mm/s; média 124). Causa: o termo da parede (RF-44) entrava na reta em degraus a cada leitura ruidosa do ToF e o ToF direito (7-13 mm do limite de alcance) alternava entre válido e "perto". Correção: filtro de 0,3 s/20 mm/s (commit 335d450). Era um defeito de 19/11 (o operador descrevia "anda um pouco, para").
## Gravação 5 — registro abaixo
- Gravação 5 — 11:30:04 (commit 335d450). Depois de ligar (boot d33897/018c9a, ligado há ~87 s) os ToF laterais E e D ficaram MUDOS (nem 0x30/0x32 nem 0x29), achado de energia (mesmo padrão da queda de alimentação); o tofrec os recuperou na 2a tentativa. Falha do assistente: a escorva (reta + ré) rodou com E e D fora do ar; passou ok, mas sem centralização. Regra: recuperar e conferir os 3 ToF ANTES de qualquer movimento.
## E15 (tentativa 4) — FALHOU (falta a resposta do operador) — 11:33:11

Reta contínua: 3 células num movimento só (andar 3) e volta de ré. Comando(s): andar 3, re.

- PASSOU: trecho contínuo: 3 de 3 células
- FALHOU: pulsos E=1552 D=1563 (esperado 1533 ± 25)
- PASSOU: giro=2.6 graus (limite 3)
- dado: tempo do trecho: 5063 ms (3 células paradas uma a uma: ~6,9 s)
- dado: velocidade a cada 50 ms (mm/s): 0 24 39 28 42 44 55 65 108 127 125 132 124 111 102 98 114 137 145 139 111 111 98 102 121 130 141 147 130 98 93 88 102 137 176 156 147 111 78 56 59 98 187 216 196 176 93 0 0 26 102 207 273 254 167 46 -19 0 11 88
- CONFERIR: cruzeiro: mínimo 0 mm/s (esperado ~120, mínimo aceito 84)
- CONFERIR: cruzeiro: média 125 mm/s, desvio 82.2 (limite 12)
- CONFERIR: 16 amostra(s) de 50 ms abaixo de 60% do cruzeiro no meio do trecho
- PASSOU: 4 de 4 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia


## Diagnóstico do E15 por tempo (11:35): ciclo limite do controle da roda
Registro de velocidade e tensão a cada 50 ms: a partir de ~1,7 s a tensão oscila de -2 a +5,5 V com período de ~0,45 s e a roda vai de 0 a 270 mm/s (e até -19), com a referência em 120. Simulação: a roda real é lenta (constante de tempo ~0,2-0,3 s, o simulador usava 0,03 s) e o WheelLoop antigo (I=3,0, D=0,004) oscila: pior caso 505 mm/s. Retune I=0,1 e D=0,02: 7 mm/s em toda a faixa (commit 0c99d6b). A rampa de tensão e o termo da parede eram agravantes menores (filtro de 0,3 s no termo da parede: 335d450).
## Gravação 6 — registro abaixo
## E15 (tentativa 5) — CONFERIR (falta a resposta do operador) — 11:41:34

Reta contínua: 3 células num movimento só (andar 3) e volta de ré. Comando(s): andar 3, re.

- PASSOU: trecho contínuo: 3 de 3 células
- PASSOU: pulsos E=1527 D=1533 (esperado 1533 ± 25)
- PASSOU: giro=1.5 graus (limite 3)
- dado: tempo do trecho: 5036 ms (3 células paradas uma a uma: ~6,9 s)
- dado: velocidade a cada 50 ms (mm/s): 0 16 32 48 42 56 76 77 92 107 109 130 134 126 126 118 120 118 123 126 115 109 112 118 118 118 118 120 118 112 118 118 118 120 118 112 128 128 120 118 112 118 118 126 120 118 120 120 128 112 118 118 134 126 126 118 120 118 120 120
- PASSOU: cruzeiro: mínimo 109 mm/s (esperado ~120, mínimo aceito 84)
- PASSOU: cruzeiro: média 120 mm/s, desvio 5.4 (limite 12)
- PASSOU: 0 amostra(s) de 50 ms abaixo de 60% do cruzeiro no meio do trecho
- dado: ToF esquerdo: 100 de 101 leituras válidas, min 25 máx 32 mm, 1 alternância(s) válido/inválido, 0 salto(s) de 8 mm ou mais entre leituras
- PASSOU: ToF esquerdo: 1 alternância(s) entre válido e inválido (meta: até 2)
- PASSOU: ToF esquerdo: 0 salto(s) de 8 mm ou mais (meta: até 3)
- dado: ToF direito: 98 de 101 leituras válidas, min 9 máx 219 mm, 3 alternância(s) válido/inválido, 1 salto(s) de 8 mm ou mais entre leituras
- CONFERIR: ToF direito: 3 alternância(s) entre válido e inválido (meta: até 2)
- PASSOU: ToF direito: 1 salto(s) de 8 mm ou mais (meta: até 3)
- dado: corredor medido (E + D + 101): 140 a 349 mm, média 207 mm (a chave largura_corredor deve ficar perto)
- dado: erro lateral estimado (mm, + = direita): de 0.0 a 14.0, no fim 4.6
- PASSOU: erro lateral no fim: 4.6 mm (meta: até 10)
- dado: termo da parede aplicado (mm): de 0.0 a 21.3
- PASSOU: 4 de 4 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia

## E15 (tentativa 6) — CONFERIR (falta a resposta do operador) — 11:48:29

Reta e ré contínuas: 3 células num movimento só (andar 3) e volta de ré contínua (re 3). Comando(s): andar 3, re 3.

- PASSOU: trecho contínuo: 3 de 3 células
- PASSOU: pulsos E=1524 D=1537 (esperado 1533 ± 25)
- PASSOU: giro=2.9 graus (limite 3)
- dado: tempo do trecho: 5036 ms (3 células paradas uma a uma: ~6,9 s)
- dado: velocidade a cada 50 ms (mm/s): 0 19 16 32 50 64 67 76 92 96 109 132 130 126 120 115 118 115 123 115 115 126 118 111 118 121 123 118 115 114 114 118 115 124 111 127 130 127 118 118 114 106 130 108 118 124 125 114 114 114 111 118 121 137 130 127 115 118 118 104
- PASSOU: cruzeiro: mínimo 104 mm/s (esperado ~120, mínimo aceito 84)
- PASSOU: cruzeiro: média 120 mm/s, desvio 6.5 (limite 12)
- PASSOU: 0 amostra(s) de 50 ms abaixo de 60% do cruzeiro no meio do trecho
- dado: ToF esquerdo: 100 de 101 leituras válidas, min 26 máx 34 mm, 1 alternância(s) válido/inválido, 0 salto(s) de 8 mm ou mais entre leituras
- PASSOU: ToF esquerdo: 1 alternância(s) entre válido e inválido (meta: até 2)
- PASSOU: ToF esquerdo: 0 salto(s) de 8 mm ou mais (meta: até 3)
- dado: ToF direito: 97 de 101 leituras válidas, min 7 máx 217 mm, 5 alternância(s) válido/inválido, 0 salto(s) de 8 mm ou mais entre leituras
- CONFERIR: ToF direito: 5 alternância(s) entre válido e inválido (meta: até 2)
- PASSOU: ToF direito: 0 salto(s) de 8 mm ou mais (meta: até 3)
- dado: corredor medido (E + D + 101): 139 a 347 mm, média 204 mm (a chave largura_corredor deve ficar perto)
- dado: erro lateral estimado (mm, + = direita): de 0.0 a 15.9, no fim 6.5
- PASSOU: erro lateral no fim: 6.5 mm (meta: até 10)
- dado: termo da parede aplicado (mm): de 0.0 a 24.6
- dado: velocidade a cada 50 ms (mm/s): 0 20 19 46 59 77 59 84 104 102 108 123 127 118 137 118 118 108 118 135 123 118 118 118 130 118 111 115 121 118 114 114 114 118 118 127 125 111 121 111 124 121 118 121 124 121 114 108 108 121 121 124 121 121 108 127 114 118 121 130
- PASSOU: cruzeiro: mínimo 104 mm/s (esperado ~120, mínimo aceito 84)
- PASSOU: cruzeiro: média 119 mm/s, desvio 6.1 (limite 12)
- PASSOU: 0 amostra(s) de 50 ms abaixo de 60% do cruzeiro no meio do trecho
- PASSOU: 2 de 2 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia

Respostas do operador ao E15 (tentativa 6), 11:49:17:

- PASSOU: operador: O robô andou as 3 células SEM parar no meio? -> s
- PASSOU: operador: Tranco ao parar no fim: 0 = nada, 1 = pouco, 2 = como antes, 3 = pior -> 0.0
- veredito final: CONFERIR

- nota sobre o E15 (11:49:17): 20/11 11:50 (gravacao 7, commit 486995a): andar 3 e re 3 CONTINUOS e LIMPOS (cruzeiro minimo 104, media 120, desvio 6,5; 5036/5037 ms contra ~6,9 s parando). Operador: sem parar no meio = sim (ida e ré), tranco 0, zigue-zague 'melhorou, quase nao e mais perceptivel'. Erro lateral no fim 6,5 mm; ToF D com 5 alternancias valido/invalido (sensor perto do limite de alcance e abertura na parede).

- calibração (20/11 11:54:43): gravado no robô: ganho_parede=3 max_parede=50


## CORRIDA SERPENTINA-1 (20/11 11:55) — FALHA no passo 6 (rumo perdido)
Labirinto 4x4 serpentina (foto removida a pedido do operador), largada (l3,c0) virado N (canto inferior direito virado para oeste), via 3 aberta, reta e ré contínuas, bateria 7,98 V.
- Passo 1: frente (3 células) num movimento só, parou pela parede (F=61). Passo 2: beco; ré de 2 células num movimento só. Passos 3 a 5: curvas e trechos de 2 e 1 célula (parada pela parede da frente nos trechos curtos). dist do flood fill 6 -> 4.
- Passo 6: trecho de 3 células logo depois de uma curva à direita com o robô encostado na parede esquerda (E=3 mm, perto): ganho_parede=5/max_parede=100 pediu ~35 mm de correção (~7,6 graus de rumo) e a reta abortou com 'rumo perdido: desviou 10 graus' aos 165 mm. 9 células andadas, 3 paradas pela parede da frente, 0 arcos repetidos.
- Ajuste: ganho_parede=3, max_parede=50 (teto ~17,6 mm, ~3,8 graus). Log: resultados/logs/corrida_serpentina1_20_11.log.

## CORRIDA SERPENTINA-2 (20/11 12:08) — FALHA no passo 5 (curva travada + desfazer para o lado errado)
Com ganho_parede=3/max_parede=50. Passos 1 a 4 certos (frente 3 células, beco com ré de 2 células num movimento só, curvas, trechos de 2 células). No passo 4->5 o arco (direita) travou a -66,3 graus: o ângulo vinha limpo (0 -1 -3 -6 -11 -16 ... -60 -65, ~50 graus/s) e parou de repente em -66 por 400 ms (bateu em algo). O desfazer foi de -66,3 para -97,3 (lado ERRADO, calçado nas paredes) com E=-1160 D=-468 pulsos a 5 V (ré violenta, relato do operador). Correção: desfazer para na hora se o ângulo se afastar >8 graus, 3,5/2,0 V e 1,2 s (commit acima).
- Hipótese (aguarda medida): a frente real do robô é maior que os 87 mm do calib (CAD: 107 mm), então o arco começa perto demais da parede da frente e o canto raspa; dá certo em 4 curvas e falha em 1, conforme o ajuste de ±8 mm.
- Também aberto: largura real do robô com os sensores laterais (o corredor medido pelos ToF é ~150 mm, a foto sugere ~165).
- calibração (20/11 12:09:02): gravado no robô: eixo_ate_frente=100 eixo_ate_tof_frente=98 largura_frente=112 tof_lado_ao_centro=55.5 largura_corredor=168 ganho_parede=3 max_parede=50


## CORRIDA SERPENTINA-3 (20/11 12:20) — FALHA no passo 7 (curva travada duas vezes)
Calib com as medidas reais (frente 100, ToF frontal 98, largura_frente 112, laterais a 55,5, corredor 168, ganho_parede 3, max_parede 50), desfazer do arco corrigido. Largada centrada (E=25 D=24).
- Passos 1 a 6 certos (frente 3 células; beco com ré de 2 em um movimento só; 2 curvas; trechos de 2 células). 11 células, 3 paradas pela parede da frente.
- Passo 6/7: arco à direita em (l0,c2) travou a 48,2 graus; o DESFAZER FUNCIONOU (48,1 -> 4,0 graus, E=-362 D=-520, ok: sem ré violenta); a 2a tentativa travou a 66,5 graus. Foto do operador (2a tentativa): robô girado ~40 graus com o lado esquerdo (cabo da bateria) encostado na ponta da parede. Ponto fixo da pista, repete.
- Antes (SERPENTINA-2) o arco travou em -66 graus; (SERPENTINA-1) falhou por 'rumo perdido' com ganho_parede 5/100.
- Próximo: modo_curva=1 (uma roda): com as medidas reais ainda cabe (faixa 54 a 72 mm antes do centro, alvo 63). Hardware (cabo) só depois de segunda.
- calibração (20/11 12:24:28): gravado no robô: modo_curva=0 ganho_parede=3 max_parede=50


## CORRIDA SERPENTINA-4 (20/11 12:30) — FALHA no passo 3 (curva com uma roda travou a -53 graus)
modo_curva=1, ganho_parede 4/70, largada 9,5 mm à direita do centro (E=32 D=13, com a escorva não recentrou). Passos 1 e 2 (frente 3 células, beco, ré de 2 num movimento só) certos; no passo 3 a curva de uma roda travou a -53 graus com D=0 (perto): o lado de dentro encostado na parede direita.
Estado deixado no robô: modo_curva=0 (arco), ganho_parede=3, max_parede=50, medidas reais (frente 100, ToF frontal 98, largura_frente 112, laterais a 55,5, corredor 168).
## Balanço do dia (20/11)
FUNCIONA: bloco 1 inteiro (H, A, O), reta contínua e ré contínua e limpas (cruzeiro 104-134 mm/s, tranco 0), centralização no corredor reto, exploração do labirinto (beco com ré contínua), desfazer do arco seguro. FALTA: as curvas na serpentina travam em 2 pontos (1: ponta da parede com o cabo da bateria no lado esquerdo; 2: largada fora do centro com o lado de dentro na parede). Baterias: 7,97 V (carregar). Não executados: B1M/B1A formais, E1-E3, E4b, B4/B5, C, D oficiais, F, G.
- calibração (20/11 19:34:24): gravado no robô: eixo_ate_frente=100 eixo_ate_tof_frente=98 largura_frente=112 tof_lado_ao_centro=55.5 centralizar=1 ganho_rumo=0.6 ganho_parede=3 max_parede=50

## E0 (tentativa 3) — PASSOU — 19:34:29

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- PASSOU: 30 chaves do calib no log (esperado 30)
- PASSOU: eixo_ate_frente = 100.0 (esperado 100.0)
- PASSOU: largura_frente = 112.0 (esperado 112.0)
- PASSOU: eixo_ate_tof_frente = 98.0 (esperado 98.0)
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 55.5 (esperado 55.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.08 (esperado 1.08)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 8.1 (esperado 8.1)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- PASSOU: ganho_parede = 3.0 (esperado 3.0)
- PASSOU: max_parede = 50.0 (esperado 50.0)
- PASSOU: folga_arco = 12.0 (esperado 12.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- PASSOU: antecipa_arco = 16.0 (esperado 16.0)
- PASSOU: centralizar = 1.0 (esperado 1.0)
- PASSOU: ganho_rumo = 0.6 (esperado 0.6)

## E16a (tentativa 1) — FALHOU (falta a resposta do operador) — 19:46:46

Curva contínua à direita: anda 1 célula e vira SEM parar (curvac d). Comando(s): curvac d 1.

- PASSOU: curva contínua à direita na célula 1 (pedido: direita)
- FALHOU: resultado: curva continua travada (o giroscopio nao acompanhou as rodas)
- PASSOU: entrou na curva a 132 mm/s (sem parar: >= 60)
- FALHOU: girou -55.8 graus pelo giroscópio (alvo -90 ± 6)
- FALHOU: erro máximo do arco em relação ao planejado: 20.1 graus (limite 10)
- dado: rumo inicial 0.1 graus, arco planejado de 90.1 graus
- FALHOU: manobra falhou: ['teste: manobra curva continua: curva travada e o desfazer nao voltou: sem progresso (preso, segurado ou rodas patinando), robo torto em -49 graus']
- PASSOU: sem BROWNOUT nem reinício de energia

## E16a (tentativa 2) — FALHOU (falta a resposta do operador) — 19:54:48

Curva contínua à direita: anda 1 célula e vira SEM parar (curvac d). Comando(s): curvac d 1.

- PASSOU: curva contínua à direita na célula 1 (pedido: direita)
- PASSOU: resultado: ok
- PASSOU: entrou na curva a 120 mm/s (sem parar: >= 60)
- FALHOU: girou -105.6 graus pelo giroscópio (alvo -90 ± 6)
- FALHOU: erro máximo do arco em relação ao planejado: 13.6 graus (limite 10)
- dado: rumo inicial 2.2 graus, arco planejado de 92.2 graus
- PASSOU: 1 de 1 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia

Respostas do operador ao E16a (tentativa 2), 19:56:31:

- PASSOU: operador: O robô entrou na curva SEM parar? -> s
- PASSOU: operador: O robô terminou a curva SEM raspar nenhuma parede? -> s
- FALHOU: operador: Terminou no centro da célula, reto no corredor de saída? -> n
- veredito final: FALHOU

## E16a (tentativa 3) — PASSOU (falta a resposta do operador) — 19:59:58

Curva contínua à direita: anda 1 célula e vira SEM parar (curvac d). Comando(s): curvac d 1.

- PASSOU: curva contínua à direita na célula 1 (pedido: direita)
- PASSOU: resultado: ok
- PASSOU: entrou na curva a 109 mm/s (sem parar: >= 60)
- PASSOU: girou -89.1 graus pelo giroscópio (alvo -90 ± 6)
- PASSOU: erro máximo do arco em relação ao planejado: 6.6 graus (limite 10)
- dado: rumo inicial 3.0 graus, arco planejado de 93.0 graus
- PASSOU: 1 de 1 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia

Respostas do operador ao E16a (tentativa 3), 20:01:13:

- PASSOU: operador: O robô entrou na curva SEM parar? -> s
- PASSOU: operador: O robô terminou a curva SEM raspar nenhuma parede? -> s
- FALHOU: operador: Terminou no centro da célula, reto no corredor de saída? -> n
- veredito final: FALHOU

## E16a (tentativa 4) — PASSOU (falta a resposta do operador) — 20:04:36

Curva contínua à direita: anda 1 célula e vira SEM parar (curvac d). Comando(s): curvac d 1.

- PASSOU: curva contínua à direita na célula 1 (pedido: direita)
- PASSOU: resultado: ok
- PASSOU: entrou na curva a 120 mm/s (sem parar: >= 60)
- PASSOU: girou -89.6 graus pelo giroscópio (alvo -90 ± 6)
- PASSOU: erro máximo do arco em relação ao planejado: 7.8 graus (limite 10)
- dado: rumo inicial 2.0 graus, arco planejado de 92.0 graus
- PASSOU: 1 de 1 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia

Respostas do operador ao E16a (tentativa 4), 20:07:57:

- PASSOU: operador: O robô entrou na curva SEM parar? -> s
- PASSOU: operador: O robô terminou a curva SEM raspar nenhuma parede? -> s
- FALHOU: operador: Terminou no centro da célula, reto no corredor de saída? -> n
- veredito final: FALHOU

- calibração (20/11 20:15:40): gravado no robô: escala_giro=1.01

## E16a (tentativa 5) — PASSOU (falta a resposta do operador) — 20:16:43

Curva contínua à direita: anda 1 célula e vira SEM parar (curvac d). Comando(s): curvac d 1.

- PASSOU: curva contínua à direita na célula 1 (pedido: direita)
- PASSOU: resultado: ok
- PASSOU: entrou na curva a 120 mm/s (sem parar: >= 60)
- PASSOU: girou -90.2 graus pelo giroscópio (alvo -90 ± 6)
- PASSOU: erro máximo do arco em relação ao planejado: 6.6 graus (limite 10)
- dado: rumo inicial 2.6 graus, arco planejado de 92.6 graus
- PASSOU: 1 de 1 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia

Respostas do operador ao E16a (tentativa 5), 20:17:38:

- PASSOU: operador: O robô entrou na curva SEM parar? -> s
- PASSOU: operador: O robô terminou a curva SEM raspar nenhuma parede? -> s
- PASSOU: operador: Terminou no centro da célula, reto no corredor de saída? -> s
- veredito final: PASSOU

- calibração (20/11 20:17:40): gravado no robô: escala_giro=1.00

## E16a (tentativa 6) — PASSOU (falta a resposta do operador) — 20:18:15

Curva contínua à direita: anda 1 célula e vira SEM parar (curvac d). Comando(s): curvac d 1.

- PASSOU: curva contínua à direita na célula 1 (pedido: direita)
- PASSOU: resultado: ok
- PASSOU: entrou na curva a 118 mm/s (sem parar: >= 60)
- PASSOU: girou -88.9 graus pelo giroscópio (alvo -90 ± 6)
- PASSOU: erro máximo do arco em relação ao planejado: 5.9 graus (limite 10)
- dado: rumo inicial 1.0 graus, arco planejado de 91.0 graus
- PASSOU: 1 de 1 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia

Respostas do operador ao E16a (tentativa 6), 20:20:03:

- PASSOU: operador: O robô entrou na curva SEM parar? -> s
- PASSOU: operador: O robô terminou a curva SEM raspar nenhuma parede? -> s
- FALHOU: operador: Terminou no centro da célula, reto no corredor de saída? -> n
- veredito final: FALHOU

- calibração (20/11 20:20:06): gravado no robô: antecipa_arco=12

## E16a (tentativa 7) — FALHOU (falta a resposta do operador) — 20:20:46

Curva contínua à direita: anda 1 célula e vira SEM parar (curvac d). Comando(s): curvac d 1.

- PASSOU: curva contínua à direita na célula 1 (pedido: direita)
- PASSOU: resultado: ok
- PASSOU: entrou na curva a 126 mm/s (sem parar: >= 60)
- FALHOU: girou -83.1 graus pelo giroscópio (alvo -90 ± 6)
- PASSOU: erro máximo do arco em relação ao planejado: 5.5 graus (limite 10)
- dado: rumo inicial -4.6 graus, arco planejado de 85.4 graus
- PASSOU: 1 de 1 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia

Respostas do operador ao E16a (tentativa 7), 20:21:56:

- PASSOU: operador: O robô entrou na curva SEM parar? -> s
- FALHOU: operador: O robô terminou a curva SEM raspar nenhuma parede? -> n
- FALHOU: operador: Terminou no centro da célula, reto no corredor de saída? -> n
- veredito final: FALHOU

## E16a (tentativa 8) — PASSOU (falta a resposta do operador) — 20:24:19

Curva contínua à direita: anda 1 célula e vira SEM parar (curvac d). Comando(s): curvac d 1.

- PASSOU: curva contínua à direita na célula 1 (pedido: direita)
- PASSOU: resultado: ok
- PASSOU: entrou na curva a 128 mm/s (sem parar: >= 60)
- PASSOU: girou -88.4 graus pelo giroscópio (alvo -90 ± 6)
- PASSOU: erro máximo do arco em relação ao planejado: 7.3 graus (limite 10)
- dado: rumo inicial 0.9 graus, arco planejado de 90.9 graus
- PASSOU: 1 de 1 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia

Respostas do operador ao E16a (tentativa 8), 20:25:02:

- PASSOU: operador: O robô entrou na curva SEM parar? -> s
- PASSOU: operador: O robô terminou a curva SEM raspar nenhuma parede? -> s
- PASSOU: operador: Terminou no centro da célula, reto no corredor de saída? -> s
- veredito final: PASSOU

## E16a (tentativa 9) — PASSOU (falta a resposta do operador) — 20:28:24

Curva contínua à direita: anda 1 célula e vira SEM parar (curvac d). Comando(s): curvac d 1.

- PASSOU: curva contínua à direita na célula 1 (pedido: direita)
- PASSOU: resultado: ok
- PASSOU: entrou na curva a 118 mm/s (sem parar: >= 60)
- PASSOU: girou -89.2 graus pelo giroscópio (alvo -90 ± 6)
- PASSOU: erro máximo do arco em relação ao planejado: 6.2 graus (limite 10)
- dado: rumo inicial 1.5 graus, arco planejado de 91.5 graus
- PASSOU: 1 de 1 manobra(s) terminaram ok
- PASSOU: sem BROWNOUT nem reinício de energia

## SERPENTINA-5 (tentativa 1) — corrida — FALHOU — 20:34:05

Serpentina 4x4, largada (l3,c0) norte, via 3 aberta, curva continua ligada, escala_giro 1.00, antecipa_arco 12, largada centrada E=26 D=23. Log: logs/corridas/SERPENTINA-5/SERPENTINA-5_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 3
- celulas: 5
- posicao_final: l2,c0
- fora: 1
- tempo_s: 16.6
- s_por_passo: 5.15
- curvas: 1
- ajustes_antes_da_curva: 0
- curva_final_min: 85.6
- curva_final_max: 85.6
- reta_giro_max: 0.0
- rumo_perdido: 0
- curva_travada: 3
- tentativa2: 0
- paradas_pela_frente: 0
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 0.60 mm/grau

## SERPENTINA-6 (tentativa 1) — corrida — FALHOU — 20:39:38

Serpentina 4x4, largada (l3,c0) norte, via 3 aberta, curva continua ligada, recuo fixo pelo modelo (105 mm), arco parado perto do fim aceito, escala_giro 1.00, antecipa_arco 12, E=28 D=23. Log: logs/corridas/SERPENTINA-6/SERPENTINA-6_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 3
- celulas: 5
- posicao_final: l2,c1
- fora: 1
- tempo_s: 16.1
- s_por_passo: 4.78
- curvas: 2
- ajustes_antes_da_curva: 0
- curva_final_min: 88.3
- curva_final_max: 88.3
- reta_giro_max: 0.2
- lateral_pos_curva_min: 218
- rumo_perdido: 3
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 0
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 0.60 mm/grau

## SERPENTINA-7 (tentativa 1) — corrida — FALHOU — 20:45:37

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 13a111a (recuo fixo 105, arco quase pronto aceito), escala_giro 1.00, antecipa 12; posicionado pela re 3 (E=38 D=17 F=514). Log: logs/corridas/SERPENTINA-7/SERPENTINA-7_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 4
- celulas: 6
- posicao_final: l2,c1
- fora: 1
- tempo_s: 21.4
- s_por_passo: 5.05
- curvas: 3
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 1
- curva_final_min: 43.2
- curva_final_max: 88.2
- reta_giro_max: 0.2
- lateral_pos_curva_min: 243
- rumo_perdido: 0
- curva_travada: 3
- tentativa2: 0
- paradas_pela_frente: 1
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 0.60 mm/grau

## SERPENTINA-8 (tentativa 1) — corrida — FALHOU — 20:50:16

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware ce8ff24 (re 70 mm/s, arco a esquerda 4 mm mais tarde, recuo fixo 105), escala_giro 1.00, antecipa 12; E=28 D=32 F=520. Log: logs/corridas/SERPENTINA-8/SERPENTINA-8_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 1
- celulas: 0
- posicao_final: l0,c0
- fora: 1
- tempo_s: 6.1
- curvas: 0
- ajustes_antes_da_curva: 0
- rumo_perdido: 3
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 0
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 0.60 mm/grau

## SERPENTINA-9 (tentativa 1) — corrida — FALHOU — 20:51:53

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware ce8ff24 (re 70 mm/s, arco a esquerda 4 mm mais tarde, recuo fixo 105), escala_giro 1.00, antecipa 12; refeita depois do parar da SERPENTINA-8. Log: logs/corridas/SERPENTINA-9/SERPENTINA-9_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 3
- celulas: 5
- posicao_final: l2,c1
- fora: 1
- tempo_s: 18.7
- s_por_passo: 6.22
- curvas: 2
- ajustes_antes_da_curva: 0
- curva_final_min: 88.5
- curva_final_max: 88.5
- reta_giro_max: 1.3
- lateral_pos_curva_min: 242
- rumo_perdido: 3
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 0
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 0.60 mm/grau

## SERPENTINA-10 (tentativa 1) — corrida — FALHOU — 20:56:20

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 6d9df5d (desfazer suave 2.8/1.6 V, recuo da curva a direita alinhado 8 mm para fora, arco a esquerda 4 mm mais tarde), escala_giro 1.00, antecipa 12; E=27 D=46 F=533. Log: logs/corridas/SERPENTINA-10/SERPENTINA-10_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 1
- celulas: 0
- posicao_final: l2,c0
- fora: 0
- tempo_s: 3.1
- curvas: 0
- ajustes_antes_da_curva: 0
- rumo_perdido: 2
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 0
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 0.60 mm/grau

- calibração (20/11 20:59:04): gravado no robô: ganho_rumo=1.2

## SERPENTINA-11 (tentativa 1) — corrida — FALHOU — 21:03:01

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 91f0ac2 (ganho_rumo 1.2 teto 14 mm, desfazer suave, recuo a direita 8 mm fora, arco a esquerda 4 mm mais tarde), escala_giro 1.00, antecipa 12; bateria lida pelo robo 6.46 V contra 7.89 V no cellmeter (queda de energia a investigar); E=24 D=65 F=508. Log: logs/corridas/SERPENTINA-11/SERPENTINA-11_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 1
- celulas: 0
- posicao_final: l2,c0
- fora: 0
- tempo_s: 3.3
- curvas: 0
- ajustes_antes_da_curva: 0
- rumo_perdido: 2
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 0
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 1.20 mm/grau

- calibração (20/11 21:04:26): gravado no robô: max_parede=20

- calibração (20/11 21:14:25): gravado no robô: max_parede=20

## SERPENTINA-12 (tentativa 1) — corrida — FALHOU — 21:15:10

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 91f0ac2, max_parede 20 (teto 7 mm, abaixo do limite de 5 graus da estimativa lateral), ganho_rumo 1.2, escala_giro 1.00, antecipa 12; largada deslocada 18 mm a esquerda (E=24 D=60) como a SERPENTINA-11. Log: logs/corridas/SERPENTINA-12/SERPENTINA-12_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 1
- celulas: 0
- posicao_final: l2,c0
- fora: 0
- tempo_s: 3.3
- curvas: 0
- ajustes_antes_da_curva: 0
- rumo_perdido: 2
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 0
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 1.20 mm/grau

- calibração (20/11 21:18:35): gravado no robô: ganho_rumo=0.6 max_parede=50

## SERPENTINA-13 (tentativa 1) — corrida — FALHOU — 21:21:45

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware revertido para o estado do ce8ff24 (e96a51b), ganho_rumo 0.6, max_parede 50, escala_giro 1.00, antecipa 12; E=26 D=45 F=519; pneus limpos. Log: logs/corridas/SERPENTINA-13/SERPENTINA-13_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 3
- celulas: 5
- posicao_final: l2,c1
- fora: 1
- tempo_s: 18.6
- s_por_passo: 6.18
- curvas: 2
- ajustes_antes_da_curva: 0
- curva_final_min: 88.8
- curva_final_max: 88.8
- reta_giro_max: 1.8
- lateral_pos_curva_min: 238
- rumo_perdido: 3
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 0
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 0.60 mm/grau

## SERPENTINA-14 (tentativa 1) — corrida — FALHOU — 21:24:57

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 427e642 (revertido ao ce8ff24 + recuo da curva a direita alinhado 8 mm para fora), ganho_rumo 0.6, max_parede 50, escala_giro 1.00, antecipa 12; E=24 D=43 F=521. Log: logs/corridas/SERPENTINA-14/SERPENTINA-14_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 3
- celulas: 5
- posicao_final: l2,c1
- fora: 1
- tempo_s: 18.7
- s_por_passo: 6.24
- curvas: 2
- ajustes_antes_da_curva: 0
- curva_final_min: 88.7
- curva_final_max: 88.7
- reta_giro_max: 1.2
- lateral_pos_curva_min: 235
- rumo_perdido: 3
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 0
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 0.60 mm/grau

## SERPENTINA-15 (tentativa 1) — corrida — FALHOU — 21:28:25

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 5c3a5a5 (recuo 90 mm sem parede a frente, alinhamento 8 mm para fora na curva a direita), ganho_rumo 0.6, max_parede 50, escala_giro 1.00, antecipa 12; E=25 D=54 F=519. Log: logs/corridas/SERPENTINA-15/SERPENTINA-15_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 4
- celulas: 6
- posicao_final: l2,c1
- fora: 1
- tempo_s: 24.3
- s_por_passo: 5.99
- curvas: 3
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 1
- curva_final_min: 38.0
- curva_final_max: 88.5
- reta_giro_max: 1.2
- lateral_pos_curva_min: 209
- rumo_perdido: 0
- curva_travada: 3
- tentativa2: 0
- paradas_pela_frente: 1
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 0.60 mm/grau

- calibração (20/11 21:32:39): gravado no robô: eixo_ate_frente=100 eixo_ate_tof_frente=98 largura_frente=112 tof_lado_ao_centro=55.5 centralizar=1 ganho_rumo=0.6 ganho_parede=3 max_parede=50 escala_giro=1.00 antecipa_arco=12

## SERPENTINA-16 (tentativa 1) — corrida — FALHOU — 21:34:14

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 83aa5c2 (recuo 90 sem parede a frente, alinhamento 8 mm para fora na curva a direita, desfazer suave, arco_esq_atraso 0, logs novos da curva), ganho_rumo 0.6, max_parede 50, escala_giro 1.00, antecipa 12; E=26 D=45 F=511. Log: logs/corridas/SERPENTINA-16/SERPENTINA-16_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 4
- celulas: 8
- posicao_final: l0,c1
- fora: 2
- tempo_s: 26.8
- s_por_passo: 6.85
- curvas: 3
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 1
- curva_final_min: 88.2
- curva_final_max: 89.1
- reta_giro_max: 0.0
- lateral_pos_curva_min: 22
- rumo_perdido: 0
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 1
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 0.60 mm/grau

## SERPENTINA-17 (tentativa 1) — corrida — FALHOU — 21:39:27

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 6b9096b (limite de bateria 5.5 V so nos testes: INA219 le 1.7 V abaixo do cellmeter 8.11 V), recuo 90 sem parede a frente, alinhamento 8 mm para fora na curva a direita, desfazer suave, arco_esq_atraso 0, ganho_rumo 0.6, max_parede 50, escala_giro 1.00, antecipa 12; E=30 D=52 F=524. Log: logs/corridas/SERPENTINA-17/SERPENTINA-17_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 5
- celulas: 6
- posicao_final: l2,c1
- fora: 1
- tempo_s: 26.1
- s_por_passo: 4.95
- curvas: 3
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 1
- curva_final_min: 37.2
- curva_final_max: 88.4
- reta_giro_max: 0.1
- lateral_pos_curva_min: 253
- rumo_perdido: 0
- curva_travada: 3
- tentativa2: 0
- paradas_pela_frente: 1
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 0.60 mm/grau

- calibração (20/11 21:40:02): gravado no robô: arco_esq_atraso=-8

## SERPENTINA-18 (tentativa 1) — corrida — FALHOU — 21:41:40

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 6b9096b, arco_esq_atraso -8 (a curva a esquerda recua 8 mm a mais), limite de bateria 5.5 V, recuo 90 sem parede a frente, alinhamento 8 mm para fora na curva a direita, ganho_rumo 0.6, max_parede 50, escala_giro 1.00, antecipa 12; E=29 D=52 F=513. Log: logs/corridas/SERPENTINA-18/SERPENTINA-18_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 7
- celulas: 12
- posicao_final: l1,c3
- fora: 2
- tempo_s: 53.8
- s_por_passo: 7.93
- curvas: 10
- ajustes_antes_da_curva: 2
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 2
- curva_final_min: 38.3
- curva_final_max: 89.1
- reta_giro_max: 1.5
- lateral_pos_curva_min: 4
- rumo_perdido: 0
- curva_travada: 5
- tentativa2: 1
- paradas_pela_frente: 2
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 0.60 mm/grau

- calibração (20/11 21:42:15): gravado no robô: arco_esq_atraso=-14

## SERPENTINA-19 (tentativa 1) — corrida — FALHOU — 21:44:06

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 6b9096b, arco_esq_atraso -14 (alvo frontal 105 mm na curva a esquerda: a 99 travou a 38 graus na frente, a 111 travou a 55 na quina), limite de bateria 5.5 V, recuo 90 sem parede a frente, alinhamento 8 mm para fora na curva a direita, ganho_rumo 0.6, max_parede 50, escala_giro 1.00, antecipa 12; E=27 D=60 F=522. Log: logs/corridas/SERPENTINA-19/SERPENTINA-19_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 5
- celulas: 8
- posicao_final: l0,c1
- fora: 2
- tempo_s: 34.3
- s_por_passo: 7.0
- curvas: 5
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 2
- curva_final_min: 48.7
- curva_final_max: 88.8
- reta_giro_max: 1.0
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 3
- tentativa2: 0
- paradas_pela_frente: 2
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 0.60 mm/grau

- calibração (20/11 21:45:28): gravado no robô: ganho_rumo=1.0

## SERPENTINA-20 (tentativa 1) — corrida — FALHOU — 21:51:28

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 967fb7c (desfazer suave 2.8/1.6 V com 2.4 s, alinhamento 8 mm desligado, recuo 90 sem parede a frente), arco_esq_atraso -14, ganho_rumo 1.0, max_parede 50, escala_giro 1.00, antecipa 12, limite de bateria 5.5 V; E=30 D=60 F=522. Log: logs/corridas/SERPENTINA-20/SERPENTINA-20_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 7
- celulas: 12
- posicao_final: l1,c3
- fora: 2
- tempo_s: 55.5
- s_por_passo: 8.2
- curvas: 11
- ajustes_antes_da_curva: 3
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 3
- curva_final_min: 47.5
- curva_final_max: 88.9
- reta_giro_max: 0.4
- lateral_pos_curva_min: 30
- rumo_perdido: 0
- curva_travada: 5
- tentativa2: 1
- paradas_pela_frente: 3
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (20/11 21:53:54): gravado no robô: eixo_ate_frente=100 eixo_ate_tof_frente=98 largura_frente=112 tof_lado_ao_centro=55.5 centralizar=1 ganho_rumo=1.0 ganho_parede=3 max_parede=50 escala_giro=1.00 antecipa_arco=12 arco_esq_atraso=-14 bateria_minima=5.5

## E0 (tentativa 4) — FALHOU — 21:53:56

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- FALHOU: 49 chaves do calib no log (esperado 51)
- PASSOU: eixo_ate_frente = 100.0 (esperado 100.0)
- PASSOU: largura_frente = 112.0 (esperado 112.0)
- PASSOU: eixo_ate_tof_frente = 98.0 (esperado 98.0)
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 55.5 (esperado 55.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.0 (esperado 1.0)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 8.1 (esperado 8.1)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- PASSOU: ganho_parede = 3.0 (esperado 3.0)
- PASSOU: max_parede = 50.0 (esperado 50.0)
- PASSOU: folga_arco = 12.0 (esperado 12.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- PASSOU: antecipa_arco = 12.0 (esperado 12.0)
- PASSOU: arco_esq_atraso = -14.0 (esperado -14.0)
- PASSOU: curva_cont_vel = 80.0 (esperado 80.0)
- PASSOU: curva_cont_bitola = 100.0 (esperado 100.0)
- PASSOU: curva_cont_ganho = 1.0 (esperado 1.0)
- PASSOU: curva_cont_giro_max = 30.0 (esperado 30.0)
- PASSOU: curva_cont_trava = 20.0 (esperado 20.0)
- PASSOU: curva_cont_freio = 4.0 (esperado 4.0)
- PASSOU: desfazer_tensao_fora = 2.8 (esperado 2.8)
- PASSOU: desfazer_tensao_dentro = 1.6 (esperado 1.6)
- PASSOU: desfazer_tempo = 2.4 (esperado 2.4)
- PASSOU: recuo_sem_parede = 90.0 (esperado 90.0)
- PASSOU: ajuste_2a_tentativa = 12.0 (esperado 12.0)
- PASSOU: trava_frente_ate = 52.0 (esperado 52.0)
- PASSOU: arco_quase_pronto = 78.0 (esperado 78.0)
- PASSOU: ajuste_fino_max = 15.0 (esperado 15.0)
- PASSOU: curva_dir_fora = 0.0 (esperado 0.0)
- PASSOU: rumo_max_mm = 6.0 (esperado 6.0)
- PASSOU: rumo_max_lateral = 5.0 (esperado 5.0)
- PASSOU: re_vel = 70.0 (esperado 70.0)
- FALHOU: re_acel = None: esperado 120.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- FALHOU: bateria_minima = None: esperado 6.6. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: centralizar = 1.0 (esperado 1.0)
- FALHOU: ganho_rumo = 1.0: esperado 0.6. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar

## E0 (tentativa 5) — PASSOU — 21:54:05

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- PASSOU: 51 chaves do calib no log (esperado 51)
- PASSOU: eixo_ate_frente = 100.0 (esperado 100.0)
- PASSOU: largura_frente = 112.0 (esperado 112.0)
- PASSOU: eixo_ate_tof_frente = 98.0 (esperado 98.0)
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 55.5 (esperado 55.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.0 (esperado 1.0)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 8.1 (esperado 8.1)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- PASSOU: ganho_parede = 3.0 (esperado 3.0)
- PASSOU: max_parede = 50.0 (esperado 50.0)
- PASSOU: folga_arco = 12.0 (esperado 12.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- PASSOU: antecipa_arco = 12.0 (esperado 12.0)
- PASSOU: arco_esq_atraso = -14.0 (esperado -14.0)
- PASSOU: curva_cont_vel = 80.0 (esperado 80.0)
- PASSOU: curva_cont_bitola = 100.0 (esperado 100.0)
- PASSOU: curva_cont_ganho = 1.0 (esperado 1.0)
- PASSOU: curva_cont_giro_max = 30.0 (esperado 30.0)
- PASSOU: curva_cont_trava = 20.0 (esperado 20.0)
- PASSOU: curva_cont_freio = 4.0 (esperado 4.0)
- PASSOU: desfazer_tensao_fora = 2.8 (esperado 2.8)
- PASSOU: desfazer_tensao_dentro = 1.6 (esperado 1.6)
- PASSOU: desfazer_tempo = 2.4 (esperado 2.4)
- PASSOU: recuo_sem_parede = 90.0 (esperado 90.0)
- PASSOU: ajuste_2a_tentativa = 12.0 (esperado 12.0)
- PASSOU: trava_frente_ate = 52.0 (esperado 52.0)
- PASSOU: arco_quase_pronto = 78.0 (esperado 78.0)
- PASSOU: ajuste_fino_max = 15.0 (esperado 15.0)
- PASSOU: curva_dir_fora = 0.0 (esperado 0.0)
- PASSOU: rumo_max_mm = 6.0 (esperado 6.0)
- PASSOU: rumo_max_lateral = 5.0 (esperado 5.0)
- PASSOU: re_vel = 70.0 (esperado 70.0)
- PASSOU: re_acel = 120.0 (esperado 120.0)
- PASSOU: bateria_minima = 5.5 (esperado 5.5)
- PASSOU: centralizar = 1.0 (esperado 1.0)
- PASSOU: ganho_rumo = 1.0 (esperado 1.0)

## E0 (tentativa 6) — FALHOU — 21:58:13

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- PASSOU: 53 chaves do calib no log (esperado 53)
- FALHOU: eixo_ate_frente = 87.0: esperado 100.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- FALHOU: largura_frente = 101.0: esperado 112.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- FALHOU: eixo_ate_tof_frente = 85.0: esperado 98.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- FALHOU: tof_lado_ao_centro = 50.5: esperado 55.5. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- FALHOU: escala_giro = 1.08: esperado 1.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 8.1 (esperado 8.1)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- FALHOU: ganho_parede = 0.8: esperado 3.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- FALHOU: max_parede = 16.0: esperado 50.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: folga_arco = 12.0 (esperado 12.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- FALHOU: antecipa_arco = 16.0: esperado 12.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- FALHOU: arco_esq_atraso = 0.0: esperado -14.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: curva_cont_vel = 80.0 (esperado 80.0)
- PASSOU: curva_cont_bitola = 100.0 (esperado 100.0)
- PASSOU: curva_cont_ganho = 1.0 (esperado 1.0)
- PASSOU: curva_cont_giro_max = 30.0 (esperado 30.0)
- PASSOU: curva_cont_trava = 20.0 (esperado 20.0)
- PASSOU: curva_cont_freio = 4.0 (esperado 4.0)
- PASSOU: desfazer_tensao_fora = 2.8 (esperado 2.8)
- PASSOU: desfazer_tensao_dentro = 1.6 (esperado 1.6)
- PASSOU: desfazer_tempo = 2.4 (esperado 2.4)
- PASSOU: recuo_sem_parede = 90.0 (esperado 90.0)
- PASSOU: ajuste_2a_tentativa = 12.0 (esperado 12.0)
- PASSOU: trava_frente_ate = 52.0 (esperado 52.0)
- PASSOU: arco_quase_pronto = 78.0 (esperado 78.0)
- PASSOU: ajuste_fino_max = 15.0 (esperado 15.0)
- PASSOU: curva_dir_fora = 0.0 (esperado 0.0)
- PASSOU: rumo_max_mm = 6.0 (esperado 6.0)
- PASSOU: rumo_max_lateral = 5.0 (esperado 5.0)
- PASSOU: giro_aberto = 0.0 (esperado 0.0)
- PASSOU: lado_aberto_mm = 150.0 (esperado 150.0)
- PASSOU: re_vel = 70.0 (esperado 70.0)
- PASSOU: re_acel = 120.0 (esperado 120.0)
- FALHOU: bateria_minima = 6.6: esperado 5.5. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- FALHOU: centralizar = 0.0: esperado 1.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- FALHOU: ganho_rumo = 0.0: esperado 1.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar

## E0 (tentativa 7) — FALHOU — 21:58:38

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- FALHOU: 51 chaves do calib no log (esperado 53)
- FALHOU: eixo_ate_frente = 87.0: esperado 100.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- FALHOU: largura_frente = 101.0: esperado 112.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- FALHOU: eixo_ate_tof_frente = 85.0: esperado 98.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- FALHOU: tof_lado_ao_centro = 50.5: esperado 55.5. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- FALHOU: escala_giro = 1.08: esperado 1.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 8.1 (esperado 8.1)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- FALHOU: ganho_parede = 0.8: esperado 3.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- FALHOU: max_parede = 16.0: esperado 50.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: folga_arco = 12.0 (esperado 12.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- FALHOU: antecipa_arco = 16.0: esperado 12.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- FALHOU: arco_esq_atraso = 0.0: esperado -14.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: curva_cont_vel = 80.0 (esperado 80.0)
- PASSOU: curva_cont_bitola = 100.0 (esperado 100.0)
- PASSOU: curva_cont_ganho = 1.0 (esperado 1.0)
- PASSOU: curva_cont_giro_max = 30.0 (esperado 30.0)
- PASSOU: curva_cont_trava = 20.0 (esperado 20.0)
- PASSOU: curva_cont_freio = 4.0 (esperado 4.0)
- PASSOU: desfazer_tensao_fora = 2.8 (esperado 2.8)
- PASSOU: desfazer_tensao_dentro = 1.6 (esperado 1.6)
- PASSOU: desfazer_tempo = 2.4 (esperado 2.4)
- PASSOU: recuo_sem_parede = 90.0 (esperado 90.0)
- PASSOU: ajuste_2a_tentativa = 12.0 (esperado 12.0)
- PASSOU: trava_frente_ate = 52.0 (esperado 52.0)
- PASSOU: arco_quase_pronto = 78.0 (esperado 78.0)
- PASSOU: ajuste_fino_max = 15.0 (esperado 15.0)
- PASSOU: curva_dir_fora = 0.0 (esperado 0.0)
- PASSOU: rumo_max_mm = 6.0 (esperado 6.0)
- PASSOU: rumo_max_lateral = 5.0 (esperado 5.0)
- PASSOU: giro_aberto = 0.0 (esperado 0.0)
- FALHOU: lado_aberto_mm = None: esperado 150.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: re_vel = 70.0 (esperado 70.0)
- PASSOU: re_acel = 120.0 (esperado 120.0)
- FALHOU: bateria_minima = None: esperado 5.5. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- FALHOU: centralizar = 0.0: esperado 1.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- FALHOU: ganho_rumo = 0.0: esperado 1.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar

- calibração (20/11 21:58:45): gravado no robô: giro_aberto=1

- calibração (20/11 21:58:48): gravado no robô: ganho_rumo=1.0 max_parede=50 escala_giro=1.00 antecipa_arco=12

- calibração (20/11 21:58:56): gravado no robô: eixo_ate_frente=100 eixo_ate_tof_frente=98 largura_frente=112

- calibração (20/11 21:58:59): gravado no robô: tof_lado_ao_centro=55.5 centralizar=1 ganho_parede=3

- calibração (20/11 21:59:01): gravado no robô: arco_esq_atraso=-14 bateria_minima=5.5

## E0 (tentativa 8) — FALHOU — 21:59:03

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- FALHOU: 52 chaves do calib no log (esperado 53)
- PASSOU: eixo_ate_frente = 100.0 (esperado 100.0)
- PASSOU: largura_frente = 112.0 (esperado 112.0)
- PASSOU: eixo_ate_tof_frente = 98.0 (esperado 98.0)
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 55.5 (esperado 55.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.0 (esperado 1.0)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 8.1 (esperado 8.1)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- PASSOU: ganho_parede = 3.0 (esperado 3.0)
- PASSOU: max_parede = 50.0 (esperado 50.0)
- PASSOU: folga_arco = 12.0 (esperado 12.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- PASSOU: antecipa_arco = 12.0 (esperado 12.0)
- PASSOU: arco_esq_atraso = -14.0 (esperado -14.0)
- PASSOU: curva_cont_vel = 80.0 (esperado 80.0)
- PASSOU: curva_cont_bitola = 100.0 (esperado 100.0)
- PASSOU: curva_cont_ganho = 1.0 (esperado 1.0)
- PASSOU: curva_cont_giro_max = 30.0 (esperado 30.0)
- PASSOU: curva_cont_trava = 20.0 (esperado 20.0)
- PASSOU: curva_cont_freio = 4.0 (esperado 4.0)
- PASSOU: desfazer_tensao_fora = 2.8 (esperado 2.8)
- PASSOU: desfazer_tensao_dentro = 1.6 (esperado 1.6)
- PASSOU: desfazer_tempo = 2.4 (esperado 2.4)
- PASSOU: recuo_sem_parede = 90.0 (esperado 90.0)
- PASSOU: ajuste_2a_tentativa = 12.0 (esperado 12.0)
- PASSOU: trava_frente_ate = 52.0 (esperado 52.0)
- PASSOU: arco_quase_pronto = 78.0 (esperado 78.0)
- PASSOU: ajuste_fino_max = 15.0 (esperado 15.0)
- PASSOU: curva_dir_fora = 0.0 (esperado 0.0)
- PASSOU: rumo_max_mm = 6.0 (esperado 6.0)
- PASSOU: rumo_max_lateral = 5.0 (esperado 5.0)
- FALHOU: giro_aberto = 1.0: esperado 0.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: lado_aberto_mm = 150.0 (esperado 150.0)
- PASSOU: re_vel = 70.0 (esperado 70.0)
- PASSOU: re_acel = 120.0 (esperado 120.0)
- FALHOU: bateria_minima = None: esperado 5.5. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: centralizar = 1.0 (esperado 1.0)
- PASSOU: ganho_rumo = 1.0 (esperado 1.0)

## E0 (tentativa 9) — FALHOU — 21:59:09

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- PASSOU: 53 chaves do calib no log (esperado 53)
- PASSOU: eixo_ate_frente = 100.0 (esperado 100.0)
- PASSOU: largura_frente = 112.0 (esperado 112.0)
- PASSOU: eixo_ate_tof_frente = 98.0 (esperado 98.0)
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 55.5 (esperado 55.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.0 (esperado 1.0)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 8.1 (esperado 8.1)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- PASSOU: ganho_parede = 3.0 (esperado 3.0)
- PASSOU: max_parede = 50.0 (esperado 50.0)
- PASSOU: folga_arco = 12.0 (esperado 12.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- PASSOU: antecipa_arco = 12.0 (esperado 12.0)
- PASSOU: arco_esq_atraso = -14.0 (esperado -14.0)
- PASSOU: curva_cont_vel = 80.0 (esperado 80.0)
- PASSOU: curva_cont_bitola = 100.0 (esperado 100.0)
- PASSOU: curva_cont_ganho = 1.0 (esperado 1.0)
- PASSOU: curva_cont_giro_max = 30.0 (esperado 30.0)
- PASSOU: curva_cont_trava = 20.0 (esperado 20.0)
- PASSOU: curva_cont_freio = 4.0 (esperado 4.0)
- PASSOU: desfazer_tensao_fora = 2.8 (esperado 2.8)
- PASSOU: desfazer_tensao_dentro = 1.6 (esperado 1.6)
- PASSOU: desfazer_tempo = 2.4 (esperado 2.4)
- PASSOU: recuo_sem_parede = 90.0 (esperado 90.0)
- PASSOU: ajuste_2a_tentativa = 12.0 (esperado 12.0)
- PASSOU: trava_frente_ate = 52.0 (esperado 52.0)
- PASSOU: arco_quase_pronto = 78.0 (esperado 78.0)
- PASSOU: ajuste_fino_max = 15.0 (esperado 15.0)
- PASSOU: curva_dir_fora = 0.0 (esperado 0.0)
- PASSOU: rumo_max_mm = 6.0 (esperado 6.0)
- PASSOU: rumo_max_lateral = 5.0 (esperado 5.0)
- FALHOU: giro_aberto = 1.0: esperado 0.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: lado_aberto_mm = 150.0 (esperado 150.0)
- PASSOU: re_vel = 70.0 (esperado 70.0)
- PASSOU: re_acel = 120.0 (esperado 120.0)
- PASSOU: bateria_minima = 5.5 (esperado 5.5)
- PASSOU: centralizar = 1.0 (esperado 1.0)
- PASSOU: ganho_rumo = 1.0 (esperado 1.0)

## E0 (tentativa 10) — FALHOU — 21:59:16

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- FALHOU: 50 chaves do calib no log (esperado 53)
- PASSOU: eixo_ate_frente = 100.0 (esperado 100.0)
- PASSOU: largura_frente = 112.0 (esperado 112.0)
- PASSOU: eixo_ate_tof_frente = 98.0 (esperado 98.0)
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 55.5 (esperado 55.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.0 (esperado 1.0)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 8.1 (esperado 8.1)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- PASSOU: ganho_parede = 3.0 (esperado 3.0)
- PASSOU: max_parede = 50.0 (esperado 50.0)
- PASSOU: folga_arco = 12.0 (esperado 12.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- PASSOU: antecipa_arco = 12.0 (esperado 12.0)
- PASSOU: arco_esq_atraso = -14.0 (esperado -14.0)
- PASSOU: curva_cont_vel = 80.0 (esperado 80.0)
- PASSOU: curva_cont_bitola = 100.0 (esperado 100.0)
- PASSOU: curva_cont_ganho = 1.0 (esperado 1.0)
- PASSOU: curva_cont_giro_max = 30.0 (esperado 30.0)
- PASSOU: curva_cont_trava = 20.0 (esperado 20.0)
- PASSOU: curva_cont_freio = 4.0 (esperado 4.0)
- PASSOU: desfazer_tensao_fora = 2.8 (esperado 2.8)
- PASSOU: desfazer_tensao_dentro = 1.6 (esperado 1.6)
- PASSOU: desfazer_tempo = 2.4 (esperado 2.4)
- PASSOU: recuo_sem_parede = 90.0 (esperado 90.0)
- PASSOU: ajuste_2a_tentativa = 12.0 (esperado 12.0)
- PASSOU: trava_frente_ate = 52.0 (esperado 52.0)
- PASSOU: arco_quase_pronto = 78.0 (esperado 78.0)
- PASSOU: ajuste_fino_max = 15.0 (esperado 15.0)
- PASSOU: curva_dir_fora = 0.0 (esperado 0.0)
- PASSOU: rumo_max_mm = 6.0 (esperado 6.0)
- PASSOU: rumo_max_lateral = 5.0 (esperado 5.0)
- FALHOU: giro_aberto = None: esperado 1.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- FALHOU: lado_aberto_mm = None: esperado 150.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: re_vel = 70.0 (esperado 70.0)
- PASSOU: re_acel = 120.0 (esperado 120.0)
- FALHOU: bateria_minima = None: esperado 5.5. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: centralizar = 1.0 (esperado 1.0)
- PASSOU: ganho_rumo = 1.0 (esperado 1.0)

## SERPENTINA-21 (tentativa 1) — corrida — FALHOU — 22:01:43

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 473792d com giro_aberto=1 (giro no lugar quando os dois ToF laterais leem >150 mm), arco_esq_atraso -14, ganho_rumo 1.0, max_parede 50, escala_giro 1.00, antecipa 12, bateria_minima 5.5; E=27 D=24 F=518. Log: logs/corridas/SERPENTINA-21/SERPENTINA-21_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 5
- celulas: 8
- posicao_final: l0,c1
- fora: 2
- tempo_s: 35.2
- s_por_passo: 7.24
- curvas: 4
- ajustes_antes_da_curva: 0
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 1
- curva_final_min: 50.3
- curva_final_max: 88.4
- reta_giro_max: 0.6
- lateral_pos_curva_min: 33
- rumo_perdido: 0
- curva_travada: 3
- tentativa2: 0
- paradas_pela_frente: 2
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (20/11 22:02:32): gravado no robô: curva_dir_fora=8

- calibração (20/11 22:02:35): gravado no robô: desfazer_tensao_fora=3.2 desfazer_tensao_dentro=1.8

## SERPENTINA-22 (tentativa 1) — corrida — FALHOU — 22:03:37

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 473792d com giro_aberto=1, curva_dir_fora=8 (recuo da curva a direita mira 8 mm a esquerda), desfazer 3.2/1.8 V 2.4 s, arco_esq_atraso -14, ganho_rumo 1.0, max_parede 50, escala_giro 1.00, antecipa 12, bateria_minima 5.5; E=26 D=27 F=514. Log: logs/corridas/SERPENTINA-22/SERPENTINA-22_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 5
- celulas: 8
- posicao_final: l0,c1
- fora: 2
- tempo_s: 35.2
- s_por_passo: 7.24
- curvas: 4
- ajustes_antes_da_curva: 0
- frontal_na_parada_min: 41
- frontal_na_parada_abaixo_40: 0
- curva_final_min: 52.9
- curva_final_max: 88.1
- reta_giro_max: 0.3
- lateral_pos_curva_min: 53
- rumo_perdido: 0
- curva_travada: 3
- tentativa2: 0
- paradas_pela_frente: 1
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (20/11 22:04:41): gravado no robô: folga_arco=18

- calibração (20/11 22:04:43): gravado no robô: desfazer_tensao_fora=3.6 desfazer_tensao_dentro=2.2

## SERPENTINA-23 (tentativa 1) — corrida — FALHOU — 22:06:09

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 473792d com giro_aberto=1, folga_arco 18 (arco da curva a direita comeca com frontal a 97 mm), desfazer 3.6/2.2 V 2.4 s, curva_dir_fora 8, arco_esq_atraso -14, ganho_rumo 1.0, max_parede 50, escala_giro 1.00, antecipa 12, bateria_minima 5.5; E=28 D=25 F=520. Log: logs/corridas/SERPENTINA-23/SERPENTINA-23_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 7
- celulas: 12
- posicao_final: l2,c3
- fora: 2
- tempo_s: 53.7
- s_por_passo: 7.92
- curvas: 8
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 2
- curva_final_min: 81.8
- curva_final_max: 89.1
- reta_giro_max: 0.7
- lateral_pos_curva_min: 0
- rumo_perdido: 3
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 3
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 8.1 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (20/11 22:07:34): gravado no robô: freio_pivo=4

- calibração (20/11 22:07:58): gravado no robô: rumo_max_lateral=8 max_parede=35

## E0 (tentativa 11) — PASSOU — 22:08:00

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- PASSOU: 53 chaves do calib no log (esperado 53)
- PASSOU: eixo_ate_frente = 100.0 (esperado 100.0)
- PASSOU: largura_frente = 112.0 (esperado 112.0)
- PASSOU: eixo_ate_tof_frente = 98.0 (esperado 98.0)
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 55.5 (esperado 55.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.0 (esperado 1.0)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 4.0 (esperado 4.0)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- PASSOU: ganho_parede = 3.0 (esperado 3.0)
- PASSOU: max_parede = 35.0 (esperado 35.0)
- PASSOU: folga_arco = 18.0 (esperado 18.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- PASSOU: antecipa_arco = 12.0 (esperado 12.0)
- PASSOU: arco_esq_atraso = -14.0 (esperado -14.0)
- PASSOU: curva_cont_vel = 80.0 (esperado 80.0)
- PASSOU: curva_cont_bitola = 100.0 (esperado 100.0)
- PASSOU: curva_cont_ganho = 1.0 (esperado 1.0)
- PASSOU: curva_cont_giro_max = 30.0 (esperado 30.0)
- PASSOU: curva_cont_trava = 20.0 (esperado 20.0)
- PASSOU: curva_cont_freio = 4.0 (esperado 4.0)
- PASSOU: desfazer_tensao_fora = 3.6 (esperado 3.6)
- PASSOU: desfazer_tensao_dentro = 2.2 (esperado 2.2)
- PASSOU: desfazer_tempo = 2.4 (esperado 2.4)
- PASSOU: recuo_sem_parede = 90.0 (esperado 90.0)
- PASSOU: ajuste_2a_tentativa = 12.0 (esperado 12.0)
- PASSOU: trava_frente_ate = 52.0 (esperado 52.0)
- PASSOU: arco_quase_pronto = 78.0 (esperado 78.0)
- PASSOU: ajuste_fino_max = 15.0 (esperado 15.0)
- PASSOU: curva_dir_fora = 8.0 (esperado 8.0)
- PASSOU: rumo_max_mm = 6.0 (esperado 6.0)
- PASSOU: rumo_max_lateral = 8.0 (esperado 8.0)
- PASSOU: giro_aberto = 1.0 (esperado 1.0)
- PASSOU: lado_aberto_mm = 150.0 (esperado 150.0)
- PASSOU: re_vel = 70.0 (esperado 70.0)
- PASSOU: re_acel = 120.0 (esperado 120.0)
- PASSOU: bateria_minima = 5.5 (esperado 5.5)
- PASSOU: centralizar = 1.0 (esperado 1.0)
- PASSOU: ganho_rumo = 1.0 (esperado 1.0)

## SERPENTINA-24 (tentativa 1) — corrida — FALHOU — 22:10:28

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 473792d com giro_aberto=1, freio_pivo 4, max_parede 35, rumo_max_lateral 8, folga_arco 18, desfazer 3.6/2.2 V, curva_dir_fora 8, arco_esq_atraso -14, ganho_rumo 1.0, escala_giro 1.00, antecipa 12, bateria_minima 5.5; E=34 D=20 F=516. Log: logs/corridas/SERPENTINA-24/SERPENTINA-24_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 7
- celulas: 12
- posicao_final: l2,c3
- fora: 2
- tempo_s: 55.3
- s_por_passo: 8.17
- curvas: 9
- ajustes_antes_da_curva: 2
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 2
- curva_final_min: 87.5
- curva_final_max: 89.1
- reta_giro_max: 1.8
- lateral_pos_curva_min: 0
- rumo_perdido: 3
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 3
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (20/11 22:13:15): gravado no robô: eixo_ate_frente=100 eixo_ate_tof_frente=98 largura_frente=112

- calibração (20/11 22:13:18): gravado no robô: tof_lado_ao_centro=55.5 centralizar=1 ganho_parede=3 max_parede=35

- calibração (20/11 22:13:21): gravado no robô: ganho_rumo=1.0 escala_giro=1.00 antecipa_arco=12 folga_arco=18

- calibração (20/11 22:13:24): gravado no robô: arco_esq_atraso=-14 bateria_minima=5.5 giro_aberto=1 freio_pivo=4

- calibração (20/11 22:13:27): gravado no robô: curva_dir_fora=8 desfazer_tensao_fora=3.6 desfazer_tensao_dentro=2.2 rumo_max_lateral=8 ajuste_fino_min=0.4

## E0 (tentativa 12) — FALHOU — 22:14:17

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- PASSOU: 54 chaves do calib no log (esperado 54)
- PASSOU: eixo_ate_frente = 100.0 (esperado 100.0)
- PASSOU: largura_frente = 112.0 (esperado 112.0)
- PASSOU: eixo_ate_tof_frente = 98.0 (esperado 98.0)
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 55.5 (esperado 55.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.0 (esperado 1.0)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 4.0 (esperado 4.0)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- PASSOU: ganho_parede = 3.0 (esperado 3.0)
- PASSOU: max_parede = 35.0 (esperado 35.0)
- PASSOU: folga_arco = 18.0 (esperado 18.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- PASSOU: antecipa_arco = 12.0 (esperado 12.0)
- PASSOU: arco_esq_atraso = -14.0 (esperado -14.0)
- PASSOU: curva_cont_vel = 80.0 (esperado 80.0)
- PASSOU: curva_cont_bitola = 100.0 (esperado 100.0)
- PASSOU: curva_cont_ganho = 1.0 (esperado 1.0)
- PASSOU: curva_cont_giro_max = 30.0 (esperado 30.0)
- PASSOU: curva_cont_trava = 20.0 (esperado 20.0)
- PASSOU: curva_cont_freio = 4.0 (esperado 4.0)
- PASSOU: desfazer_tensao_fora = 3.6 (esperado 3.6)
- PASSOU: desfazer_tensao_dentro = 2.2 (esperado 2.2)
- PASSOU: desfazer_tempo = 2.4 (esperado 2.4)
- PASSOU: recuo_sem_parede = 90.0 (esperado 90.0)
- PASSOU: ajuste_2a_tentativa = 12.0 (esperado 12.0)
- PASSOU: trava_frente_ate = 52.0 (esperado 52.0)
- PASSOU: arco_quase_pronto = 78.0 (esperado 78.0)
- FALHOU: ajuste_fino_min = 0.4: esperado 1.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: ajuste_fino_max = 15.0 (esperado 15.0)
- PASSOU: curva_dir_fora = 8.0 (esperado 8.0)
- PASSOU: rumo_max_mm = 6.0 (esperado 6.0)
- PASSOU: rumo_max_lateral = 8.0 (esperado 8.0)
- PASSOU: giro_aberto = 1.0 (esperado 1.0)
- PASSOU: lado_aberto_mm = 150.0 (esperado 150.0)
- PASSOU: re_vel = 70.0 (esperado 70.0)
- PASSOU: re_acel = 120.0 (esperado 120.0)
- PASSOU: bateria_minima = 5.5 (esperado 5.5)
- PASSOU: centralizar = 1.0 (esperado 1.0)
- PASSOU: ganho_rumo = 1.0 (esperado 1.0)

## SERPENTINA-25 (tentativa 1) — corrida — FALHOU — 22:15:39

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 6a81396: giro no lugar em celula aberta no ponto mais perto do centro + ajuste fino depois do giro, ajuste_fino_min 0.4, freio_pivo 4, max_parede 35, rumo_max_lateral 8, folga_arco 18, desfazer 3.6/2.2 V, curva_dir_fora 8, arco_esq_atraso -14, ganho_rumo 1.0, bateria_minima 5.5; E=28 D=22 F=518. Log: logs/corridas/SERPENTINA-25/SERPENTINA-25_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 7
- celulas: 12
- posicao_final: l2,c3
- fora: 2
- tempo_s: 72.0
- s_por_passo: 10.89
- curvas: 12
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 2
- curva_final_min: 43.8
- curva_final_max: 88.7
- reta_giro_max: 5.6
- lateral_pos_curva_min: 0
- rumo_perdido: 3
- curva_travada: 2
- tentativa2: 1
- paradas_pela_frente: 4
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (20/11 22:16:15): gravado no robô: max_parede=22 curva_dir_fora=0

## SERPENTINA-26 (tentativa 1) — corrida — FALHOU — 22:18:32

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 6a81396, max_parede 22 (correcao de parede suave: ~5 graus, abaixo do limite de aborto de 10), curva_dir_fora 0, giro no lugar centrado + ajuste fino, freio_pivo 4, folga_arco 18, desfazer 3.6/2.2, arco_esq_atraso -14, ganho_rumo 1.0, bateria_minima 5.5; E=32 D=18 F=518. Log: logs/corridas/SERPENTINA-26/SERPENTINA-26_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 7
- celulas: 12
- posicao_final: l2,c3
- fora: 2
- tempo_s: 68.1
- s_por_passo: 10.3
- curvas: 11
- ajustes_antes_da_curva: 2
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 2
- curva_final_min: 86.4
- curva_final_max: 88.9
- reta_giro_max: 0.5
- lateral_pos_curva_min: 0
- rumo_perdido: 3
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 3
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (20/11 22:23:56): gravado no robô: eixo_ate_frente=100 eixo_ate_tof_frente=98 largura_frente=112

- calibração (20/11 22:23:59): gravado no robô: tof_lado_ao_centro=55.5 centralizar=1 ganho_parede=3 max_parede=22

- calibração (20/11 22:24:02): gravado no robô: ganho_rumo=1.0 escala_giro=1.00 antecipa_arco=12 folga_arco=18

- calibração (20/11 22:24:05): gravado no robô: arco_esq_atraso=-14 bateria_minima=5.5 giro_aberto=1 freio_pivo=4

- calibração (20/11 22:24:07): gravado no robô: desfazer_tensao_fora=3.6 desfazer_tensao_dentro=2.2 rumo_max_lateral=8 ajuste_fino_min=0.4

- calibração (20/11 22:24:10): gravado no robô: alvo_lateral_dir_mm=10

## E0 (tentativa 13) — FALHOU — 22:24:12

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- FALHOU: 52 chaves do calib no log (esperado 55)
- PASSOU: eixo_ate_frente = 100.0 (esperado 100.0)
- PASSOU: largura_frente = 112.0 (esperado 112.0)
- PASSOU: eixo_ate_tof_frente = 98.0 (esperado 98.0)
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 55.5 (esperado 55.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.0 (esperado 1.0)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 4.0 (esperado 4.0)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- PASSOU: ganho_parede = 3.0 (esperado 3.0)
- PASSOU: max_parede = 22.0 (esperado 22.0)
- PASSOU: folga_arco = 18.0 (esperado 18.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- PASSOU: antecipa_arco = 12.0 (esperado 12.0)
- PASSOU: arco_esq_atraso = -14.0 (esperado -14.0)
- PASSOU: curva_cont_vel = 80.0 (esperado 80.0)
- PASSOU: curva_cont_bitola = 100.0 (esperado 100.0)
- PASSOU: curva_cont_ganho = 1.0 (esperado 1.0)
- PASSOU: curva_cont_giro_max = 30.0 (esperado 30.0)
- PASSOU: curva_cont_trava = 20.0 (esperado 20.0)
- PASSOU: curva_cont_freio = 4.0 (esperado 4.0)
- PASSOU: desfazer_tensao_fora = 3.6 (esperado 3.6)
- PASSOU: desfazer_tensao_dentro = 2.2 (esperado 2.2)
- PASSOU: desfazer_tempo = 2.4 (esperado 2.4)
- PASSOU: recuo_sem_parede = 90.0 (esperado 90.0)
- PASSOU: ajuste_2a_tentativa = 12.0 (esperado 12.0)
- PASSOU: trava_frente_ate = 52.0 (esperado 52.0)
- PASSOU: arco_quase_pronto = 78.0 (esperado 78.0)
- PASSOU: ajuste_fino_min = 0.4 (esperado 0.4)
- PASSOU: ajuste_fino_max = 15.0 (esperado 15.0)
- PASSOU: alvo_lateral_dir_mm = 10.0 (esperado 10.0)
- PASSOU: curva_dir_fora = 0.0 (esperado 0.0)
- PASSOU: rumo_max_mm = 6.0 (esperado 6.0)
- PASSOU: rumo_max_lateral = 8.0 (esperado 8.0)
- FALHOU: giro_aberto = None: esperado 1.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- FALHOU: lado_aberto_mm = None: esperado 150.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: re_vel = 70.0 (esperado 70.0)
- PASSOU: re_acel = 120.0 (esperado 120.0)
- FALHOU: bateria_minima = None: esperado 5.5. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: centralizar = 1.0 (esperado 1.0)
- PASSOU: ganho_rumo = 1.0 (esperado 1.0)

- calibração (20/11 22:25:00): gravado no robô: alvo_lateral_dir_mm=10

## SERPENTINA-27 (tentativa 1) — corrida — FALHOU — 22:25:22

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 59838e3 (calib13), alvo_lateral_dir_mm 10 (a centralizacao mira 10 mm a direita do centro: o cabo deixa o chassi mais largo a esquerda), max_parede 22, giro no lugar centrado + ajuste fino, freio_pivo 4, folga_arco 18, desfazer 3.6/2.2, arco_esq_atraso -14, ganho_rumo 1.0, bateria_minima 5.5; E=28 D=21 F=522. Log: logs/corridas/SERPENTINA-27/SERPENTINA-27_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 2
- celulas: 3
- posicao_final: l2,c0
- fora: 1
- tempo_s: 10.0
- s_por_passo: 3.68
- curvas: 0
- ajustes_antes_da_curva: 0
- reta_giro_max: 10.0
- rumo_perdido: 3
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 0
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (20/11 22:25:54): gravado no robô: alvo_lateral_dir_mm=0

## SERPENTINA-28 (tentativa 1) — corrida — FALHOU — 22:27:33

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware 59838e3 (calib13), RODA LIMPA pelo operador (estava prendendo), alvo_lateral_dir_mm 0, max_parede 22, giro no lugar centrado + ajuste fino, freio_pivo 4, folga_arco 18, desfazer 3.6/2.2, arco_esq_atraso -14, ganho_rumo 1.0, bateria_minima 5.5; E=30 D=20 F=520. Log: logs/corridas/SERPENTINA-28/SERPENTINA-28_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 5
- celulas: 8
- posicao_final: l0,c1
- fora: 2
- tempo_s: 41.4
- s_por_passo: 8.77
- curvas: 5
- ajustes_antes_da_curva: 0
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 1
- curva_final_min: 53.7
- curva_final_max: 89.0
- reta_giro_max: 0.9
- lateral_pos_curva_min: 45
- rumo_perdido: 0
- curva_travada: 3
- tentativa2: 0
- paradas_pela_frente: 2
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (20/11 22:30:45): gravado no robô: eixo_ate_frente=100 eixo_ate_tof_frente=98 largura_frente=112

- calibração (20/11 22:30:48): gravado no robô: tof_lado_ao_centro=55.5 centralizar=1 ganho_parede=3 max_parede=22

- calibração (20/11 22:30:51): gravado no robô: ganho_rumo=1.0 escala_giro=1.00 antecipa_arco=12 folga_arco=18

- calibração (20/11 22:30:54): gravado no robô: arco_esq_atraso=-14 bateria_minima=5.5 giro_aberto=1 freio_pivo=4

- calibração (20/11 22:30:57): gravado no robô: desfazer_tensao_fora=3.6 desfazer_tensao_dentro=2.2 rumo_max_lateral=8 ajuste_fino_min=0.4

- calibração (20/11 22:31:00): gravado no robô: alvo_pos_esq_mm=12

- calibração (20/11 22:31:41): gravado no robô: alvo_pos_esq_mm=12

## SERPENTINA-29 (tentativa 1) — corrida — FALHOU — 22:32:34

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware cd15948 (calib14), alvo_pos_esq_mm 12 (so a reta logo depois de curva/giro a esquerda mira 12 mm a direita: o cabo raspava na parede esquerda), roda limpa, max_parede 22, giro no lugar centrado + ajuste fino, freio_pivo 4, folga_arco 18, desfazer 3.6/2.2, arco_esq_atraso -14, ganho_rumo 1.0, bateria_minima 5.5; E=28 D=18 F=518. Log: logs/corridas/SERPENTINA-29/SERPENTINA-29_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 5
- celulas: 8
- posicao_final: l0,c1
- fora: 2
- tempo_s: 42.3
- s_por_passo: 9.0
- curvas: 5
- ajustes_antes_da_curva: 0
- frontal_na_parada_min: 45
- frontal_na_parada_abaixo_40: 0
- curva_final_min: 56.0
- curva_final_max: 88.9
- reta_giro_max: 0.0
- lateral_pos_curva_min: 43
- rumo_perdido: 0
- curva_travada: 3
- tentativa2: 0
- paradas_pela_frente: 1
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (21/11 17:48:54): gravado no robô: eixo_ate_frente=100 eixo_ate_tof_frente=98 largura_frente=112

- calibração (21/11 17:48:58): gravado no robô: tof_lado_ao_centro=55.5 centralizar=1 ganho_parede=3 max_parede=22

- calibração (21/11 17:49:01): gravado no robô: ganho_rumo=1.0 escala_giro=1.00 antecipa_arco=12 folga_arco=18

- calibração (21/11 17:49:56): gravado no robô: arco_esq_atraso=-14 bateria_minima=5.5 giro_aberto=1 freio_pivo=4

- calibração (21/11 17:50:00): gravado no robô: desfazer_tensao_fora=3.6 desfazer_tensao_dentro=2.2 rumo_max_lateral=8 ajuste_fino_min=0.4

- calibração (21/11 17:50:04): gravado no robô: alvo_pos_esq_mm=12

## E0 (tentativa 14) — PASSOU — 17:50:12

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- PASSOU: 60 chaves do calib no log (esperado 60)
- PASSOU: eixo_ate_frente = 100.0 (esperado 100.0)
- PASSOU: largura_frente = 112.0 (esperado 112.0)
- PASSOU: eixo_ate_tof_frente = 98.0 (esperado 98.0)
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 55.5 (esperado 55.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.0 (esperado 1.0)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 4.0 (esperado 4.0)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- PASSOU: ganho_parede = 3.0 (esperado 3.0)
- PASSOU: max_parede = 22.0 (esperado 22.0)
- PASSOU: folga_arco = 18.0 (esperado 18.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- PASSOU: antecipa_arco = 12.0 (esperado 12.0)
- PASSOU: arco_esq_atraso = -14.0 (esperado -14.0)
- PASSOU: curva_cont_vel = 80.0 (esperado 80.0)
- PASSOU: curva_cont_bitola = 100.0 (esperado 100.0)
- PASSOU: curva_cont_ganho = 1.0 (esperado 1.0)
- PASSOU: curva_cont_giro_max = 30.0 (esperado 30.0)
- PASSOU: curva_cont_trava = 20.0 (esperado 20.0)
- PASSOU: curva_cont_freio = 4.0 (esperado 4.0)
- PASSOU: desfazer_tensao_fora = 3.6 (esperado 3.6)
- PASSOU: desfazer_tensao_dentro = 2.2 (esperado 2.2)
- PASSOU: desfazer_tempo = 2.4 (esperado 2.4)
- PASSOU: recuo_sem_parede = 90.0 (esperado 90.0)
- PASSOU: ajuste_2a_tentativa = 12.0 (esperado 12.0)
- PASSOU: trava_frente_ate = 52.0 (esperado 52.0)
- PASSOU: arco_quase_pronto = 78.0 (esperado 78.0)
- PASSOU: ajuste_fino_min = 0.4 (esperado 0.4)
- PASSOU: ajuste_fino_max = 15.0 (esperado 15.0)
- PASSOU: alvo_lateral_dir_mm = 0.0 (esperado 0.0)
- PASSOU: alvo_pos_esq_mm = 12.0 (esperado 12.0)
- PASSOU: curva_dir_fora = 0.0 (esperado 0.0)
- PASSOU: rumo_max_mm = 6.0 (esperado 6.0)
- PASSOU: rumo_max_lateral = 8.0 (esperado 8.0)
- PASSOU: giro_aberto = 1.0 (esperado 1.0)
- PASSOU: lado_aberto_mm = 150.0 (esperado 150.0)
- PASSOU: cabo_esq_mm = 10.0 (esperado 10.0)
- PASSOU: giro_s_beta_max = 25.0 (esperado 25.0)
- PASSOU: giro_s_folga = 3.0 (esperado 3.0)
- PASSOU: giro_s_incerteza = 10.0 (esperado 10.0)
- PASSOU: re_vel = 70.0 (esperado 70.0)
- PASSOU: re_acel = 120.0 (esperado 120.0)
- PASSOU: bateria_minima = 5.5 (esperado 5.5)
- PASSOU: centralizar = 1.0 (esperado 1.0)
- PASSOU: ganho_rumo = 1.0 (esperado 1.0)

- calibração (21/11 18:02:51): gravado no robô: eixo_ate_tof_frente=92

## SERPENTINA-30 (tentativa 1) — corrida — PASSOU — 18:06:27

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-2-g13d515a (curva em S, calib15), eixo_ate_tof_frente 92 (medido perto da parede), cabo_esq_mm 10, giro_aberto 1, calib de 20/11 reaplicado, largada E=30 D=17 F=522. Log: logs/corridas/SERPENTINA-30/SERPENTINA-30_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: SUCESSO
- passos: 7
- celulas: 14
- posicao_final: l0,c3
- fora: 3
- tempo_s: 52.5
- s_por_passo: 7.71
- curvas: 13
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 1
- curva_final_min: 88.1
- curva_final_max: 88.9
- reta_giro_max: 2.1
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 3
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 330
- quedas_tof: 1
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (21/11 18:08:26): gravado no robô: eixo_ate_tof_frente=88

- calibração (21/11 18:08:30): gravado no robô: max_parede=35

## SERPENTINA-31 (tentativa 1) — corrida — PASSOU — 18:09:44

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-2-g13d515a (curva em S, calib15), eixo_ate_tof_frente 88 (era 92: afasta a diagonal da parede direita), max_parede 35 (era 22: a correcao lateral travava em 7.8 mm e o robo ficava 14-22 mm a direita), cabo_esq_mm 10, giro_aberto 1; largada E=36 D=10 F=527 (13 mm a direita do centro). Log: logs/corridas/SERPENTINA-31/SERPENTINA-31_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: SUCESSO
- passos: 7
- celulas: 14
- posicao_final: l0,c3
- fora: 3
- tempo_s: 53.5
- s_por_passo: 7.87
- curvas: 13
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 1
- curva_final_min: 88.2
- curva_final_max: 88.9
- reta_giro_max: 0.2
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 4
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 330
- quedas_tof: 1
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (21/11 18:10:27): gravado no robô: alvo_pos_esq_mm=6

- calibração (21/11 18:10:56): gravado no robô: eixo_ate_tof_frente=84

## SERPENTINA-32 (tentativa 1) — corrida — FALHOU — 18:11:52

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-2-g13d515a (curva em S, calib15), eixo_ate_tof_frente 84 (era 88: a curva em S da 31 ainda encostou a frente direita na parede de fora), max_parede 35, alvo_pos_esq_mm 6 (era 12), cabo_esq_mm 10, giro_aberto 1; largada E=28 D=19 F=523. Log: logs/corridas/SERPENTINA-32/SERPENTINA-32_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 4
- celulas: 6
- posicao_final: l2,c1
- fora: 1
- tempo_s: 23.2
- s_por_passo: 5.62
- curvas: 3
- ajustes_antes_da_curva: 0
- curva_final_min: 88.2
- curva_final_max: 88.2
- reta_giro_max: 2.0
- lateral_pos_curva_min: 190
- rumo_perdido: 0
- curva_travada: 3
- tentativa2: 0
- paradas_pela_frente: 1
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 330
- quedas_tof: 1
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (21/11 18:12:40): gravado no robô: eixo_ate_tof_frente=88

## SERPENTINA-33b (tentativa 1) — corrida — PASSOU — 18:16:23

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-2-g13d515a (curva em S, calib15), eixo_ate_tof_frente 88 (volta do 84, que travou a curva em S a 57.5 graus na 32), max_parede 35, alvo_pos_esq_mm 6, cabo_esq_mm 10, giro_aberto 1; robo reiniciado antes (a 33 nao largou: estado de erro da 32); largada E=33 D=16 F=521. Log: logs/corridas/SERPENTINA-33b/SERPENTINA-33b_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: SUCESSO
- passos: 7
- celulas: 14
- posicao_final: l0,c3
- fora: 3
- tempo_s: 53.6
- s_por_passo: 7.89
- curvas: 13
- ajustes_antes_da_curva: 2
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 2
- curva_final_min: 88.2
- curva_final_max: 88.7
- reta_giro_max: 0.4
- lateral_pos_curva_min: 1
- rumo_perdido: 0
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 5
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

## SERPENTINA-34 (tentativa 1) — corrida — PASSOU — 18:18:20

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-2-g13d515a (curva em S, calib15), eixo_ate_tof_frente 88, max_parede 35, alvo_pos_esq_mm 6, cabo_esq_mm 10, giro_aberto 1 (configuracao da 33b, 2a de 3 seguidas); largada E=26 D=25 F=512. Log: logs/corridas/SERPENTINA-34/SERPENTINA-34_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: SUCESSO
- passos: 7
- celulas: 14
- posicao_final: l0,c3
- fora: 3
- tempo_s: 53.7
- s_por_passo: 7.9
- curvas: 13
- ajustes_antes_da_curva: 2
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 2
- curva_final_min: 88.2
- curva_final_max: 88.9
- reta_giro_max: 0.7
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 3
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (21/11 18:19:19): gravado no robô: curva_dir_fora=8

## SERPENTINA-35 (tentativa 1) — corrida — FALHOU — 18:20:08

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-2-g13d515a (curva em S, calib15), eixo_ate_tof_frente 88, max_parede 35, alvo_pos_esq_mm 6, curva_dir_fora 8 (novo: a saida dos arcos a direita ficava 22-27 mm a direita do centro e o robo arrastava na parede direita), cabo_esq_mm 10, giro_aberto 1; largada E=28 D=21 F=512. Log: logs/corridas/SERPENTINA-35/SERPENTINA-35_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 4
- celulas: 6
- posicao_final: l2,c1
- fora: 1
- tempo_s: 23.2
- s_por_passo: 5.63
- curvas: 3
- ajustes_antes_da_curva: 0
- curva_final_min: 88.5
- curva_final_max: 88.5
- reta_giro_max: 0.7
- lateral_pos_curva_min: 194
- rumo_perdido: 0
- curva_travada: 3
- tentativa2: 0
- paradas_pela_frente: 1
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

## SERPENTINA-36 (tentativa 1) — corrida — PASSOU — 18:26:04

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-2-g13d515a (curva em S, calib15), eixo_ate_tof_frente 88, max_parede 35, alvo_pos_esq_mm 6, curva_dir_fora 8, cabo_esq_mm 10, giro_aberto 1; RODAS LIMPAS pelo operador (a 35 travou a curva em S por escorregamento); robo desligado e religado antes; largada E=24 D=26 F=522. Log: logs/corridas/SERPENTINA-36/SERPENTINA-36_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: SUCESSO
- passos: 7
- celulas: 14
- posicao_final: l0,c3
- fora: 3
- tempo_s: 51.6
- s_por_passo: 7.55
- curvas: 13
- ajustes_antes_da_curva: 0
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 1
- curva_final_min: 88.4
- curva_final_max: 89.0
- reta_giro_max: 0.9
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 3
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (21/11 18:27:12): gravado no robô: alvo_lateral_dir_mm=-4 alvo_pos_esq_mm=0

- calibração (21/11 18:27:16): gravado no robô: eixo_ate_tof_frente=84

## SERPENTINA-37 (tentativa 1) — corrida — FALHOU — 18:28:17

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-2-g13d515a (curva em S, calib15), eixo_ate_tof_frente 84 (retorno ao 84 com rodas limpas), alvo_lateral_dir_mm -4 (novo: mira 4 mm a esquerda), alvo_pos_esq_mm 0 (era 6), max_parede 35, curva_dir_fora 8, cabo_esq_mm 10, giro_aberto 1; largada E=30 D=19 F=523. Log: logs/corridas/SERPENTINA-37/SERPENTINA-37_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 4
- celulas: 6
- posicao_final: l2,c1
- fora: 1
- tempo_s: 23.2
- s_por_passo: 5.63
- curvas: 3
- ajustes_antes_da_curva: 0
- curva_final_min: 88.4
- curva_final_max: 88.4
- reta_giro_max: 1.3
- lateral_pos_curva_min: 201
- rumo_perdido: 0
- curva_travada: 3
- tentativa2: 0
- paradas_pela_frente: 1
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (21/11 18:42:09): gravado no robô: eixo_ate_tof_frente=88

## SERPENTINA-38 (tentativa 1) — corrida — PASSOU — 18:54:11

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-3-g9336850 (curva em S COM 2a tentativa quando o 1o giro trava), eixo_ate_tof_frente 88, max_parede 35, alvo_lateral_dir_mm -4, alvo_pos_esq_mm 0, curva_dir_fora 8, cabo_esq_mm 10, giro_aberto 1; ToF direito recuperado por tofrec antes (caiu 2x); largada E=26 D=23 F=519. Log: logs/corridas/SERPENTINA-38/SERPENTINA-38_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: SUCESSO
- passos: 7
- celulas: 14
- posicao_final: l0,c3
- fora: 3
- tempo_s: 53.0
- s_por_passo: 7.79
- curvas: 13
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 1
- curva_final_min: 88.4
- curva_final_max: 88.9
- reta_giro_max: 0.1
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 3
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (21/11 18:55:34): gravado no robô: alvo_lateral_dir_mm=-8

## SERPENTINA-39 (tentativa 1) — corrida — FALHOU — 18:57:05

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-3-g9336850 (curva em S com 2a tentativa), eixo_ate_tof_frente 88, max_parede 35, alvo_lateral_dir_mm -8 (novo, era -4: as retas ainda terminavam 6-12 mm a direita e arrastavam na parede direita na 3a curva a direita e na ultima), alvo_pos_esq_mm 0, curva_dir_fora 8, cabo_esq_mm 10, giro_aberto 1; 1a de 3 seguidas; largada E=22 D=27 F=514. Log: logs/corridas/SERPENTINA-39/SERPENTINA-39_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 7
- celulas: 12
- posicao_final: l2,c3
- fora: 2
- tempo_s: 47.2
- s_por_passo: 6.82
- curvas: 11
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 1
- curva_final_min: 88.2
- curva_final_max: 88.9
- reta_giro_max: 1.7
- lateral_pos_curva_min: 0
- rumo_perdido: 3
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 2
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

## SERPENTINA-40 (tentativa 1) — corrida — PASSOU — 19:03:50

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-4-g264ef77 (curva em S com 2a tentativa e diagonal tolerando 18 graus), eixo_ate_tof_frente 88, max_parede 35, alvo_lateral_dir_mm -8, alvo_pos_esq_mm 0, curva_dir_fora 8, cabo_esq_mm 10, giro_aberto 1; 1a de 3 seguidas; largada E=26 D=22 F=517. Log: logs/corridas/SERPENTINA-40/SERPENTINA-40_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: SUCESSO
- passos: 7
- celulas: 14
- posicao_final: l0,c3
- fora: 3
- tempo_s: 52.7
- s_por_passo: 7.74
- curvas: 13
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 2
- curva_final_min: 88.5
- curva_final_max: 88.8
- reta_giro_max: 1.0
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 4
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

## SERPENTINA-41 (tentativa 1) — corrida — PASSOU — 19:06:33

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-4-g264ef77 (curva em S com 2a tentativa e diagonal tolerando 18 graus), eixo_ate_tof_frente 88, max_parede 35, alvo_lateral_dir_mm -8, alvo_pos_esq_mm 0, curva_dir_fora 8, cabo_esq_mm 10, giro_aberto 1; 2a de 3 seguidas; largada E=20 D=28 F=527. Log: logs/corridas/SERPENTINA-41/SERPENTINA-41_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: SUCESSO
- passos: 7
- celulas: 14
- posicao_final: l0,c3
- fora: 3
- tempo_s: 52.5
- s_por_passo: 7.71
- curvas: 13
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 1
- curva_final_min: 88.1
- curva_final_max: 88.8
- reta_giro_max: 1.0
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 3
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

## SERPENTINA-42 (tentativa 1) — corrida — PASSOU — 19:10:32

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-4-g264ef77 (curva em S com 2a tentativa e diagonal tolerando 18 graus), eixo_ate_tof_frente 88, max_parede 35, alvo_lateral_dir_mm -8, alvo_pos_esq_mm 0, curva_dir_fora 8, cabo_esq_mm 10, giro_aberto 1; 3a de 3 seguidas; largada E=24 D=24 F=522. Log: logs/corridas/SERPENTINA-42/SERPENTINA-42_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: SUCESSO
- passos: 7
- celulas: 14
- posicao_final: l0,c3
- fora: 3
- tempo_s: 53.3
- s_por_passo: 7.85
- curvas: 12
- ajustes_antes_da_curva: 2
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 2
- curva_final_min: 88.3
- curva_final_max: 88.9
- reta_giro_max: 0.8
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 4
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

## E0 (tentativa 15) — FALHOU — 19:10:42

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- PASSOU: 60 chaves do calib no log (esperado 60)
- PASSOU: eixo_ate_frente = 100.0 (esperado 100.0)
- PASSOU: largura_frente = 112.0 (esperado 112.0)
- FALHOU: eixo_ate_tof_frente = 88.0: esperado 98.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 55.5 (esperado 55.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.0 (esperado 1.0)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 4.0 (esperado 4.0)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- PASSOU: ganho_parede = 3.0 (esperado 3.0)
- FALHOU: max_parede = 35.0: esperado 22.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: folga_arco = 18.0 (esperado 18.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- PASSOU: antecipa_arco = 12.0 (esperado 12.0)
- PASSOU: arco_esq_atraso = -14.0 (esperado -14.0)
- PASSOU: curva_cont_vel = 80.0 (esperado 80.0)
- PASSOU: curva_cont_bitola = 100.0 (esperado 100.0)
- PASSOU: curva_cont_ganho = 1.0 (esperado 1.0)
- PASSOU: curva_cont_giro_max = 30.0 (esperado 30.0)
- PASSOU: curva_cont_trava = 20.0 (esperado 20.0)
- PASSOU: curva_cont_freio = 4.0 (esperado 4.0)
- PASSOU: desfazer_tensao_fora = 3.6 (esperado 3.6)
- PASSOU: desfazer_tensao_dentro = 2.2 (esperado 2.2)
- PASSOU: desfazer_tempo = 2.4 (esperado 2.4)
- PASSOU: recuo_sem_parede = 90.0 (esperado 90.0)
- PASSOU: ajuste_2a_tentativa = 12.0 (esperado 12.0)
- PASSOU: trava_frente_ate = 52.0 (esperado 52.0)
- PASSOU: arco_quase_pronto = 78.0 (esperado 78.0)
- PASSOU: ajuste_fino_min = 0.4 (esperado 0.4)
- PASSOU: ajuste_fino_max = 15.0 (esperado 15.0)
- FALHOU: alvo_lateral_dir_mm = -8.0: esperado 0.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- FALHOU: alvo_pos_esq_mm = 0.0: esperado 12.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- FALHOU: curva_dir_fora = 8.0: esperado 0.0. Memória antiga? Rode 'calib padrao' e reaplique ganho_rumo e centralizar
- PASSOU: rumo_max_mm = 6.0 (esperado 6.0)
- PASSOU: rumo_max_lateral = 8.0 (esperado 8.0)
- PASSOU: giro_aberto = 1.0 (esperado 1.0)
- PASSOU: lado_aberto_mm = 150.0 (esperado 150.0)
- PASSOU: cabo_esq_mm = 10.0 (esperado 10.0)
- PASSOU: giro_s_beta_max = 25.0 (esperado 25.0)
- PASSOU: giro_s_folga = 3.0 (esperado 3.0)
- PASSOU: giro_s_incerteza = 10.0 (esperado 10.0)
- PASSOU: re_vel = 70.0 (esperado 70.0)
- PASSOU: re_acel = 120.0 (esperado 120.0)
- PASSOU: bateria_minima = 5.5 (esperado 5.5)
- PASSOU: centralizar = 1.0 (esperado 1.0)
- PASSOU: ganho_rumo = 1.0 (esperado 1.0)

## E0 (tentativa 16) — PASSOU — 19:10:57

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- PASSOU: 60 chaves do calib no log (esperado 60)
- PASSOU: eixo_ate_frente = 100.0 (esperado 100.0)
- PASSOU: largura_frente = 112.0 (esperado 112.0)
- PASSOU: eixo_ate_tof_frente = 88.0 (esperado 88.0)
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 55.5 (esperado 55.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.0 (esperado 1.0)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 4.0 (esperado 4.0)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- PASSOU: ganho_parede = 3.0 (esperado 3.0)
- PASSOU: max_parede = 35.0 (esperado 35.0)
- PASSOU: folga_arco = 18.0 (esperado 18.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- PASSOU: antecipa_arco = 12.0 (esperado 12.0)
- PASSOU: arco_esq_atraso = -14.0 (esperado -14.0)
- PASSOU: curva_cont_vel = 80.0 (esperado 80.0)
- PASSOU: curva_cont_bitola = 100.0 (esperado 100.0)
- PASSOU: curva_cont_ganho = 1.0 (esperado 1.0)
- PASSOU: curva_cont_giro_max = 30.0 (esperado 30.0)
- PASSOU: curva_cont_trava = 20.0 (esperado 20.0)
- PASSOU: curva_cont_freio = 4.0 (esperado 4.0)
- PASSOU: desfazer_tensao_fora = 3.6 (esperado 3.6)
- PASSOU: desfazer_tensao_dentro = 2.2 (esperado 2.2)
- PASSOU: desfazer_tempo = 2.4 (esperado 2.4)
- PASSOU: recuo_sem_parede = 90.0 (esperado 90.0)
- PASSOU: ajuste_2a_tentativa = 12.0 (esperado 12.0)
- PASSOU: trava_frente_ate = 52.0 (esperado 52.0)
- PASSOU: arco_quase_pronto = 78.0 (esperado 78.0)
- PASSOU: ajuste_fino_min = 0.4 (esperado 0.4)
- PASSOU: ajuste_fino_max = 15.0 (esperado 15.0)
- PASSOU: alvo_lateral_dir_mm = -8.0 (esperado -8.0)
- PASSOU: alvo_pos_esq_mm = 0.0 (esperado 0.0)
- PASSOU: curva_dir_fora = 8.0 (esperado 8.0)
- PASSOU: rumo_max_mm = 6.0 (esperado 6.0)
- PASSOU: rumo_max_lateral = 8.0 (esperado 8.0)
- PASSOU: giro_aberto = 1.0 (esperado 1.0)
- PASSOU: lado_aberto_mm = 150.0 (esperado 150.0)
- PASSOU: cabo_esq_mm = 10.0 (esperado 10.0)
- PASSOU: giro_s_beta_max = 25.0 (esperado 25.0)
- PASSOU: giro_s_folga = 3.0 (esperado 3.0)
- PASSOU: giro_s_incerteza = 10.0 (esperado 10.0)
- PASSOU: re_vel = 70.0 (esperado 70.0)
- PASSOU: re_acel = 120.0 (esperado 120.0)
- PASSOU: bateria_minima = 5.5 (esperado 5.5)
- PASSOU: centralizar = 1.0 (esperado 1.0)
- PASSOU: ganho_rumo = 1.0 (esperado 1.0)

## SERPENTINA-43 (tentativa 1) — corrida — PASSOU — 19:16:32

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-4-g264ef77, eixo_ate_tof_frente 88, max_parede 35, alvo_lateral_dir_mm -8, alvo_pos_esq_mm 0, curva_dir_fora 8, cabo_esq_mm 10, giro_aberto 1; corrida extra depois das 3 seguidas (40-42); largada E=32 D=14 F=520 (9 mm a direita). Log: logs/corridas/SERPENTINA-43/SERPENTINA-43_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: SUCESSO
- passos: 7
- celulas: 14
- posicao_final: l0,c3
- fora: 3
- tempo_s: 57.1
- s_por_passo: 8.46
- curvas: 15
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 1
- curva_final_min: 88.3
- curva_final_max: 89.0
- reta_giro_max: 0.4
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 1
- tentativa2: 0
- paradas_pela_frente: 3
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

## SERPENTINA-44 (tentativa 1) — corrida — FALHOU — 19:19:04

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-4-g264ef77, eixo_ate_tof_frente 88, max_parede 35, alvo_lateral_dir_mm -8, alvo_pos_esq_mm 0, curva_dir_fora 8, cabo_esq_mm 10, giro_aberto 1; robo religado antes; largada E=25 D=24 F=518. Se travar, o operador segura o robo e eu leio os sensores no ponto do erro. Log: logs/corridas/SERPENTINA-44/SERPENTINA-44_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 6
- celulas: 9
- posicao_final: l2,c3
- fora: 2
- tempo_s: 43.6
- s_por_passo: 7.47
- curvas: 10
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 1
- curva_final_min: 88.3
- curva_final_max: 89.0
- reta_giro_max: 1.0
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 2
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

## SERPENTINA-45 (tentativa 1) — corrida — FALHOU — 19:21:32

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-4-g264ef77, eixo_ate_tof_frente 88, max_parede 35, alvo_lateral_dir_mm -8, alvo_pos_esq_mm 0, curva_dir_fora 8, cabo_esq_mm 10, giro_aberto 1; refeita depois da 44 (parada pelo operador); robo reiniciado antes; largada E=27 D=20 F=521. Log: logs/corridas/SERPENTINA-45/SERPENTINA-45_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 6
- celulas: 9
- posicao_final: l1,c2
- fora: 2
- tempo_s: 40.7
- s_por_passo: 6.91
- curvas: 9
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 2
- curva_final_min: 88.2
- curva_final_max: 89.0
- reta_giro_max: 0.8
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 2
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (21/11 19:23:11): gravado no robô: curva_continua=0

## SERPENTINA-46 (tentativa 1) — corrida — FALHOU — 19:25:31

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-4-g264ef77, curva_continua 0 (NOVO: a curva continua do passo 6 saia torta e arrastava na parede direita; as corridas 44 e 45 foram paradas pelo operador ali), eixo_ate_tof_frente 88, max_parede 35, alvo_lateral_dir_mm -8, alvo_pos_esq_mm 0, curva_dir_fora 8, cabo_esq_mm 10, giro_aberto 1; largada E=26 D=23 F=522. Log: logs/corridas/SERPENTINA-46/SERPENTINA-46_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 6
- celulas: 9
- posicao_final: l2,c2
- fora: 0
- tempo_s: 43.2
- s_por_passo: 7.38
- curvas: 9
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 1
- curva_final_min: 88.5
- curva_final_max: 88.9
- reta_giro_max: 1.3
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 2
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (21/11 19:26:31): gravado no robô: curva_dir_fora=16

## SERPENTINA-47 (tentativa 1) — corrida — FALHOU — 19:28:09

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-4-g264ef77, curva_continua 0, curva_dir_fora 16 (NOVO, era 8: o arco a direita do passo 5/6 saia colado na parede direita), eixo_ate_tof_frente 88, max_parede 35, alvo_lateral_dir_mm -8, alvo_pos_esq_mm 0, cabo_esq_mm 10, giro_aberto 1; largada E=27 D=21 F=520; operador para no ponto exato do erro. Log: logs/corridas/SERPENTINA-47/SERPENTINA-47_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 4
- celulas: 6
- posicao_final: l2,c1
- fora: 0
- tempo_s: 27.0
- s_por_passo: 6.9
- curvas: 5
- ajustes_antes_da_curva: 0
- curva_final_min: 88.1
- curva_final_max: 88.1
- reta_giro_max: 1.6
- lateral_pos_curva_min: 185
- rumo_perdido: 0
- curva_travada: 3
- tentativa2: 0
- paradas_pela_frente: 1
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (21/11 19:29:25): gravado no robô: ajuste_2a_tentativa=24

## SERPENTINA-48 (tentativa 1) — corrida — FALHOU — 19:31:29

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-4-g264ef77, curva_continua 0, curva_dir_fora 16, ajuste_2a_tentativa 24 (NOVO, era 12: a 2a tentativa da curva em S desloca o eixo 12 mm em vez de 6; na 47 o recuo de 6 mm adiantou o travamento de 38.7 para 46.2 graus mas nao bastou), eixo_ate_tof_frente 88, max_parede 35, alvo_lateral_dir_mm -8, alvo_pos_esq_mm 0, cabo_esq_mm 10, giro_aberto 1; largada E=26 D=23 F=526. Log: logs/corridas/SERPENTINA-48/SERPENTINA-48_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 7
- celulas: 11
- posicao_final: l2,c3
- fora: 0
- tempo_s: 52.1
- s_por_passo: 7.64
- curvas: 12
- ajustes_antes_da_curva: 0
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 1
- curva_final_min: 55.5
- curva_final_max: 88.8
- reta_giro_max: 0.8
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 3
- tentativa2: 0
- paradas_pela_frente: 2
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (21/11 19:32:11): gravado no robô: curva_continua=1 curva_dir_fora=8

## SERPENTINA-49 (tentativa 1) — corrida — PASSOU — 19:34:12

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-4-g264ef77, curva_continua 1 (de volta: a 48 com ela desligada travou o arco parado em (l2,c2)), curva_dir_fora 8, ajuste_2a_tentativa 24 (2a tentativa da curva em S desloca 12 mm), eixo_ate_tof_frente 88, max_parede 35, alvo_lateral_dir_mm -8, alvo_pos_esq_mm 0, cabo_esq_mm 10, giro_aberto 1; largada E=29 D=17 F=528. Log: logs/corridas/SERPENTINA-49/SERPENTINA-49_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: SUCESSO
- passos: 7
- celulas: 14
- posicao_final: l0,c3
- fora: 3
- tempo_s: 53.1
- s_por_passo: 7.82
- curvas: 13
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 2
- curva_final_min: 88.6
- curva_final_max: 88.8
- reta_giro_max: 2.2
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 4
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

## SERPENTINA-50 (tentativa 1) — corrida — PASSOU — 19:35:56

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-4-g264ef77, curva_continua 1, curva_dir_fora 8, ajuste_2a_tentativa 24, eixo_ate_tof_frente 88, max_parede 35, alvo_lateral_dir_mm -8, alvo_pos_esq_mm 0, cabo_esq_mm 10, giro_aberto 1; 2a seguida com a configuracao da 49; largada E=22 D=27 F=526. Log: logs/corridas/SERPENTINA-50/SERPENTINA-50_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: SUCESSO
- passos: 7
- celulas: 14
- posicao_final: l0,c3
- fora: 3
- tempo_s: 52.3
- s_por_passo: 7.67
- curvas: 13
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 41
- frontal_na_parada_abaixo_40: 0
- curva_final_min: 88.4
- curva_final_max: 88.9
- reta_giro_max: 0.5
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 3
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

## E0 (tentativa 17) — PASSOU — 19:36:48

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- PASSOU: 60 chaves do calib no log (esperado 60)
- PASSOU: eixo_ate_frente = 100.0 (esperado 100.0)
- PASSOU: largura_frente = 112.0 (esperado 112.0)
- PASSOU: eixo_ate_tof_frente = 88.0 (esperado 88.0)
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 55.5 (esperado 55.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.0 (esperado 1.0)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 4.0 (esperado 4.0)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- PASSOU: ganho_parede = 3.0 (esperado 3.0)
- PASSOU: max_parede = 35.0 (esperado 35.0)
- PASSOU: folga_arco = 18.0 (esperado 18.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- PASSOU: antecipa_arco = 12.0 (esperado 12.0)
- PASSOU: arco_esq_atraso = -14.0 (esperado -14.0)
- PASSOU: curva_cont_vel = 80.0 (esperado 80.0)
- PASSOU: curva_cont_bitola = 100.0 (esperado 100.0)
- PASSOU: curva_cont_ganho = 1.0 (esperado 1.0)
- PASSOU: curva_cont_giro_max = 30.0 (esperado 30.0)
- PASSOU: curva_cont_trava = 20.0 (esperado 20.0)
- PASSOU: curva_cont_freio = 4.0 (esperado 4.0)
- PASSOU: desfazer_tensao_fora = 3.6 (esperado 3.6)
- PASSOU: desfazer_tensao_dentro = 2.2 (esperado 2.2)
- PASSOU: desfazer_tempo = 2.4 (esperado 2.4)
- PASSOU: recuo_sem_parede = 90.0 (esperado 90.0)
- PASSOU: ajuste_2a_tentativa = 24.0 (esperado 24.0)
- PASSOU: trava_frente_ate = 52.0 (esperado 52.0)
- PASSOU: arco_quase_pronto = 78.0 (esperado 78.0)
- PASSOU: ajuste_fino_min = 0.4 (esperado 0.4)
- PASSOU: ajuste_fino_max = 15.0 (esperado 15.0)
- PASSOU: alvo_lateral_dir_mm = -8.0 (esperado -8.0)
- PASSOU: alvo_pos_esq_mm = 0.0 (esperado 0.0)
- PASSOU: curva_dir_fora = 8.0 (esperado 8.0)
- PASSOU: rumo_max_mm = 6.0 (esperado 6.0)
- PASSOU: rumo_max_lateral = 8.0 (esperado 8.0)
- PASSOU: giro_aberto = 1.0 (esperado 1.0)
- PASSOU: lado_aberto_mm = 150.0 (esperado 150.0)
- PASSOU: cabo_esq_mm = 10.0 (esperado 10.0)
- PASSOU: giro_s_beta_max = 25.0 (esperado 25.0)
- PASSOU: giro_s_folga = 3.0 (esperado 3.0)
- PASSOU: giro_s_incerteza = 10.0 (esperado 10.0)
- PASSOU: re_vel = 70.0 (esperado 70.0)
- PASSOU: re_acel = 120.0 (esperado 120.0)
- PASSOU: bateria_minima = 5.5 (esperado 5.5)
- PASSOU: centralizar = 1.0 (esperado 1.0)
- PASSOU: ganho_rumo = 1.0 (esperado 1.0)

- calibração (21/11 19:39:33): gravado no robô: centralizar=0 ganho_rumo=0

- calibração (21/11 19:42:28): gravado no robô: centralizar=1 ganho_rumo=1.0

## E0 (tentativa 18) — PASSOU — 19:42:32

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- PASSOU: 60 chaves do calib no log (esperado 60)
- PASSOU: eixo_ate_frente = 100.0 (esperado 100.0)
- PASSOU: largura_frente = 112.0 (esperado 112.0)
- PASSOU: eixo_ate_tof_frente = 88.0 (esperado 88.0)
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 55.5 (esperado 55.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.0 (esperado 1.0)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 4.0 (esperado 4.0)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- PASSOU: ganho_parede = 3.0 (esperado 3.0)
- PASSOU: max_parede = 35.0 (esperado 35.0)
- PASSOU: folga_arco = 18.0 (esperado 18.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- PASSOU: antecipa_arco = 12.0 (esperado 12.0)
- PASSOU: arco_esq_atraso = -14.0 (esperado -14.0)
- PASSOU: curva_cont_vel = 80.0 (esperado 80.0)
- PASSOU: curva_cont_bitola = 100.0 (esperado 100.0)
- PASSOU: curva_cont_ganho = 1.0 (esperado 1.0)
- PASSOU: curva_cont_giro_max = 30.0 (esperado 30.0)
- PASSOU: curva_cont_trava = 20.0 (esperado 20.0)
- PASSOU: curva_cont_freio = 4.0 (esperado 4.0)
- PASSOU: desfazer_tensao_fora = 3.6 (esperado 3.6)
- PASSOU: desfazer_tensao_dentro = 2.2 (esperado 2.2)
- PASSOU: desfazer_tempo = 2.4 (esperado 2.4)
- PASSOU: recuo_sem_parede = 90.0 (esperado 90.0)
- PASSOU: ajuste_2a_tentativa = 24.0 (esperado 24.0)
- PASSOU: trava_frente_ate = 52.0 (esperado 52.0)
- PASSOU: arco_quase_pronto = 78.0 (esperado 78.0)
- PASSOU: ajuste_fino_min = 0.4 (esperado 0.4)
- PASSOU: ajuste_fino_max = 15.0 (esperado 15.0)
- PASSOU: alvo_lateral_dir_mm = -8.0 (esperado -8.0)
- PASSOU: alvo_pos_esq_mm = 0.0 (esperado 0.0)
- PASSOU: curva_dir_fora = 8.0 (esperado 8.0)
- PASSOU: rumo_max_mm = 6.0 (esperado 6.0)
- PASSOU: rumo_max_lateral = 8.0 (esperado 8.0)
- PASSOU: giro_aberto = 1.0 (esperado 1.0)
- PASSOU: lado_aberto_mm = 150.0 (esperado 150.0)
- PASSOU: cabo_esq_mm = 10.0 (esperado 10.0)
- PASSOU: giro_s_beta_max = 25.0 (esperado 25.0)
- PASSOU: giro_s_folga = 3.0 (esperado 3.0)
- PASSOU: giro_s_incerteza = 10.0 (esperado 10.0)
- PASSOU: re_vel = 70.0 (esperado 70.0)
- PASSOU: re_acel = 120.0 (esperado 120.0)
- PASSOU: bateria_minima = 5.5 (esperado 5.5)
- PASSOU: centralizar = 1.0 (esperado 1.0)
- PASSOU: ganho_rumo = 1.0 (esperado 1.0)

- calibração (21/11 19:43:26): gravado no robô: centralizar=0 ganho_rumo=0

- calibração (21/11 19:46:31): gravado no robô: centralizar=1 ganho_rumo=1.0

## E0 (tentativa 19) — PASSOU — 19:46:36

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- PASSOU: 60 chaves do calib no log (esperado 60)
- PASSOU: eixo_ate_frente = 100.0 (esperado 100.0)
- PASSOU: largura_frente = 112.0 (esperado 112.0)
- PASSOU: eixo_ate_tof_frente = 88.0 (esperado 88.0)
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 55.5 (esperado 55.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.0 (esperado 1.0)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 4.0 (esperado 4.0)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- PASSOU: ganho_parede = 3.0 (esperado 3.0)
- PASSOU: max_parede = 35.0 (esperado 35.0)
- PASSOU: folga_arco = 18.0 (esperado 18.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- PASSOU: antecipa_arco = 12.0 (esperado 12.0)
- PASSOU: arco_esq_atraso = -14.0 (esperado -14.0)
- PASSOU: curva_cont_vel = 80.0 (esperado 80.0)
- PASSOU: curva_cont_bitola = 100.0 (esperado 100.0)
- PASSOU: curva_cont_ganho = 1.0 (esperado 1.0)
- PASSOU: curva_cont_giro_max = 30.0 (esperado 30.0)
- PASSOU: curva_cont_trava = 20.0 (esperado 20.0)
- PASSOU: curva_cont_freio = 4.0 (esperado 4.0)
- PASSOU: desfazer_tensao_fora = 3.6 (esperado 3.6)
- PASSOU: desfazer_tensao_dentro = 2.2 (esperado 2.2)
- PASSOU: desfazer_tempo = 2.4 (esperado 2.4)
- PASSOU: recuo_sem_parede = 90.0 (esperado 90.0)
- PASSOU: ajuste_2a_tentativa = 24.0 (esperado 24.0)
- PASSOU: trava_frente_ate = 52.0 (esperado 52.0)
- PASSOU: arco_quase_pronto = 78.0 (esperado 78.0)
- PASSOU: ajuste_fino_min = 0.4 (esperado 0.4)
- PASSOU: ajuste_fino_max = 15.0 (esperado 15.0)
- PASSOU: alvo_lateral_dir_mm = -8.0 (esperado -8.0)
- PASSOU: alvo_pos_esq_mm = 0.0 (esperado 0.0)
- PASSOU: curva_dir_fora = 8.0 (esperado 8.0)
- PASSOU: rumo_max_mm = 6.0 (esperado 6.0)
- PASSOU: rumo_max_lateral = 8.0 (esperado 8.0)
- PASSOU: giro_aberto = 1.0 (esperado 1.0)
- PASSOU: lado_aberto_mm = 150.0 (esperado 150.0)
- PASSOU: cabo_esq_mm = 10.0 (esperado 10.0)
- PASSOU: giro_s_beta_max = 25.0 (esperado 25.0)
- PASSOU: giro_s_folga = 3.0 (esperado 3.0)
- PASSOU: giro_s_incerteza = 10.0 (esperado 10.0)
- PASSOU: re_vel = 70.0 (esperado 70.0)
- PASSOU: re_acel = 120.0 (esperado 120.0)
- PASSOU: bateria_minima = 5.5 (esperado 5.5)
- PASSOU: centralizar = 1.0 (esperado 1.0)
- PASSOU: ganho_rumo = 1.0 (esperado 1.0)

## E0 (tentativa 20) — PASSOU — 19:51:39

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- PASSOU: 60 chaves do calib no log (esperado 60)
- PASSOU: eixo_ate_frente = 100.0 (esperado 100.0)
- PASSOU: largura_frente = 112.0 (esperado 112.0)
- PASSOU: eixo_ate_tof_frente = 88.0 (esperado 88.0)
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 55.5 (esperado 55.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.0 (esperado 1.0)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 4.0 (esperado 4.0)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- PASSOU: ganho_parede = 3.0 (esperado 3.0)
- PASSOU: max_parede = 35.0 (esperado 35.0)
- PASSOU: folga_arco = 18.0 (esperado 18.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- PASSOU: antecipa_arco = 12.0 (esperado 12.0)
- PASSOU: arco_esq_atraso = -14.0 (esperado -14.0)
- PASSOU: curva_cont_vel = 80.0 (esperado 80.0)
- PASSOU: curva_cont_bitola = 100.0 (esperado 100.0)
- PASSOU: curva_cont_ganho = 1.0 (esperado 1.0)
- PASSOU: curva_cont_giro_max = 30.0 (esperado 30.0)
- PASSOU: curva_cont_trava = 20.0 (esperado 20.0)
- PASSOU: curva_cont_freio = 4.0 (esperado 4.0)
- PASSOU: desfazer_tensao_fora = 3.6 (esperado 3.6)
- PASSOU: desfazer_tensao_dentro = 2.2 (esperado 2.2)
- PASSOU: desfazer_tempo = 2.4 (esperado 2.4)
- PASSOU: recuo_sem_parede = 90.0 (esperado 90.0)
- PASSOU: ajuste_2a_tentativa = 24.0 (esperado 24.0)
- PASSOU: trava_frente_ate = 52.0 (esperado 52.0)
- PASSOU: arco_quase_pronto = 78.0 (esperado 78.0)
- PASSOU: ajuste_fino_min = 0.4 (esperado 0.4)
- PASSOU: ajuste_fino_max = 15.0 (esperado 15.0)
- PASSOU: alvo_lateral_dir_mm = -8.0 (esperado -8.0)
- PASSOU: alvo_pos_esq_mm = 0.0 (esperado 0.0)
- PASSOU: curva_dir_fora = 8.0 (esperado 8.0)
- PASSOU: rumo_max_mm = 6.0 (esperado 6.0)
- PASSOU: rumo_max_lateral = 8.0 (esperado 8.0)
- PASSOU: giro_aberto = 1.0 (esperado 1.0)
- PASSOU: lado_aberto_mm = 150.0 (esperado 150.0)
- PASSOU: cabo_esq_mm = 10.0 (esperado 10.0)
- PASSOU: giro_s_beta_max = 25.0 (esperado 25.0)
- PASSOU: giro_s_folga = 3.0 (esperado 3.0)
- PASSOU: giro_s_incerteza = 10.0 (esperado 10.0)
- PASSOU: re_vel = 70.0 (esperado 70.0)
- PASSOU: re_acel = 120.0 (esperado 120.0)
- PASSOU: bateria_minima = 5.5 (esperado 5.5)
- PASSOU: centralizar = 1.0 (esperado 1.0)
- PASSOU: ganho_rumo = 1.0 (esperado 1.0)

## SERPENTINA-51 (tentativa 1) — corrida — FALHOU — 19:51:52

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-4-g264ef77, calib final (curva_continua 1, curva_dir_fora 8, ajuste_2a_tentativa 24, eixo_ate_tof_frente 88, max_parede 35, alvo_lateral_dir_mm -8, alvo_pos_esq_mm 0, centralizar 1, ganho_rumo 1.0), cabo_esq_mm 10, giro_aberto 1; robo reiniciado antes; largada E=30 D=17 F=524. Log: logs/corridas/SERPENTINA-51/SERPENTINA-51_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: FALHA
- passos: 2
- celulas: 3
- posicao_final: l2,c0
- fora: 1
- tempo_s: 9.0
- s_por_passo: 2.71
- curvas: 0
- ajustes_antes_da_curva: 0
- reta_giro_max: 10.0
- rumo_perdido: 3
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 0
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

## SERPENTINA-52 (tentativa 1) — corrida — PASSOU — 19:54:44

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-4-g264ef77, calib final (curva_continua 1, curva_dir_fora 8, ajuste_2a_tentativa 24, eixo_ate_tof_frente 88, max_parede 35, alvo_lateral_dir_mm -8, alvo_pos_esq_mm 0, centralizar 1, ganho_rumo 1.0), cabo_esq_mm 10, giro_aberto 1; MOTORES/RODAS LIMPOS pelo operador depois da 51 (que mostrou o motor direito com arrasto: 7.2 V contra 3.1 V); robo reiniciado; largada E=25 D=24 F=516. Log: logs/corridas/SERPENTINA-52/SERPENTINA-52_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: SUCESSO
- passos: 7
- celulas: 14
- posicao_final: l0,c3
- fora: 3
- tempo_s: 51.2
- s_por_passo: 7.49
- curvas: 13
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 2
- curva_final_min: 88.2
- curva_final_max: 88.9
- reta_giro_max: 0.4
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 4
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

## SERPENTINA-53 (tentativa 1) — corrida — PASSOU — 19:56:17

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-4-g264ef77, calib final (curva_continua 1, curva_dir_fora 8, ajuste_2a_tentativa 24, eixo_ate_tof_frente 88, max_parede 35, alvo_lateral_dir_mm -8, alvo_pos_esq_mm 0, centralizar 1, ganho_rumo 1.0), cabo_esq_mm 10, giro_aberto 1; motores limpos (a 52 passou com tensoes iguais nas duas rodas); 2a corrida com os motores limpos; largada E=27 D=24 F=519. Log: logs/corridas/SERPENTINA-53/SERPENTINA-53_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: SUCESSO
- passos: 7
- celulas: 14
- posicao_final: l0,c3
- fora: 3
- tempo_s: 53.4
- s_por_passo: 7.86
- curvas: 13
- ajustes_antes_da_curva: 2
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 1
- curva_final_min: 88.6
- curva_final_max: 89.1
- reta_giro_max: 0.9
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 4
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (21/11 19:57:19): gravado no robô: curva_dir_fora=16

## SERPENTINA-54 (tentativa 1) — corrida — PASSOU — 19:59:09

Serpentina 4x4, largada (l3,c0) norte via 3 aberta, firmware fase1-entrega-4-g264ef77, curva_dir_fora 16 (NOVO, era 8; com a curva continua LIGADA; se for pior que a 52 e a 53 volta para 8), curva_continua 1, ajuste_2a_tentativa 24, eixo_ate_tof_frente 88, max_parede 35, alvo_lateral_dir_mm -8, alvo_pos_esq_mm 0, centralizar 1, ganho_rumo 1.0, cabo_esq_mm 10, giro_aberto 1; motores limpos; largada E=26 D=24 F=523. Log: logs/corridas/SERPENTINA-54/SERPENTINA-54_t1.log.

- labirinto: 4x4
- via3: aberta
- resultado: SUCESSO
- passos: 7
- celulas: 14
- posicao_final: l0,c3
- fora: 3
- tempo_s: 52.8
- s_por_passo: 7.74
- curvas: 13
- ajustes_antes_da_curva: 1
- frontal_na_parada_min: 0
- frontal_na_parada_abaixo_40: 1
- curva_final_min: 88.4
- curva_final_max: 88.9
- reta_giro_max: 0.5
- lateral_pos_curva_min: 0
- rumo_perdido: 0
- curva_travada: 0
- tentativa2: 0
- paradas_pela_frente: 3
- mapa_esquecido: 0
- espera_lado: 0
- tof_parou: 0
- i2c_erros_tof: 0
- quedas_tof: 0
- calib: giro x1.000, freio arco 2.6 pivo 4.0 graus (autoajuste desligado), ganho de rumo 1.00 mm/grau

- calibração (21/11 19:59:23): gravado no robô: curva_dir_fora=8

## E0 (tentativa 21) — PASSOU — 19:59:28

Calibração em uso depois de gravar o firmware novo (calib). Comando(s): calib.

- PASSOU: 60 chaves do calib no log (esperado 60)
- PASSOU: eixo_ate_frente = 100.0 (esperado 100.0)
- PASSOU: largura_frente = 112.0 (esperado 112.0)
- PASSOU: eixo_ate_tof_frente = 88.0 (esperado 88.0)
- PASSOU: largura_com_rodas = 108.0 (esperado 108.0)
- PASSOU: tof_lado_ao_centro = 55.5 (esperado 55.5)
- PASSOU: tof_lado_a_frente_do_eixo = 59.15 (esperado 59.15)
- PASSOU: cabo_frente_mm = 0.0 (esperado 0.0)
- PASSOU: preset_cad = 0.0 (esperado 0.0)
- PASSOU: escala_giro = 1.0 (esperado 1.0)
- PASSOU: freio_arco = 2.6 (esperado 2.6)
- PASSOU: freio_pivo = 4.0 (esperado 4.0)
- PASSOU: modo_curva = 0.0 (esperado 0.0)
- PASSOU: freio_uma_roda = 2.6 (esperado 2.6)
- PASSOU: autoajuste_freio = 0.0 (esperado 0.0)
- PASSOU: parada_frente = 35.0 (esperado 35.0)
- PASSOU: tof_na_reta = 1.0 (esperado 1.0)
- PASSOU: rampa_tensao = 50.0 (esperado 50.0)
- PASSOU: fusao_rumo = 0.0 (esperado 0.0)
- PASSOU: reancorar_parede = 0.0 (esperado 0.0)
- PASSOU: parada_dinamica = 0.0 (esperado 0.0)
- PASSOU: vies_giro = 0.0 (esperado 0.0)
- PASSOU: reta_continua = 1.0 (esperado 1.0)
- PASSOU: largura_corredor = 168.0 (esperado 168.0)
- PASSOU: ganho_parede = 3.0 (esperado 3.0)
- PASSOU: max_parede = 35.0 (esperado 35.0)
- PASSOU: folga_arco = 18.0 (esperado 18.0)
- PASSOU: curva_continua = 1.0 (esperado 1.0)
- PASSOU: antecipa_arco = 12.0 (esperado 12.0)
- PASSOU: arco_esq_atraso = -14.0 (esperado -14.0)
- PASSOU: curva_cont_vel = 80.0 (esperado 80.0)
- PASSOU: curva_cont_bitola = 100.0 (esperado 100.0)
- PASSOU: curva_cont_ganho = 1.0 (esperado 1.0)
- PASSOU: curva_cont_giro_max = 30.0 (esperado 30.0)
- PASSOU: curva_cont_trava = 20.0 (esperado 20.0)
- PASSOU: curva_cont_freio = 4.0 (esperado 4.0)
- PASSOU: desfazer_tensao_fora = 3.6 (esperado 3.6)
- PASSOU: desfazer_tensao_dentro = 2.2 (esperado 2.2)
- PASSOU: desfazer_tempo = 2.4 (esperado 2.4)
- PASSOU: recuo_sem_parede = 90.0 (esperado 90.0)
- PASSOU: ajuste_2a_tentativa = 24.0 (esperado 24.0)
- PASSOU: trava_frente_ate = 52.0 (esperado 52.0)
- PASSOU: arco_quase_pronto = 78.0 (esperado 78.0)
- PASSOU: ajuste_fino_min = 0.4 (esperado 0.4)
- PASSOU: ajuste_fino_max = 15.0 (esperado 15.0)
- PASSOU: alvo_lateral_dir_mm = -8.0 (esperado -8.0)
- PASSOU: alvo_pos_esq_mm = 0.0 (esperado 0.0)
- PASSOU: curva_dir_fora = 8.0 (esperado 8.0)
- PASSOU: rumo_max_mm = 6.0 (esperado 6.0)
- PASSOU: rumo_max_lateral = 8.0 (esperado 8.0)
- PASSOU: giro_aberto = 1.0 (esperado 1.0)
- PASSOU: lado_aberto_mm = 150.0 (esperado 150.0)
- PASSOU: cabo_esq_mm = 10.0 (esperado 10.0)
- PASSOU: giro_s_beta_max = 25.0 (esperado 25.0)
- PASSOU: giro_s_folga = 3.0 (esperado 3.0)
- PASSOU: giro_s_incerteza = 10.0 (esperado 10.0)
- PASSOU: re_vel = 70.0 (esperado 70.0)
- PASSOU: re_acel = 120.0 (esperado 120.0)
- PASSOU: bateria_minima = 5.5 (esperado 5.5)
- PASSOU: centralizar = 1.0 (esperado 1.0)
- PASSOU: ganho_rumo = 1.0 (esperado 1.0)

