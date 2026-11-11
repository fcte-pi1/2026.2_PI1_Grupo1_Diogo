# Logs da corrida e medidas do robô

Criado em 10/11. Duas coisas que andam juntas:

1. **O que o robô registra sozinho** numa corrida, para o erro ser achado pelo log, sem medir nada
   com ele dentro do labirinto.
2. **O que precisa ser medido fora do labirinto** (paquímetro, régua, bancada) e em que constante
   do código cada medida entra.

Tudo abaixo vale para o build de teste: `RATO_LOG_RETA=y`. As linhas saem no serial e, pelo BLE, no
arquivo da ponte (`bridge/ble_ws_bridge.py --log-robo`).

## 1. Linhas de log, na ordem em que aparecem

### Na largada

| Linha | O que diz |
|:--|:--|
| `main: largada N: labirinto CxL, via 3 ABERTA/FECHADA (borda a ESQUERDA/DIREITA do robo), largada (lR,cC) virado N, objetivo (lR,cC), bat=` | A configuração lida da DIP. Se a borda não está do lado indicado, a via 3 está errada |
| `main: parametros: fast/slow decay, RF-44, parede lateral< frontal< mm, arco comeca a X mm (folga, corpo a/b/c), parada frontal<, teto V` | As opções do build e os parâmetros que decidem as manobras |
| `main: giroscopio em repouso: X graus/s` | A deriva. Acima de ~0,5 grau/s, o robô se mexeu na largada ou o sensor está ruim |
| `main: largada: tof E= F= D=` | O que os sensores veem antes de andar |
| `main: largada recusada: sem parede a ... do robo ...` | A via 3 não corresponde ao canto. O robô não larga |

### A cada passo

`nav: passo N: cel (lR,cC) rumo X | tof E=mm (estado) F=mm (estado) D=mm (estado) | mapa NLSO=xxxx | dist=D | acao=A -> (lR,cC) rumo X | fora=K bat=V`

- `cel` e `rumo`: onde o robô ACHA que está, no referencial do firmware (linha 0 em cima, coluna 0 à
  esquerda; ele larga na linha de baixo virado para N).
- `tof`: a leitura que decidiu o passo. `9999` = nada ao alcance, `-1` = falha. Estados: `ok`,
  `sigma`, `sinal`, `wrap`, `colado`, `nenhum`...
- `mapa NLSO`: o que ficou gravado da célula, na ordem Norte, Leste, Sul, Oeste: `P` parede,
  `A` aberto, `?` não visto.
- `dist`: células até o objetivo pelo flood fill (`-1` = sem caminho).
- `acao`: `frente`, `esquerda`, `direita`, `re`, `espera`, `assumiu parede`, `sem caminho`. Pode vir
  com `(mapa esquecido)` ou `(evitou re as cegas)`.
- `fora`: quantas vezes um sensor viu passagem onde o mapa tem borda. Deve ficar em 0. Se sobe, o
  robô não está onde acha (ou a via 3 está errada).

Para a pista 4x4 largando de D4 ou de D1 (virado para a coluna C): **letra = A + linha, número = 4 −
coluna**. Exemplo: `(l0,c2)` é A2.

### A cada reta

`reta: <nome> <mm>: enc E= D= (mm / mm) dif max= fim= V max E= D= satur=a/b tempo= perfil= bat= parede= frente= parou antes= giro= lat E= D= <ok ou motivo>`

- Novos em 10/11: `lat E= D=` (última leitura dos ToF laterais na reta; `-1` = sem parede) e, numa
  reta que falha, a linha `tof: depois da reta que falhou: ...`.
- Nomes: `andar 1 celula`, `re de 1 celula`, `recuo antes da curva`, `avanco antes da curva`,
  `ajuste antes da curva`.
- Robô centrado: `lat` perto de 34 mm de cada lado. `giro` perto de 0.

### A cada curva

| Linha | O que diz |
|:--|:--|
| `curva: inicio do arco: alvo X mm, frontal A mm na parada, B mm depois do recuo, ajuste C mm` | De onde o arco parte. `B` é a distância real à parede da frente |
| `curva: inicio do arco: sem parede a frente (...), recuo fixo 75 mm` | Curva numa célula de frente aberta |
| `curva: alvo=90 parou= final= tempo= enc E= D= (esperado) V max= V fim E= D= bat= continuou= giro perdido= <ok ou motivo>` | O resultado. Pulsos muito acima do esperado = rodas patinando |
| `curva: angulo a cada 100 ms: 3 11 22 34 ...` | Onde a curva perdeu velocidade ou parou |
| `tof: depois da curva: E= F= D=` | A pose com que o robô saiu da curva |
| `curva: desfez o arco: de X para Y graus ...` e `curva: tentativa 2 do arco (...)` | O arco travou e foi tentado de novo |

Motivos de falha de curva: `curva travada` (o giroscópio parou de girar por 0,4 s), `tempo de 4,5 s
esgotado`, `giroscopio sem leitura`, `parado pelo operador`.

