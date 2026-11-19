# Relatório da bateria de testes do robô — 19/11/2026

> **ERRATA (19/11, operador):** o robô **não será mexido em nada até segunda-feira**: nenhuma alteração de estrutura, eletrônica, energia ou fiação.
> Por isso os pedidos às equipes abaixo valem **a partir de segunda**, e os testes de amanhã usam o robô **exatamente como está** (ToF direito fora do ar,
> cabo da bateria como está, firmware das 11:01:54 e calibração `ganho_rumo=0.6`, `centralizar=1`, `tof_na_reta=1`).

Robô `rato-01` (micromouse ESP32-S3). Firmware: branch `feat/controle-motores-tensao`, commit 8282d64 + 2 mudanças não commitadas
(ver `PARA_EQUIPE_FIRMWARE.md`). Gravado às 09:41 e regravado às 11:01. Linha de base: 16/11/2026. Conduzida por um assistente (Claude Code) com
o operador mexendo no robô. Todos os logs, fotos e o zip estão em `src/firmware/robot-tests/resultados/` e `robot-tests/fotos/`.

## 1. Resumo em uma tabela
| Bloco | Resultado |
|---|---|
| P1 testes no computador | PASSOU: 317 testes (318 no fim), 0 avisos, `-Werror` |
| P2 simulação das pistas A e B | PASSOU nas pistas alcançáveis; **ACHADO**: pista B D1→A4 (inalcançável) entra em laço, não declara "sem caminho" |
| P3 compilação da placa | FALHOU na 1ª vez (1 arquivo); PASSOU depois de correção aprovada |
| Etapa 0b (conhecer o robô, treino sem motor) | Feita: sensores E/F/D e encoders E/D identificados e coerentes com os lados reais |
| Etapa 2 (primeiro contato) | PASSOU: zero erros I²C, calib todo em padrão |
| H (hardware) | PASSOU (H3 pulado; regressão leve das rodas; BROWNOUT intermitente na partida) |
| O (orientação, botão, buzzer) | PASSOU (painel não verificado) |
| A (no ar) | PASSOU (A1 a A5) |
| B3 (calibração dos ToF) | E: ok; F: 3 CONFERIR; D: 1 CONFERIR (+ hardware instável) |
| B1/B2 no azulejo | FALHARAM: reinício de energia ao partir |
| Retas e rés no MDF do labirinto | PASSOU: ~30 manobras seguidas sem batida e (a maior parte) sem reinício |
| B4, B5, C, D, E, F, G | NÃO EXECUTADOS |

## 2. O que foi feito, na ordem
1. **Reconhecimento (Etapa 0):** repositório, ESP-IDF 5.3, ponte BLE pelo Python do Windows, USB via `usbipd`.
2. **P1:** 317/317 testes passando (depois 318 com a chave nova). **P2:** simulação com o Navigator: pista A D4→A1 e D1→A4 e pista B D4→A1: 10 passos, 0 batidas;
   4x4, 4x8, 8x4, 4x12, 12x4 dos dois cantos: todos chegam sem bater. **P3:** compilar a placa falhou em `Drv8833MotionAdapter.cpp:1267` (`snprintf` com `-Werror=format-truncation`):
   correção aprovada pelo operador (buffer 112→192 e `%d` com `static_cast<int>`); recompilou sem avisos.
3. **Gravação** (bateria fora, confirmado pelo `INA219 PAROU de ler`): firmware 09:41:26; boot: 3 ToF prontos, IMU ok, DIP 4x4/esquerda, `calib` todos em padrão (chave `calib2`),
   aviso esperado de frente CAD×campo (22,8 mm).
4. **Etapa 0b:** 5 fotos do robô (traseira, lados, frente, cima) em `fotos/`; peças marcadas. Operador informou: só 3 vias do DIP soldadas; cabo vermelho/preto da bateria pende ~1 cm além do chassi e prende nas paredes.
   Treino sem motor: T1 (ToF esquerdo = lado do cabo da bateria; 1ª tentativa o operador apontou o lado oposto), T2 (frontal), T3/T3b (roda esquerda +293 pulsos, direita +189, sentidos certos).
