# Auditoria da serpentina 4x4: 21/11/2026 (Fase 1)

Branch `feat/controle-motores-tensao`. Ponto de partida marcado com a tag `antes-fase1` (`34a7b7c`, o firmware gravado no robô
na última corrida de 20/11). Entrega marcada com a tag `fase1-entrega`. A Fase 1 foi feita **sem o robô**: só leitura dos logs
de 20/11, modelo geométrico, código, compilação e testes no computador. Nada foi gravado na placa e nada acionou o hardware.

## 1. Resumo

- **O que falhava:** nenhuma das 25 corridas de 20/11 (SERPENTINA-5 a 29) chegou ao objetivo. Depois das correções da noite,
  sobraram duas falhas, e as duas vêm logo depois de um **giro de 90 graus no lugar em célula aberta** (sem paredes dos dois
  lados, chave `giro_aberto=1`):
  - **passo 7, em (l2,c3)**, nas SERPENTINAS 23 a 26: a reta depois do giro à esquerda é abortada por "rumo perdido: desviou
    10 graus", com as rodas andando iguais (robô arrastado pela lateral esquerda);
  - **passo 5, em (l0,c1)**, nas SERPENTINAS 17, 19, 21, 22, 28 e 29: o arco à direita trava a 37-56 graus, com o robô
    colado na parede esquerda (ToF esquerdo sem leitura). Ele chegou assim porque saiu do giro à esquerda do passo 4, em
    (l2,c1), 26 mm à esquerda do centro, e a correção pela parede ficou no teto (7,7 mm) e não o trouxe de volta em 2 células.
- **Causa raiz:** o modelo que decide onde girar no lugar (`domain/PivotClearance`) trata as paredes como retas infinitas e
  **ignora os postes dos cantos**. Numa célula aberta só a parede da frente entrava na conta, e o modelo aceitava girar com o
  eixo 31 a 36 mm antes do centro. Com os postes de 12 x 12 mm, o giro simples de 90 graus **não cabe em posição nenhuma** com
  este robô (frente 100 mm, largura 112 mm, cabo da bateria ~10 mm à esquerda). Na melhor posição a lateral de dentro invade o
  poste em 8 mm, e o recuo que a parede da frente impõe vira deslocamento lateral para o lado de dentro na saída.
- **Correção:** a curva em célula aberta agora é um **"S"** (`domain/CellTurn`): gira 65 a 90 graus, anda na diagonal até o
  meio do corredor de saída e completa a curva. O plano é conferido contra paredes, postes e cabo durante o movimento inteiro,
  com o robô até 10 mm fora do eixo de entrada. Planos escolhidos pelo modelo: à esquerda, folga de 4,4 mm, saindo 10 mm para
  dentro; à direita, folga de 7,4 mm, saindo 5 mm para dentro (antes, -8 mm de folga e saída 31-36 mm para dentro).
- **Verificação:** 430 testes de host passam (eram 421), com `-Werror`. O firmware do ESP32-S3 compila **sem nenhum aviso**
  nos dois modos: o de calibração (`RATO_LOG_RETA=y`) e o de prova (sem o log). O modo prova **não compilava** desde 19/11; isso
  também foi corrigido.
- **O que não foi verificado:** nada disto rodou no robô. O tempo do plano no ESP32 (estimado em 1 a 3 s por plano, 4 planos
  ao ligar e a cada `calib` que mude o corpo), a largura real do cabo (10 mm é estimativa) e o comportamento da curva em S na
  pista ficam para a Fase 2 (`BATERIA_TESTES_21_11.md`).

## 2. Estado de partida

| Item | Valor |
|:--|:--|
| Firmware no robô | `34a7b7c` (calib14, 56 chaves), gravado em 20/11 às ~22:30 |
| Calib em uso na SERPENTINA-29 (20 chaves fora do padrão) | `eixo_ate_frente=100 eixo_ate_tof_frente=98 largura_frente=112 tof_lado_ao_centro=55.5 escala_giro=1 freio_pivo=4 centralizar=1 ganho_rumo=1 ganho_parede=3 max_parede=22 folga_arco=18 antecipa_arco=12 arco_esq_atraso=-14 desfazer_tensao_fora=3.6 desfazer_tensao_dentro=2.2 ajuste_fino_min=0.4 alvo_pos_esq_mm=12 rumo_max_lateral=8 giro_aberto=1 bateria_minima=5.5` |
| Labirinto | Serpentina 4x4, largada (l3,c0) virada ao norte, via 3 aberta, objetivo (l0,c3) |
| Robô | Frente 100 mm (ToF 98), largura 112, traseira 17,25, cabo da bateria ~10 mm para fora na lateral esquerda (estimativa do operador: "considere o cabo parte do chassi"). Medidas com fita métrica e trena (não há paquímetro): precisão de ~2-3 mm |
| Labirinto físico | Corredor 168 mm (face da parede a 84 mm do centro), célula 180, parede 12 mm, postes 12 x 12 nos cantos |
| Hardware | Não muda até segunda-feira (cabo, pneu direito e energia são de outras equipes) |