### No fim

| Linha | O que diz |
|:--|:--|
| `main: chegada nao confere: ...` | No objetivo, um sensor viu passagem onde há borda: o robô se perdeu. A corrida é falha |
| `main: fim da corrida N: SUCESSO/FALHA, passos, celulas, posicao, passagens para fora, eventos perdidos, linhas de log perdidas` | Resumo |
| `main: movimento: N arco(s) repetido(s), N parada(s) pela parede da frente, N leitura(s) do giroscopio perdida(s)` | Contadores |
| `nav: mapa lR (NLSO por celula, c0 em diante): PA?P ...` | O mapa inteiro que o robô montou, uma linha por linha do labirinto |

## 2. Comandos pelo BLE (robô parado, esperando a largada)

| Comando | O que faz |
|:--|:--|
| `largar`, `parar`, `reiniciar` | Como antes |
| `andar` | Uma célula para a frente |
| `re` | Uma célula de ré (novo) |
| `virar d`, `virar e` | A curva completa da corrida (recuo, arco, volta ao centro) |
| `arco d`, `arco e`, `pivo d`, `pivo e` | Só o arco, ou 90 graus no lugar |
| `tof` | 5 leituras dos três ToF com o robô parado (novo) |
| `giro` | Deriva do giroscópio em repouso (novo) |
| `frente <potência> <ms>` | Teste sem controle |

## 3. Medidas para pedir à equipe de estrutura (robô FORA do labirinto)

Todas a partir do **meio do eixo das rodas** (o ponto no chão entre as duas rodas), com paquímetro.

| # | Medida | Valor usado hoje | Onde entra |
|:--|:--|:--|:--|
| M1 | Do eixo até o ponto mais à frente do chassi | 87 mm (estimado) | `RobotParameters.hpp`, `kBody.axleToFrontMm` |
| M2 | Largura do chassi na parte da frente (o ponto mais largo à frente do eixo, com tudo que sobressai) | 100 mm (metade: 50, de projeto) | `kBody.halfWidthMm` |
| M3 | Do eixo até a face do ToF frontal | 87 mm (estimado) | `kBody.axleToFrontTofMm` |
| M4 | Raio do arredondamento das quinas da frente | não usado | Reduz a folga pedida (`kArcFrontClearanceMm`) |
| M5 | Do eixo até o ponto mais atrás do robô (chassi ou roda) | não está no código | Limite do recuo e da ré |
| M6 | Largura total com as rodas | não está no código | Folga lateral no corredor |
| M7 | Diâmetro de cada roda com o pneu | 34 mm (projeto) | `kWheelDiameterMm` |
| M8 | Bitola: do centro de um pneu ao centro do outro | 88 mm (projeto) | `kWheelTrackMm` |
| M9 | Cada ToF lateral: da face do sensor à linha central do robô, e quanto à frente do eixo | não está no código | Confere o centro de 33,6 mm do RF-44 |

Do labirinto, parado e com régua (não precisa do robô):

| # | Medida | Valor usado hoje |
|:--|:--|:--|
| L1 | De centro a centro de duas células vizinhas, em 3 lugares | 180 mm (`kCellSizeMm`) |
| L2 | Espessura das paredes | 12 mm (só nas contas de folga) |
| L3 | Largura livre do corredor, em 3 lugares | 168 mm |

## 4. Calibrações em bancada ou no chão livre (o robô mede, você confere com régua)

| # | O que fazer | O que anotar | O que ajusta |
|:--|:--|:--|:--|
| C1 | `andar` 5 vezes seguidas, num chão igual ao da pista | A distância real andada (esperado 900 mm) e o desvio lateral | `kWheelDiameterMm` (mm por pulso) |
| C2 | Uma caixa a 50, 100, 150 e 200 mm da FACE de cada ToF; `tof` em cada distância | A leitura contra a distância real | Limiares (90 e 140 mm), `kArcStartFrontMm`, `kFrontStopMm` |
| C3 | `giro`, com o robô imóvel | A deriva | Se passar de 0,5 grau/s, corrigir a deriva no código |
| C4 | `pivo d` e `pivo e` em área aberta, sobre uma folha com um ângulo reto desenhado | O ângulo real contra o `final=` do log | Escala do giroscópio |
| C5 | `virar d` e `virar e` em área aberta, marcando no chão onde as rodas começaram | Onde o meio do eixo terminou. Esperado: 15 mm à frente do ponto de partida, sem desvio lateral, girado 90 graus | Patinação no arco, `kArcSetbackMm` |
| C6 | `re` 3 vezes | Distância real (esperado 180 mm) e desvio lateral | Confirma a ré |

Com M1, M2 e M3 medidos, troque os três números de `kBody` em
`include/domain/RobotParameters.hpp`: o ponto de início do arco se recalcula sozinho, e a linha
`main: parametros` de cada largada mostra o valor em uso.