5. **O1** (toque longo, buzzer): dois toques longos contados (EM PE, deitado), sem largar; 3 bips e 1 bip longo confirmados pelo operador.
6. **Etapa 2:** `saude` zero erros; `calib-ver` todos "padrao".
7. **Bloco H:** H1 `diag: fim: OK`; H2 323 medidas/0 falhas; H3 pulado (solda já corrigida); H4 desvio −0,09 °/s (1ª tentativa invalidada: operador não religou a bateria);
   H5 266 e 229 pulsos; H6 velocidade a 6 V E 2348 / D 2475 (dif 5,4%); H7 bateria mín. 7,95 V; H8 reset BROWNOUT na 1ª tentativa, poweron na 2ª.
8. **O2/O3/O4:** toque curto larga ao soltar (1ª tentativa falhou por temporização, 46 ms); relato girado do 4x4 (x=3 y=3 rumo O) e do 4x8 (8x4 girado, x=7 y=3 rumo O).
9. **Bloco A:** A1 ToF livres; A2 reta 506/506 (giro 0,0); A3 ré −509; A4 curva travada 2x + desfez + tentativa 2; A5 largada recusada.
10. **B3 (parede do labirinto, trena):** ver tabela §4.
11. **Problemas de energia:** B1 (azulejo) reiniciou 2x; diagnóstico T6 (2 V ok no azulejo, 3 V reinicia; no MDF 3 V ok); detalhes no `PARA_EQUIPE_ENERGIA_ELETRONICA.md`.
12. **Mudanças de código aprovadas pelo operador:** (1) correção do `snprintf`; (2) chave `calib tof_na_reta` (padrão 1; 0 = não lê ToF durante a reta).
13. **Calibração da reta (MDF, corredor ~3,7 células):** sem correção o robô entortava para a esquerda (~33 mm em 3 células); `ganho_rumo=1.0` → ~9 mm; `0.6` → ~±3 mm numa rodada; `centralizar=1` ligado.
14. **Sequências finais** (retas/rés): 3+3+3 com tudo ligado: 9/9 ok, sem reinício e sem batida; a 3ª reta parou a 65-67 mm da parede do fundo (parada pela frente funcionou).

## 3. Regressão contra 16/11 (bloco R)
| Item | 16/11 | 19/11 |
|---|---|---|
| I²C, giroscópio, chip, bateria, encoders, botão | ok | ok |
| Rodas a 6 V, diferença E×D | 1% | **5,4%** (3 V: ~20%) |
| ToF direito, offset (D100 a D200) | +4,7 a +6,3 mm | **−3,2 a −7,3 mm** (mudou 5 a 12 mm) |
| ToF frontal a 50 mm | +6,2 | **+13,1** |
| Reta e ré (pulsos por célula) | 506 a 510 | 501 a 512 |

## 4. B3 — erro lido − real (mm; parede do labirinto, trena, ±3 mm de montagem)
| Real | Esquerdo | Frontal | Direito |
|---|---|---|---|
| 50 | +6,7 | +13,1 (CONFERIR) | −11,3 (CONFERIR) |
| 100 | +7,1 | +7,0 | +1,2 |
| 150 | +6,9 | −15,2 (montagem) | −3,2 |
| 200 | +10,4 (CONFERIR) | +10,6 (CONFERIR) | −7,3 |
Nenhuma leitura de 0 mm "ok" (a melhoria P1 funciona); mínimo do direito a 50 mm foi 36 mm.

## 5. Erros de condução (para não repetir)
- Do assistente: rodar o B1 com o ToF direito fora do ar; chamar de "no labirinto" um teste que o operador fez no suporte (descartado); concluir cedo uma hipótese (rejunte) e depois revê-la.
- Do operador (de preparo): H4 sem desligar/ligar; apontar o lado errado no T1; apertar o botão antes de o O2 abrir a janela; teste decisivo de `tof_na_reta` feito no suporte.
- Medidas do ambiente: o corredor "de 4 células" tem ~3,7 células (~670 mm); a 3ª reta chega ao fundo.

## 6. Não executado (continua amanhã)
B1/B2 formais, B4 (pivô, informativo), B5 (curvas, precisam de um canto), C (manobra a manobra), D (corridas pista A e B), E1 a E8 (novidades; o `t.py` ainda não tem esses testes),
F (layouts), G (resistência). Ver `PLANO_AMANHA.md`.