## 3. As corridas de 20/11 (SERPENTINA-5 a 29)

Fonte: `robot-tests/resultados/corridas.csv` e `robot-tests/resultados/logs/corridas/SERPENTINA-N/`.

| Corridas | Firmware / mudança principal | Onde parou | O que aconteceu |
|:--|:--|:--|:--|
| 5-7, 9 | curva contínua, recuo fixo 105 | (l2,c0)-(l2,c1), passos 3-4 | arco à direita sem parede à frente travava; arco à esquerda travava a 38-43 graus |
| 8, 10-12 | ré a 70 mm/s, desfazer suave, `ganho_rumo` 1,2, `max_parede` 20 | passo 1 | a reta inicial perdia o rumo (correção forte demais); revertido em 13 |
| 13-14 | revertido para o estado do `e71336d` | (l2,c1), passo 3 | volta a chegar ao passo 3 |
| 15-17 | recuo 90 sem parede à frente, limite de bateria 5,5 V | (l2,c1) / (l0,c1) | a curva à direita sem parede passa; o arco à esquerda do passo 4 trava |
| 18-20 | `arco_esq_atraso` -8 / -14 | (l1,c3) / (l0,c1) | 18 e 20 chegam a 7 passos e 12 células; a curva à esquerda ainda trava às vezes |
| 21-22 | `giro_aberto=1` (giro no lugar em célula aberta) | (l0,c1), passo 5 | o giro do passo 4 passa; o arco à direita de (l0,c1) trava |
| 23-26 | giro no ponto mais perto do centro + ajuste fino | (l2,c3), passo 7 | passos 1-6 passam; a reta depois do giro à esquerda do passo 7 aborta a +10 graus |
| 27 | `alvo_lateral_dir_mm=10` | passo 2 | a centralização jogou o robô na parede direita; revertido para 0 |
| 28-29 | roda limpa, `alvo_pos_esq_mm=12` (calib14) | (l0,c1), passo 5 | o arco à direita trava a 54-56 graus com o robô colado na parede esquerda |

## 4. Causa raiz

### 4.1 Passo 7, (l2,c3): a reta depois do giro à esquerda

SERPENTINA-26 (log `SERPENTINA-26_t1.log`):

```
curva: giro em celula fechada: eixo a -54 mm do centro (frontal), plano anda e gira, mover 18 mm, alvo -36 mm
reta: trecho de 2 celulas 360 mm: enc E=119 D=113 (42.0 / 39.9 mm) ... giro=10.0 lat E=2..
nav: passo 7: cel (l2,c3) rumo L | tof E=214 (ok) F=294 (ok) D=51 (ok) ...
main: trecho de 2 celulas falhou (rumo perdido: desviou 10 graus na reta (parede?))
```

Depois do giro, o ToF direito lê 51 mm. No centro do corredor ele leria 28,5 mm (84 - 55,5), então o robô está ~23 mm à
esquerda. Com o cabo, a lateral esquerda fica a 23 + 56 + 10 = 89 mm do eixo do corredor, além da face da parede (84 mm). Em
41 mm de reta, com as rodas andando iguais (42,0 e 39,9 mm), o giroscópio marca +10 graus: o robô é girado pela lateral esquerda
presa na ponta da parede (o poste), não pela correção da reta. A SERPENTINA-23 (giro a -64 mm) falha igual.

### 4.2 Passo 5, (l0,c1): o arco à direita

SERPENTINA-29, reta de 2 células logo depois do giro à esquerda do passo 4, em (l2,c1):

```
curva: giro em celula fechada: eixo a -54 mm do centro (frontal), plano anda e gira, mover 18 mm, alvo -36 mm
reta: tof D 50ms (mm): 54 54 56 56 54 ... 58 59 59 60 60 60 60 124 255
reta: pose 50ms (mm*10): -259 -260 -279 ... -317 -327 -327 -326 -326
reta: termo 50ms (mm*10): 0 0 -5 -15 -24 ... -76 -77 -77 ... -78 -78
reta: pose lateral: eixo (sem estimativa) 0.0 mm para a direita do centro, rumo 5.1 graus
curva: arco a direita: ... antes do recuo tof E=0 F=45 D=252, rumo residual 2.3 graus
curva: travou a -55.8 graus (direita): tof E=0 F=96 D=247 no momento
```

O robô sai do giro 26 mm à esquerda, e a pose estimada fica entre -26 e -33 mm a reta inteira. O termo da parede satura em
7,7-7,8 mm (o teto `max_parede=22`) e não o traz de volta: ele chega a (l0,c1) colado na parede esquerda (ToF esquerdo sem
leitura), e o canto dianteiro esquerdo, que é o canto de fora do arco à direita, bate na parede. O `max_parede` foi baixado de
50 para 22 na SERPENTINA-26 porque com 50 a correção passava do limite de rumo (10 graus) e abortava a reta.

### 4.3 Por que o giro sai deslocado: o modelo não tinha os postes

`domain/PivotClearance` decide onde girar no lugar. As paredes são retas infinitas e só entram as que existem na célula. Numa
célula aberta só sobra a parede da frente: o nariz (100 mm) precisa de ~115 mm de raio, a parede está a 84 mm do centro, e o
modelo manda o eixo para 31 a 36 mm antes do centro. Esse recuo vira deslocamento lateral na saída: o robô termina o giro
31-36 mm para o lado de dentro da curva (para a esquerda, numa curva à esquerda, que é o lado do cabo).

O modelo novo (`domain/CellTurn`, com os 4 postes, a parede da frente, as paredes do corredor de saída e do de entrada, e o cabo
como um retângulo de 10 mm na lateral esquerda) dá:

| Movimento (curva à esquerda, parede à frente) | Menor folga |
|:--|:--|
| Giro simples de 90 graus, eixo em qualquer posição de 0 a -70 mm, robô entrando de -20 a +20 mm fora do eixo | **-8,0 mm** (sempre invade) |
| O mesmo, segundo o modelo antigo (`pivotInPlaceClears`, eixo -36) | "cabe" |
| S: eixo -36, gira 70, diagonal 76 mm, completa (o plano escolhido) | **+4,4 mm** no pior caso de ±10 mm de entrada |
| S à direita (cabo do lado de fora): eixo -38, gira 75, diagonal 127,5 | **+7,4 mm** |
| S à esquerda sem o cabo (cabo 0) | +7,1 mm |

Esse é o teste `CellTurn.TheOldPivotModelIgnoredThePosts`: o mesmo giro que o modelo antigo aceita invade 8 mm.

### 4.4 Correção do relatório de 20/11

`robot-tests/relatorios/CURVA_CONTINUA_20_11.md` (commit `b145451`) explicou o passo 7 assim: "esse desvio [36 mm] é maior que
a folga lateral de 28 mm". O número está certo, mas a explicação está incompleta e levava a uma conclusão errada: parecia que
bastava girar mais perto do centro. Não basta. Mais perto do centro o nariz bate na parede da frente, e mais longe a lateral
bate no poste. **Com postes não existe janela para o giro simples.** O operador apontou a inconsistência ("o que não está
conseguindo fazer na última curva é exatamente o que se faz na primeira"), e foi isso que levou ao modelo com postes. O
relatório de 20/11 ganhou uma nota no fim apontando para esta auditoria; o texto original foi mantido.

### 4.5 O que o modelo não explica

- **Por que o mesmo giro às vezes passa no passo 4.** O modelo, que trata o robô como um retângulo rígido, dá -8 mm. Na pista o
  robô escorrega no poste, e o deslocamento medido logo depois do giro (23 a 26 mm pelo ToF direito) é menor que o planejado
  (36 mm): o centro do giro anda com o arrasto das rodas. Hipótese: no passo 4 o robô raspa e passa; no passo 7, com a reta
  saindo direto para o corredor seguinte, ele prende. **A confirmar na pista** (observar se a lateral esquerda toca o poste no
  passo 4).
- **A largura real do cabo.** 10 mm é estimativa (não há paquímetro; o operador mede com fita métrica e trena). Com a medida
  certa no `calib` o plano se adapta: folga de 7,4 mm com o cabo rente, 4,4 com 10, 2,3 com 14, 0,2 com 18; acima de ~18 mm
  nenhum movimento cabe (o firmware avisa no log e usa o arco). O perigo é o valor errado: o plano de 10 mm com um cabo real de
  15 mm invade 0,6 mm.

## 5. Correções feitas

| Commit | O quê | Por quê |
|:--|:--|:--|
| `6fbcafc` | `domain/CellTurn` (modelo com postes e cabo, busca do S), curva em S no adaptador em célula aberta, 3 chaves novas, `calib15` | Causa raiz (seção 4) |
| `2f038b7` | O modo prova (sem `RATO_LOG_RETA`) volta a compilar; versão do firmware (`git describe`) no boot e na linha de largada; a busca do S cede a CPU | O modo prova não compilava desde `7cc1aaa` (19/11): `gMazeOverride` e `gOrientationFlip` ficaram dentro do `#if` do log. A versão no log identifica cada gravação sem depender de anotação |
| `0a01d9e` | O E0 espera a linha `calib: fim:` | A captura fechava antes das últimas chaves (20/11: 52 de 55) e o E0 acusava chave faltando |
| `70a98ae` | Teste da serpentina de 20/11, reconstruída pelos logs, célula a célula e com reta e curva contínuas | O caminho do Navigator (frente 3, ré do beco, as curvas) é o dos logs e chega ao objetivo sem bater no simulador: as falhas são de movimento, não de navegação |
| `7c86104` | Os 4 planos do S calculados ao aplicar o calib (robô parado), só quando muda o que entra neles, com `-O2` nesse arquivo | Sem isso, o primeiro plano sem parede à frente seria calculado no meio da corrida (pausa de segundos) |
| `a36cfd6` | Sem parede à frente, o S usa a odometria (`aheadMm_ - lastShortMm_`) para a posição do eixo; nunca avança com o frontal ainda "muito perto" | Antes supunha o eixo no centro; um frontal "muito perto" (< 40 mm) não é medida confiável |

Chaves novas do `calib` (todas com padrão; a chave da memória passou para `calib15`, então **a memória do robô volta aos padrões
na primeira vez que ligar com este firmware** e o calib de 20/11 tem de ser reaplicado):

| Chave | Padrão | Faixa | O que é |
|:--|:--|:--|:--|
| `cabo_esq_mm` | 10 | 0 a 30 | quanto o cabo da bateria sobressai na lateral esquerda (estimativa; medir) |
| `giro_s_beta_max` | 25 | 0 a 40 | o primeiro giro do S pode parar até este tanto antes dos 90 (0 = só o giro simples, que não cabe) |
| `giro_s_folga` | 3 | 0 a 15 | abaixo disto o plano é usado, mas o log avisa (`ABAIXO de giro_s_folga`) |
| `giro_s_incerteza` | 10 | 0 a 25 | o plano tem de caber com o robô até este tanto fora do eixo de entrada |

O S só é usado com `giro_aberto=1` e nas células em que os dois ToF laterais leem acima de `lado_aberto_mm`. Se nenhum
movimento couber, o log diz `NENHUM MOVIMENTO CABE` e a curva segue pelo arco, como antes do `giro_aberto`.

## 6. Verificação

| O quê | Resultado | Como |
|:--|:--|:--|
| Testes de host | **430 de 430** (eram 421: +7 do `CellTurn`, +2 da serpentina) | `cmake --preset debug && cmake --build --preset debug && ctest --preset debug`, com `-Werror` |
| Firmware de calibração | compila, **0 avisos** | `idf.py build` com `sdkconfig` + `CONFIG_RATO_LOG_RETA=y` |
| Firmware de prova | compila, **0 avisos** (não compilava antes) | o mesmo, sem `CONFIG_RATO_LOG_RETA` |
| `-O2` só no `CellTurn.cpp` | conferido no `compile_commands.json` (vem depois do `-Og`) | |
| `t.py` | importa sem erro; E0 com as 4 chaves novas | |
| Tempo do plano | 35 ms (`-O2`) / 77 ms (`-Og`) por plano **no PC**. No ESP32-S3 **não medido**: a linha `plano da curva em celula aberta ... calculado em N ms` mostra no boot | |
| No robô | **nada** (a Fase 1 não grava nem aciona o hardware) | Fase 2 |

## 7. Riscos

1. **Tempo do plano no ESP32.** Estimativa de 1 a 3 s por plano: 4 a 12 s a mais no boot, e o mesmo a cada `calib` que mude
   corpo, cabo, `giro_s_beta_max` ou `giro_s_incerteza`. A busca cede a CPU entre as etapas (`vTaskDelay(1)`), então o watchdog
   de 5 s não deve disparar, mas isso precisa ser confirmado no primeiro boot.
2. **Modelo x pista, e medidas de trena.** Robô e postes são retângulos rígidos no modelo, e as medidas do robô vêm de fita
   métrica e trena (~2-3 mm). O plano à direita aguenta 5 mm de erro em qualquer medida. O da esquerda (4,4 mm) aguenta 3 mm em
   cada medida sozinha, mas não um cabo de 15 mm (-0,6) nem 3 mm errados em todas ao mesmo tempo (-1,0 a -2,9). As medidas que
   pesam são o cabo e o `eixo_ate_tof_frente`; o método com trena e a tabela completa estão em `MEDICOES.md`, seção "Medidas com trena".
   Diminuir o `giro_s_incerteza` não compra folga (o plano é o mesmo com 10 e com 5).
3. **Diagonal sem referência.** Os 76-127 mm da diagonal são andados só com o giroscópio (não há paredes para centralizar). Um
   erro de 2 graus no primeiro giro dá ~3-4 mm no fim da diagonal.
4. **Correção pela parede fraca.** Mesmo com o S, o robô sai até 10 mm para o lado de dentro, e o teto `max_parede=22` (7,7 mm)
   demora a corrigir. `alvo_pos_esq_mm=12` ajuda na saída da curva à esquerda. Se não bastar, é a primeira chave da Fase 2.
5. **Memória zerada pelo `calib15`.** Se o calib de 20/11 não for reaplicado, o robô corre com os padrões (frente 87, sem
   `giro_aberto`, `escala_giro` 1,08), que não servem para este robô. O E0 acusa.

## 8. Outros achados (não corrigidos, de outras equipes ou para a Fase 2)

- **INA219 às vezes lê ~1,7 V abaixo do cellmeter** (6,11 V com 7,98 V no cellmeter; em outras largadas lê 7,98 V certo). O
  limite da corrida está em 5,5 V lidos (calib `bateria_minima`), só para os testes. Equipe de energia:
  `robot-tests/resultados/ACHADOS_EQUIPE_ENERGIA.md`.
- **Roda direita prendendo** (SERPENTINA-28: "a roda prendeu na parede direita"; o operador limpou). Equipe de estrutura.
- **Segunda metade do labirinto sem paredes a menos de 90 mm:** a centralização não tem referência e o erro lateral acumula.
  A curva em S diminui o erro na entrada dessas retas. A localização pelas paredes distantes continua pendente.
- **BLE perde comandos `calib` longos:** mandar no máximo 4 chaves por linha (o roteiro da Fase 2 já vem dividido).


## 9. Sessão de pista de 21/11 (noite): resultado

Firmware gravado: `fase1-entrega-4-g264ef77` (calib15). Corridas SERPENTINA-30 a 50, logs em `robot-tests/resultados/logs/corridas/`.

### 9.1 Resultado
- **Chega ao objetivo.** Com a configuração final, 2 corridas seguidas passam (49 e 50, ~52 a 53 s, 7 passos, giros de 88,3 a 89,0°). Com a mesma
  configuração e a 2ª tentativa de 6 mm, 40, 41, 42 e 43 passaram (4 seguidas); a 44 e a 45 o operador parou por arrasto na parede.
- **O que ainda não está bom:** o robô **raspa na parede direita**: depois das curvas à direita o sensor direito lê 0 mm; a saída da curva em S fica 15 a
  35 mm à direita do que o plano prevê; a estimativa lateral nas retas chega a 15 a 32 mm à direita (correção no teto de 12,3 mm).
- **Calib final em uso** (acima dos padrões): `eixo_ate_frente=100 eixo_ate_tof_frente=88 largura_frente=112 tof_lado_ao_centro=55.5 escala_giro=1.00
  freio_pivo=4 centralizar=1 ganho_rumo=1.0 ganho_parede=3 max_parede=35 folga_arco=18 antecipa_arco=12 arco_esq_atraso=-14 desfazer_tensao_fora=3.6
  desfazer_tensao_dentro=2.2 ajuste_fino_min=0.4 alvo_lateral_dir_mm=-8 alvo_pos_esq_mm=0 curva_dir_fora=8 rumo_max_lateral=8 ajuste_2a_tentativa=24
  giro_aberto=1 bateria_minima=5.5`. As do S (`cabo_esq_mm=10`, `giro_s_*`) ficam nos padrões.

### 9.2 O que mudou no firmware depois de `6fbcafc` (commits)
| Commit | O quê |
|:--|:--|
| `0f49ea1` | Curva em S **tenta de novo** quando o 1º giro trava: gira de volta, desloca o eixo metade de `ajuste_2a_tentativa` (recua se travou antes de 45°, avança depois) e repete uma vez. Funcionou na pista (43: 55,9° → +6 mm → ok; 48: 58° → +12 mm → ok); falhou na 47 (38,7° e 46,2° com 6 mm) |
| `e0d2bd6` | A diagonal da curva em S aceita até **18°** de desvio de rumo (antes 10°): um toque leve na parede abortava a corrida por 0,1° (SERPENTINA-39) |

### 9.3 Achados
1. **O ToF frontal lê ~4,5 mm a mais perto da parede:** eixo→sensor medido com trena é 92 mm a F=51 mm e 96,5 mm a F=132 (e 85 a F=42 em 19/11). `eixo_ate_tof_frente` caiu de
   98 para 88 (o melhor medido na pista): a posição do eixo no começo da curva em S decide se o corpo bate no poste ou na parede, e a janela é de ~±5 mm.
2. **1ª curva em S travou em 3 de 8** (32, 35, 37; mais a 43, 47 e 48 já com recuperação). Não há padrão em bateria, distância frontal, avanço ou posição lateral.
   O robô gira só 40 a 60% do esperado desde o início (as rodas andam, o corpo não acompanha). Não é defeito do giro em piso livre: 10 giros de 90° sem paredes deram
   88 a 91° com as rodas simétricas (esquerda ≈ direita), com 1 patinagem das duas rodas no 1º giro depois do reinício.
3. **ToF direito caiu sozinho** (volta ao endereço de fábrica 0x29 = a alimentação do módulo piscou) 2 vezes em ~4 min depois da limpeza das rodas; `tofrec` recuperou. Depois ficou
   estável (988 de 988 leituras). Não é o cálculo dos planos (testei: caiu com o robô parado, sem cálculo). Para a equipe de energia/eletrônica.
4. **O cálculo dos 4 planos da curva em S leva 8 a 12 s cada no ESP32** (não 1 a 3 s): ~40 s sem responder a cada boot e a cada `calib` que mude corpo, cabo, `giro_s_beta_max`
   ou `giro_s_incerteza`. Os valores dão exatamente os do PC (esquerda 4,4 mm, direita 7,4 mm). Sem reiniciar o watchdog.
5. **Depois de um erro o robô precisa reiniciar** (ele ignora `largar`); o `parar` pelo BLE leva alguns segundos (mensagem → comando → BLE). Existe o atalho
   `parar.sh` para o operador e a chave do robô é o único jeito imediato.
6. **A curva contínua não é a causa do arrasto:** desligá-la (`curva_continua=0`, 46, 47, 48) piorou: 0 de 3, porque a curva à esquerda em (l2,c2) vira arco parado e trava no poste
   quando o robô chega encostado na parede direita.
7. **A INA219 lê oscilando** (6,3 a 7,3 V com 8,0 V no cellmeter), como já se sabia.

### 9.4 Pendências (para a próxima sessão)
1. **Reiniciar o ToF que cai DURANTE a reta/curva** (hoje só reinicia com o robô parado). Está na memória do projeto.
2. **Viés para a direita na saída das curvas em S e dos arcos à direita:** investigar com o robô visível (filmar de cima, medir o ângulo da saída). Hipóteses: cabo da bateria,
   contato do canto da frente com o poste, aderência. Ajuste cego de calib não resolveu.
3. **Cabo da bateria** (equipe de estrutura): prender rente ao chassi tira a folga do lado esquerdo do plano (7,4 mm contra 4,4) e alarga a janela do S.
4. **Pneus e engrenagens** (estrutura): o 1º giro depois do reinício patinou; limpar só com fita adesiva e álcool no pneu, nada de solvente nas rodas/caixa; trocar o N20 se a engrenagem
   prender (R$ 76 cada).
5. **Estimativa lateral parada em 12,3 mm** (`max_parede=35`): robô chega a 15 a 32 mm da posição pedida e não volta. Testar `max_parede` maior só com o robô visível.
6. **Reduzir o tempo dos planos da curva em S** (busca mais grossa ou 1 plano por vez no boot).
