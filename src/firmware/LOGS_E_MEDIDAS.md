# Logs da corrida e medidas do robô

Criado em 10/11; diagnóstico de hardware acrescentado em 12/11 (seção 5). Duas coisas que andam
juntas:

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
| `giro: giroscopio em repouso: X graus/s (min A max B, N leituras, M perdidas): descontado a partir de agora` | O desvio do giroscópio medido com o robô parado. Desde 12/11 ele é **descontado** de todas as leituras (o MPU-6050 pode ter vários graus/s de desvio; isso é normal) |
| `giro: giroscopio em repouso: ... NAO usado, o robo se mexeu ...; continua valendo Y` | As leituras variaram mais de 3 graus/s (o robô não estava parado) ou a média passou de 25 graus/s. Vale a última medida boa |
| `main: largada: tof E= F= D=` | O que os sensores veem antes de andar |
| `main: largada recusada: sem parede a ... do robo ...` | A via 3 não corresponde ao canto. O robô não larga |

### A cada passo

`nav: passo N: cel (lR,cC) rumo X | tof E=mm (estado) F=mm (estado) D=mm (estado) | mapa NLSO=xxxx | dist=D | acao=A -> (lR,cC) rumo X | fora=K bat=V`

- `cel` e `rumo`: onde o robô ACHA que está, no referencial do firmware (linha 0 em cima, coluna 0 à
  esquerda; ele larga na linha de baixo virado para N).
- `tof`: a leitura que decidiu o passo. `9999` = nada ao alcance, `-1` = falha. Estados: `ok`,
  `sigma`, `sinal`, `wrap`, `colado`, `nenhum`... Novo (19/11): `perto` = parede a menos do alcance
  mínimo do ToF (frontal até 40 mm, laterais só a leitura 0): há parede, a distância não vale (o
  `mm` sai 0). Antes saía `0 (ok)`.
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

Logo depois vem (12/11):

`reta: laco: N voltas, media X ms, pior Y ms | tof na reta: erros I2C E= F= D=, pulou E= F= D= | giro: N leituras perdidas, desvio descontado Z graus/s`

- `media`: o laço de controle leva ~2,3 ms por volta. Em 11/11, com o ToF direito sem responder,
  foi a ~20 ms (78 voltas numa ré em vez de ~600) e 4 de 5 rés falharam.
- `erros I2C` e `pulou`: leituras de ToF que falharam nesta reta e as que deixaram de ser feitas
  porque o sensor tinha acabado de falhar (ele fica 0,5 s em silêncio). Tudo zero = sensores bons.

### A cada curva

| Linha | O que diz |
|:--|:--|
| `curva: inicio do arco: alvo X mm, frontal A mm na parada, B mm depois do recuo, ajuste C mm` | De onde o arco parte. `B` é a distância real à parede da frente |
| `curva: inicio do arco: sem parede a frente (...), recuo fixo 75 mm` | Curva numa célula de frente aberta |
| `curva: alvo=90 parou= final= tempo= enc E= D= (esperado) V max= V fim E= D= bat= continuou= giro perdido= <ok ou motivo>` | O resultado. Pulsos muito acima do esperado = rodas patinando |
| `curva: angulo a cada 100 ms: 3 11 22 34 ...` | Onde a curva perdeu velocidade ou parou |
| `curva: laco: pior volta X ms \| giro: N leituras perdidas no total, desvio descontado Z graus/s` | Saúde do laço e do giroscópio na curva (12/11). Pior volta acima de ~10 ms = um sensor I²C sem resposta |
| `tof: depois da curva: E= F= D=` | A pose com que o robô saiu da curva |
| `curva: desfez o arco: de X para Y graus ...` e `curva: tentativa 2 do arco (...)` | O arco travou e foi tentado de novo |

Motivos de falha de curva: `curva travada` (o giroscópio parou de girar por 0,4 s), `tempo de 4,5 s
esgotado`, `giroscopio sem leitura`, `parado pelo operador`, e (19/11) `curva travada e o desfazer
nao voltou: sem progresso (preso, segurado ou rodas patinando), robo torto em N graus` (o desfazer
confere o giro e para em ~0,7 s sem progresso; o robô fica parado e a corrida vai ao Erro).
Numa reta, `rumo perdido: desviou N graus na reta (parede?)` (limite de 10 graus desde 19/11; as
retas boas giram até 2,1).

### No fim

| Linha | O que diz |
|:--|:--|
| `main: chegada nao confere: ...` | No objetivo, um sensor viu passagem onde há borda: o robô se perdeu. A corrida é falha |
| `main: fim da corrida N: SUCESSO/FALHA, passos, celulas, posicao, passagens para fora, eventos perdidos, linhas de log perdidas` | Resumo |
| `main: movimento: N arco(s) repetido(s), N parada(s) pela parede da frente, N leitura(s) do giroscopio perdida(s)` | Contadores |
| `diag: saude 1/2: ...` e `diag: saude 2/2: ...` | Contadores desde o boot (12/11): erros de I²C por sensor, quedas e reinícios dos ToF, linhas perdidas. Ver a seção 5 |
| `nav: mapa lR (NLSO por celula, c0 em diante): PA?P ...` | O mapa inteiro que o robô montou, uma linha por linha do labirinto |

### A qualquer momento, com o robô parado (12/11)

| Linha | O que diz |
|:--|:--|
| `tof: <lado> PAROU de responder aos N s (queda K): 0x29 responde/nao responde -> ...` | Um ToF deixou de responder. O robô confere uma vez por segundo enquanto espera a largada. A causa provável vem na linha (seção 5) |
| `tof: <lado> VOLTOU a responder aos N s` | Voltou sozinho |
| `tof: <lado> em falha aos N s: 0x3X ..., 0x29 ... -> .... Reiniciando pelo XSHUT` e `tof: <lado>: reinicio pelo XSHUT deu certo/FALHOU (...)` | O robô reiniciou o sensor (na corrida, ao sentir as paredes; ou pelo comando `tofrec`) |
| `diag: IMU PAROU de responder aos N s`, `diag: INA219 PAROU de ler ...` | O mesmo aviso para a IMU e o medidor de bateria |
| `teste: N comando(s) recusado(s): desconhecido ou fora da faixa` | Um comando do BLE não foi entendido ou passou do limite (por exemplo, `motor` acima de 7,5 V ou de 3000 ms). Nada foi executado |
| `teste: comandos recebidos durante a corrida foram descartados` | Um comando de teste chegou com o robô correndo. Ele não roda depois da corrida: mande de novo |

## 2. Comandos pelo BLE (robô parado, esperando a largada)

| Comando | O que faz |
|:--|:--|
| `largar`, `parar`, `reiniciar` | Como antes |
| `andar` | Uma célula para a frente |
| `re` | Uma célula de ré (novo) |
| `virar d`, `virar e` | A curva completa da corrida (recuo, arco, volta ao centro) |
| `arco d`, `arco e`, `pivo d`, `pivo e` | Só o arco, ou 90 graus no lugar |
| `tof` | 5 leituras dos três ToF com o robô parado. A 1ª linha costuma sair com lixo: ignore |
| `giro` | Desvio do giroscópio em repouso: média, mínimo e máximo de 250 leituras, temperatura, tempo ligado e o desvio em uso |
| `frente <potência> <ms>` | Teste sem controle |
| `diag` | **Relatório do hardware** (12/11, ~6 s, robô parado): firmware gravado, quem responde no I²C, 20 medidas de cada ToF, IMU, bateria, botão, DIP, encoders parados e contadores. Termina em `diag: fim: OK` ou na lista dos problemas |
| `saude` | Só os contadores desde o boot (2 linhas) |
| `tofmon [s]` | Os três ToF lidos sem parar por `s` segundos (padrão 10, máximo 120): uma linha por segundo e a média, o mínimo e o máximo de cada um. Para ver se um sensor falha parado ou mexendo no cabo, e para calibrar |
| `tofrec` | Reinicia pelo XSHUT os ToF que não respondem, sem reiniciar a placa |
| `motor e\|d\|ed <volts> <ms>` | Roda esquerda, direita ou as duas com tensão fixa (negativa = para trás), até 7,5 V e 3000 ms: pulsos a cada 100 ms, velocidade, corrente e bateria. **Robô suspenso** |
| `rodas` | Varredura das duas rodas nos dois sentidos (~15 s): tensão em que cada uma parte, velocidade e corrente a 3 V e a 6 V, sentido do encoder e se a outra roda contou. Termina em `rodas: resumo: ... -> OK` ou `-> PROBLEMA`, com a lista na linha `rodas: problemas: ...` logo acima. **Robô suspenso** |
| `enc [s]` | Motores soltos por `s` segundos (padrão 10): os pulsos de cada encoder, para girar as rodas à mão. Uma volta para a frente = +285 |
| `calib` | **Calibração sem regravar** (16/11): mostra os valores em uso, um por linha (`calib: nome = valor unidade (faixa) padrao/ALTERADO`). Ver a seção 6 |
| `labirinto 4x8` (ou `4x12`, `8x4`, `12x4`, `4x4`) | **Novo (19/11)**: troca o tipo de labirinto da PRÓXIMA largada, para o 4x8 e o 4x12 em pé, que o DIP não escolhe (a combinação das vias 1 e 2 fechadas é proibida, #393). Nomes em colunas x linhas. O canto é o da via 3. Vale até reiniciar; `labirinto dip` volta ao DIP. Nada se move. O painel recebe o em pé como o deitado (4x8 -> "8x4"), com o mapa girado 90 graus |
| **Botão de largada** (19/11) | **Toque curto** larga, agora ao SOLTAR (antes era ao apertar). **Toque longo** (segurar ~1 s, proposta a confirmar) NÃO larga: alterna a orientação do labirinto, **sem BLE**: 8x4 <-> 4x8, 12x4 <-> 4x12 e **4x4 <-> "4x4 girado"** (para testar o relato girado com o único labirinto físico: o robô navega o mapa normal e só o relato ao painel gira 90 graus). Som: 3 bips curtos = em pé, 1 bip longo = deitado. Log: `main: toque longo: labirinto 4x4 EM PE (relato ao painel: 4x4, mapa girado 90 graus)`. O comando `labirinto` zera o toque longo |
| `calib nome=valor ...` | Troca um ou mais valores e grava na memória do robô (vale depois de reiniciar). Fora da faixa ou nome errado: `calib: RECUSADO, nada mudou`. `calib padrao` volta aos de fábrica |

Depois de um Erro (corrida que falhou, auto-teste reprovado), os comandos de leitura (`tof`,
`tofmon`, `tofrec`, `giro`, `diag`, `saude`, `enc`) continuam valendo: dá para ver onde o robô
parou sem tirá-lo da pista. Os que mexem os motores respondem `comando ... IGNORADO` até
`reiniciar`.

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
| M7 | Diâmetro de cada roda com o pneu | 32 mm (medido em 11/11; o projeto dizia 34) | `kWheelDiameterMm` |
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
| C3 | `giro`, com o robô imóvel e APOIADO (não na mão) | Média, mínimo e máximo | Desde 12/11 o desvio é descontado. `max - min` acima de 3 graus/s = o robô não estava parado |
| C4 | `pivo d` e `pivo e` em área aberta, sobre uma folha com um ângulo reto desenhado | O ângulo real contra o `final=` do log | Escala do giroscópio |
| C5 | `virar d` e `virar e` em área aberta, marcando no chão onde as rodas começaram | Onde o meio do eixo terminou. Esperado: 15 mm à frente do ponto de partida, sem desvio lateral, girado 90 graus | Patinação no arco, `kArcSetbackMm` |
| C6 | `re` 3 vezes | Distância real (esperado 180 mm) e desvio lateral | Confirma a ré |

Com M1, M2 e M3 medidos, troque os três números de `kBody` em
`include/domain/RobotParameters.hpp`: o ponto de início do arco se recalcula sozinho, e a linha
`main: parametros` de cada largada mostra o valor em uso.

## 5. Diagnóstico de hardware pelo BLE (12/11)

No teste de 11/11 o ToF direito parava de responder no meio da bateria, o giroscópio lia de -0,1 a
+5 graus/s parado e linhas de log sumiam, sem nada no log dizer por quê. Agora o robô conta.

### O comando `diag`

Robô parado, apoiado e imóvel. Sai uma linha por assunto, todas com a tag `diag`:

| Linha | O que conferir |
|:--|:--|
| `firmware: versao V, compilado em D H, IDF ... \| motores: ... \| RF-44 ... \| reset=R, ligado ha N s` | `V` tem de ser o commit que você compilou (`git log -1 --format=%h`; com `-dirty` se havia mudança sem commit). `reset`: `LIGOU` ou `reinicio por comando` são normais; `BROWNOUT`, `PANICO` e `WATCHDOG` não |
| `i2c (respostas em 10 chamadas): ToF E 0x30=10, ToF F 0x31=10, ToF D 0x32=10, IMU 0x68=10, INA219 0x40=10 \| 0x29 (...)=0` | Tudo 10, e 0 no `0x29`. Um ToF respondendo em `0x29` reiniciou sozinho |
| `tof <lado> (0x3X): configurado=sim id=0xEACC \| 20 medidas: ok= falha= sem alvo= incerto= \| media= min= max= mm` | `falha=0`. `sem alvo` é normal sem nada à frente |
| `imu: WHO_AM_I=0x68 PWR_MGMT_1= temp= \| acel X= Y= Z= g \| giro X= Y= \| giro Z em repouso: media min max (...), desvio em uso` | Aceleração total perto de 1 g; `max - min` do giro Z abaixo de 3 graus/s |
| `energia: bateria= V corrente= A potencia= W, INA219 ok` | Bateria acima de 7,0 V |
| `entradas: botao START=solto \| DIP agora via1= via2= via3= \| DIP valendo (lido no boot): ...` | Botão solto; a via 3 de agora igual à que vale (se você mexeu, reinicie) |
| `encoders: em 1 s parado contaram E=0 D=0` | Zero. Contando sozinho = ruído no encoder |
| `saude 1/2` e `saude 2/2` | Contadores desde o boot (abaixo) |
| `fim: OK, nenhum problema encontrado` ou `fim: N PROBLEMA(S): ...` | O veredito |

### Os contadores (`saude`)

- `i2c erros tof E= F= D= imu= ina=`: transações que falharam em cada dispositivo. `lentas` são
  as que esperaram o tempo limite de 20 ms (sem resposta nenhuma), e `pior` a mais demorada.
- `tof quedas`: vezes em que o sensor parou de responder com o robô esperando a largada.
- `reinicios XSHUT` e `falhos`: vezes em que o robô reiniciou o sensor, e quantas não adiantou.
- `ble perdidos: linhas= eventos= pedacos=`: linhas de log e eventos que não couberam na fila, e
  pedaços de mensagem que a pilha BLE recusou. Zero = nada se perdeu no robô (se ainda assim faltar
  linha no arquivo, a perda é do lado do computador).
- `giro desvio em uso`: o que está sendo descontado do giroscópio.

Num robô bom, tudo fica em zero do começo ao fim da bateria de testes.

### Quando um ToF para: o que a linha diz e onde olhar

| O que o log diz | Causa provável | Onde olhar |
|:--|:--|:--|
| `0x29 responde -> o sensor REINICIOU sozinho (alimentacao ou XSHUT)` | O sensor perdeu a alimentação por um instante, ou o XSHUT dele caiu a 0, e ele voltou ao endereço de fábrica | Fios de 3V3, GND e XSHUT desse sensor; mau contato que abre com vibração |
| `0x29 nao responde -> mudo (fio SDA/SCL/alimentacao, ou sensor travado)` | O sensor não responde em endereço nenhum | Fios de SDA, SCL, 3V3 e GND desse sensor. Se o `tofrec` o traz de volta, estava travado ou sem alimentação |
| `responde mas nao mede` | Responde ao endereço mas parou de medir | Sensor travado; o reinício pelo XSHUT resolve. Se repetir, trocar o sensor |
| `reinicio pelo XSHUT FALHOU` | Nem reiniciando ele volta | Fio solto de vez, ou sensor queimado. Troque de lugar com outro ToF: se a falha for junto, é o sensor; se ficar no lugar, é a fiação |

Na corrida, um sensor em falha é reiniciado sozinho quando o robô para para sentir as paredes
(~0,6 s); depois de 3 reinícios seguidos sem sucesso o robô desiste dele e a corrida termina em
`falha de sensor por 3 passos`. **O reinício automático não conserta o defeito**: cada um fica
contado em `saude`, e a meta é zero.

### O comando `rodas` (robô suspenso)

Quatro linhas (roda E e D, para frente e para trás) e o resumo:

`rodas: roda E para frente: parte com 1.4 V | 3 V: N pulsos/s (mm/s) I A | 6 V: N pulsos/s (mm/s) I A | encoder: N pulsos, sentido certo | outra roda: 0 pulsos`

- `parte com`: a menor tensão em que a roda girou. Uma roda que precisa de bem mais que a outra
  está prendendo (em 11/11 uma roda prendia na estrutura).
- `sentido ERRADO`: fios do encoder (A e B) ou do motor invertidos. `encoder: 0 pulsos`: encoder
  desligado. `outra roda` contando: fios dos encoders trocados entre as rodas, ou ruído.
- O resumo compara as quatro: velocidades a 6 V a menos de 25% uma da outra, partida abaixo de
  3,5 V e a menos de 1,0 V uma da outra. **São referências iniciais, não calibradas**: valem para
  apontar uma roda muito diferente da outra.

## 6. Calibração pelo BLE, sem regravar (16/11)

O que depende do robô montado e do piso fica na memória do robô (NVS) e é trocado pelo comando
`calib`. Sem nenhum `calib`, valem os padrões, que são os valores de 16/11. No PC:
`python t.py calib-ver`, `python t.py medidas`, `python t.py calib-giro` e
`python t.py calib "nome=valor ..."`.

| Nome no `calib` | O que é | Padrão | Faixa aceita |
|:--|:--|:--|:--|
| `eixo_ate_frente` | Do meio do eixo das rodas até o ponto mais à frente do robô (M1) | 87 mm | 60 a 115 |
| `largura_frente` | Largura do robô na frente, com tudo que sobressai (M2, inteira). CAD: 101 (faces dos ToF laterais) | 101 mm | 80 a 130 |
| `eixo_ate_tof_frente` | Do meio do eixo até a face do ToF frontal (M3). Campo: 85; CAD: 107,75 (CONFLITO, ver `preset_cad`) | 85 mm | 60 a 115 |
| `largura_com_rodas` | Largura total com as rodas (M6). CAD: 108 (pneus de y=33,8 a 54,0) | 108 mm | 0 a 150 |
| `tof_lado_ao_centro` | Da face de um ToF lateral até a linha do meio do robô (M9). CAD 50,5: dá 84 - 50,5 = 33,5 mm de leitura lateral no centro, como na pista | 50,5 mm | 0 a 75 |
| `tof_lado_a_frente_do_eixo` | Quanto os ToF laterais ficam à frente do eixo (M9). Entra na estimativa de pose lateral: 59,15 x tan(rumo) | 59,15 mm | 0 a 115 |
| `escala_giro` | Multiplica o giro Z. O chip do robô (WHO_AM_I=0x72, clone) lê ~8% a menos | 1,08 | 0,90 a 1,20 |
| `freio_arco` | A curva em arco freia estes graus antes dos 90. 3,2 = 4,2 x 0,75 com a velocidade -25% (PROPOSTA A CONFIRMAR) | 3,2 | 0 a 20 |
| `freio_pivo` | O mesmo no giro no lugar. 10,1 = 13,5 x 0,75 (PROPOSTA A CONFIRMAR) | 10,1 | 0 a 30 |
| `modo_curva` | 0 = curva em arco (padrão); 1 = curva fechada com UMA roda (a de dentro parada). Calcula a faixa de início ao aplicar (~1 s) | 0 | 0 ou 1 |
| `freio_uma_roda` | O freio da curva com uma roda (PROPOSTA: o do arco; nenhum log tem curva de uma roda) | 3,2 | 0 a 20 |
| `cabo_frente_mm` | Margem de cabo à frente do ToF frontal. Não existe cabo à frente (só o da bateria, na lateral esquerda) | 0 mm | 0 a 30 |
| `preset_cad` | 1 = frente do CAD (107,25 chassi / 107,75 ToF); 0 = frente de campo (87 / 85). Valores dados DEPOIS na mesma linha valem mais | 0 | 0 ou 1 |
| `autoajuste_freio` | 1 = o robô mede quanto gira depois de frear em cada curva e ajusta o freio da seguinte (entre 2 e 15 graus no arco). Recomeça do `freio_*` a cada boot | 0 | 0 ou 1 |
| `parada_frente` | A reta para quando o ToF frontal lê menos que isto. Com 35 o nariz para a ~1 cm da parede e a curva precisa do "ajuste antes da curva"; o valor calculado para o nariz parar a ~4 cm é 65 | 35 mm | 20 a 90 |
| `centralizar` | 1 = corrige a reta pelos ToF laterais (RF-44, ganhos não calibrados) | 0 | 0 ou 1 |
| `ganho_rumo` | mm de correção entre as rodas por grau de rumo medido pelo giroscópio na reta (1,5 = o equivalente geométrico). 0 = só detecta rumo perdido | 0 | 0 a 3 |
| `rampa_tensao` | Soft-start: a tensão no motor sobe no máximo isto por segundo (o degrau do atrito estático nas duas rodas derrubava a alimentação na partida). 0 = sem rampa. Reduzir a tensão (frear) passa direto | 50 V/s | 0 a 400 |
| `fusao_rumo` | Peso do encoder no rumo da reta (filtro complementar com o giroscópio): limita o desvio do giroscópio em ~desvio/peso sem perder um giro de verdade. 0 = só o giroscópio | 0 | 0 a 2 |
| `reancorar_parede` | 1 = parado no centro da célula, a parede 1 ou 2 células à frente (179 ou 359 mm) corrige a próxima reta pela metade do erro, até 15 mm, só acima de 15 mm (ruído do ToF). Custa ~0,15 s por célula | 0 | 0 ou 1 |
| `parada_dinamica` | 1 = a parada pela frente soma v^2/(2a) ao limiar (a = 1600 mm/s², estimada; teto 20 mm), para parar em `parada_frente` qualquer que seja a velocidade | 0 | 0 ou 1 |
| `vies_giro` | 1 = depois de cada reta, remede o desvio do giroscópio parado (15 amostras) e anda 30% do caminho; descarta se variar mais de 3 graus/s ou diferir mais de 5 do em uso. Custa ~0,3 s por célula | 0 | 0 ou 1 |
| `reta_continua` | 1 = num trecho reto a corrida anda várias células num movimento só (uma aceleração, uma frenagem) e decide antes de cada centro, com as paredes lidas andando, se continua; 0 = uma célula por vez, parando em cada uma (como antes). Comando de teste: `andar N` (2 a 8 células) | 1 | 0 ou 1 |
| `largura_corredor` | Vão livre do corredor. Com uma parede só (o outro ToF "perto" ou sem alvo), o alvo do ToF lateral é meio vão menos o ToF até o centro: 168 mm dá 33,5; o corredor de MDF de teste mede ~150 mm e dá 24,5 | 168 mm | 120 a 200 |
| `ganho_parede` | Pulsos equivalentes por mm fora do centro no termo da parede (RF-44). O termo controla o RUMO (de primeira ordem, não oscila) | 0,8 | 0 a 6 |
| `max_parede` | Teto do termo da parede em pulsos (16 = ~5,6 mm entre as rodas, ~1,2 graus de rumo) | 16 | 0 a 120 |
| `folga_arco` | Folga da quina de fora do arco à parede da frente: `F inicial = raio do canto de fora + folga - ToF até o eixo`. O modelo de 20/11 (`domain/ArcClearance`) mostra que com o robô real (frente 100, largura 112) a janela em que o arco cabe é de -24 a -4 mm; com 20 mm o plano fica em -23 (colado no limite de trás), com 12 mm em -15 (perto do ótimo, -16). Afinar na pista | 12 mm | 0 a 40 |
| `curva_continua` | 1 = com `reta_continua=1`, a curva é um arco sem parar dentro da reta (20/11) | 1 | 0 ou 1 |
| `antecipa_arco` | O arco da curva contínua começa este tanto antes da borda da célula da curva (o modelo dá a maior folga em 16) | 16 mm | 0 a 30 |
| `arco_esq_atraso` | Curva à esquerda: mm a mais antes de começar o arco (+ = mais tarde, perto da parede da frente; - = mais cedo). Em uso em 20/11: -14 | 0 mm | -20 a 20 |
| `curva_cont_vel` | Velocidade do eixo no arco da curva contínua (a reta chega a ~130 e freia até ela) | 80 mm/s | 30 a 150 |
| `curva_cont_bitola` | Bitola do arco com o robô andando (a do giro parado, 74,2, não vale) | 100 mm | 60 a 140 |
| `curva_cont_ganho` | mm de diferença entre as rodas por grau de erro do giroscópio no arco | 1,0 | 0 a 3 |
| `curva_cont_giro_max` | Teto dessa correção | 30 mm | 0 a 60 |
| `curva_cont_trava` | Erro do giroscópio em relação ao planejado que vale como arco preso | 20 graus | 5 a 45 |
| `curva_cont_freio` | O arco para este tanto antes dos 90 graus (o robô ainda gira ao frear) | 4 graus | 0 a 15 |
| `desfazer_tensao_fora` | Desfazer de um arco travado (ré pelo mesmo arco): tensão da roda de fora. Em uso: 3,6 | 2,8 V | 1 a 5 |
| `desfazer_tensao_dentro` | O mesmo, roda de dentro. Em uso: 2,2 | 1,6 V | 0,5 a 4 |
| `desfazer_tempo` | Tempo máximo do desfazer | 2,4 s | 0,5 a 4 |
| `recuo_sem_parede` | Recuo antes do arco parado quando não há parede à frente na célula | 90 mm | 60 a 130 |
| `ajuste_2a_tentativa` | Quanto a 2ª tentativa move o início do arco | 12 mm | 0 a 30 |
| `trava_frente_ate` | Arco travado antes disto = bateu na parede da frente; depois = na quina de dentro | 52 graus | 35 a 70 |
| `arco_quase_pronto` | Um arco parado a partir daqui conta como feito (o ajuste fino fecha o resto) | 78 graus | 60 a 89 |
| `ajuste_fino_min` | O ajuste fino depois da curva só age acima deste erro. Em uso: 0,4 | 1 grau | 0,1 a 5 |
| `ajuste_fino_max` | O ajuste fino corrige até este erro | 15 graus | 0 a 30 |
| `alvo_lateral_dir_mm` | A centralização mira este tanto à direita do centro, em todas as retas (10 jogou o robô na parede direita: SERPENTINA-27) | 0 mm | -20 a 30 |
| `alvo_pos_esq_mm` | Só na reta logo depois de uma curva ou giro à esquerda: a centralização mira este tanto à direita (o cabo fica à esquerda). Em uso: 12 | 0 mm | -20 a 30 |
| `curva_dir_fora` | O recuo da curva à direita se alinha este tanto para a esquerda (0 = não) | 0 mm | 0 a 20 |
| `rumo_max_mm` | Teto da correção do `ganho_rumo` | 6 mm | 1 a 30 |
| `rumo_max_lateral` | Acima deste rumo a estimativa lateral desliga. Em uso: 8 | 5 graus | 1 a 15 |
| `re_vel` | Velocidade máxima da ré (a frente anda a 120) | 70 mm/s | 20 a 150 |
| `re_acel` | Aceleração da ré (a frente usa 225) | 120 mm/s² | 40 a 300 |
| `giro_aberto` | 1 = numa célula aberta (os dois ToF laterais acima de `lado_aberto_mm`) a curva não é o arco: desde 21/11 é a **curva em S** (antes, giro simples no lugar, que não cabe com os postes). Em uso: 1 | 0 | 0 ou 1 |
| `lado_aberto_mm` | ToF lateral acima disto = lado aberto | 150 mm | 100 a 400 |
| `cabo_esq_mm` | Quanto o cabo da bateria sobressai na lateral esquerda (da traseira até 20 mm à frente do eixo). Entra no plano da curva em S. **Estimativa: medir** | 10 mm | 0 a 30 |
| `giro_s_beta_max` | Curva em S: o primeiro giro pode parar até este tanto antes dos 90 graus (0 = só o giro simples, que não cabe) | 25 graus | 0 a 40 |
| `giro_s_folga` | Curva em S: abaixo desta folga o plano é usado, mas o log avisa (`ABAIXO de giro_s_folga`) | 3 mm | 0 a 15 |
| `giro_s_incerteza` | Curva em S: o plano tem de caber com o robô até este tanto fora do eixo do corredor de entrada, para os dois lados | 10 mm | 0 a 25 |
| `bateria_minima` | Abaixo disto (5 leituras) a corrida para. Em uso só nos testes: 5,5 (o INA219 às vezes lê ~1,7 V abaixo do cellmeter) | 6,6 V | 3 a 8 |

As três medidas do corpo decidem onde o arco começa (a linha `calib: fim: arco comeca com o frontal
a X mm` mostra o resultado). Linhas novas no log:

- `main: calib em uso: giro x..., freio arco ... pivo ... graus (autoajuste ...), ganho de rumo ...`:
  em cada largada, logo depois de `parametros`.
- `curva: freio: esta curva freou X graus antes do alvo e girou Y depois; aprendeu (proxima: arco A,
  pivo P)`: só com o autoajuste ligado, depois de cada curva.

A chave da memória do robô muda quando a lista de chaves muda (`calib15` desde 21/11, 60 chaves). Na primeira vez que liga com
um firmware de chave nova, **o robô volta aos padrões**: reaplicar o calib em uso (roteiro em
`robot-tests/relatorios/AJUSTES_FINAIS.md`) e rodar o E0.

### Linhas da curva em S e da versão (21/11)

- `main: firmware: versao V, compilado em D H, IDF I`: no boot. `V` é o `git describe` do build (tag mais próxima e hash).
  A linha de largada também termina com `firmware V`.
- `curva: plano da curva em celula aberta (esquerda|direita, parede a frente|sem parede a frente): eixo X mm, giro G,
  diagonal D mm, saida S mm para dentro, folga F mm (ok|ABAIXO de giro_s_folga), calculado em N ms`: uma por plano (4), ao
  ligar e a cada `calib` que mude o corpo, `cabo_esq_mm`, `giro_s_beta_max` ou `giro_s_incerteza` (só com `giro_aberto=1`).
  `NENHUM MOVIMENTO CABE` = nesse caso a curva vai pelo arco.
- `curva: celula aberta (lados > 150 mm): curva em S em vez do arco`, seguida de
  `curva: curva em S a esquerda|direita: frontal F mm, eixo a X mm do centro, anda M, gira G, diagonal D mm, completa; folga do
  plano P mm`. Depois vêm as linhas normais dos dois giros (`curva: alvo=.. parou=..`), da reta `diagonal da curva` e do ajuste
  fino.

## 7. Achados de 16/11 e o que reconferir no robô (19/11)

### O que mudou no firmware
- ToF abaixo do alcance mínimo vira `perto` (antes `0 (ok)`); o arco recua só `alvo - 40 mm` e mede
  de novo.
- O arco planeja com a bitola efetiva de 74,2 mm (`kArcEffectiveTrackMm`), medida em 45 arcos:
  antes o caminho fechava com raio ~80,7 mm em vez de 90 mm, ~9 mm para dentro e curto. Vale com a
  escala do giro de 1,08.
- Desfazer do arco com conferência de progresso e motivo explícito; limite de rumo da reta de 10 graus.

### Duplicação de comandos de teste (A1 2x, B1 3x, C8 2x): não vem do firmware
Os 15 `andar` do B1 já estão no `comandos.txt` (escrito pelo `t.py`); `ponte.out` encaminhou 150 dos
154 comandos e o firmware executou cada linha recebida uma vez. Os marcadores `TESTE ... tentativa N`
também são do `t.py`. Não há ID de comando no firmware porque ele não distingue repetição legítima
("andar" 5 vezes) de duplicata; a correção é no runner (trava por `ok`).

### Pivô no lugar (não alterado)
Termina em ~93,7 graus (inércia ~17 graus a 300 graus/s; ~0,057 s x velocidade). O Navigator usa o
pivô no fallback sem espaço para recuar (A1 virado para A2). A bitola efetiva do pivô também deu
68-78 mm (`log_robo.txt`), a mesma causa do arco. Se for corrigir: reduzir o pico ou planejar o
pivô com a bitola efetiva. Aguarda medida com transferidor.

### Roteiro de reconferência (critério de aprovação)
| Comando | Critério |
|:--|:--|
| `tofmon 5` com a parede a 30, 40, 50 mm do frontal | nenhuma leitura `0 (ok)`: abaixo de 40 mm sai `perto`; a 50 mm, 50 +- 10 mm |
| `tof` no centro de A2 e C1 | laterais 24-45 mm lidos como distância; frontal `perto` ou >= 40 |
| `virar d` em A2 (3x) e `virar e` em C1 e B2 (3x) | giro final 90 +- 2 graus; depois da "volta ao centro" o eixo a <= 5 mm do centro (régua/foto); sem encostar |
| `andar` (5 células) | 506-511 pulsos, giro <= 2 graus (limite de falha: 10) |
| `re` (3 células) | 504-511 pulsos, giro <= 2 graus |
| `virar d` segurando o robô, depois soltando | detecta a curva travada; com o robô solto o desfazer volta (<= 4 graus) e a 2ª tentativa funciona; ainda segurado, para em ~0,7 s com o motivo "sem progresso" |
| Corrida D1 (3x) | 12 passos na ordem, sem `rumo perdido`; depois de cada arco, `tof` lateral sem E=0 |
| `pivo d` / `pivo e` (se o fallback do A1 importar) | informativo: ~93,7 graus; conferir com transferidor |

### Novidades de 19/11 (itens 1 a 6)
- **Pose lateral** (item 4): na reta com `centralizar=1`, a linha `reta: pose lateral: eixo X mm para a direita do centro, rumo Y graus, correcao Z mm` mostra a estimativa (`(sem estimativa)` = sem parede válida ou rumo acima de 5 graus). Os ToF laterais ficam 59,15 mm à frente do eixo e o rumo é descontado; nunca entram leitura inválida nem 0 mm. O padrão de `centralizar` continua o do Kconfig (desligado): **ligue depois da reconferência**.
- **Curva com uma roda** (`calib modo_curva=1`): a linha `curva: uma roda: eixo comeca N mm antes do centro, frontal esperado ..., termina 44 mm a frente e a K mm do eixo da saida`. O eixo começa o giro antes do centro da célula (faixa que cabe, pelo CAD: 55 a 77 mm; pela frente de campo, 40 a 77), pela odometria; o ToF só confirma. O robô sai 15 a 33 mm fora do eixo da saída: a pose lateral corrige na reta seguinte.
- **Velocidade -25%**: reta 150 mm/s, arco 67,5 graus/s. Modelo de tempo no pior caso do 12x4 (192 passos, metade curvas): 8,6 min em 16/11, 10,5 min agora. O **limite de tempo de 10 min** para a corrida com `tempo limite de 10 min esgotado: N passos, M celulas`.
- **Aviso de boot**: `calib: AVISO: a frente em uso (chassi 87.0, ToF 85.0 mm do eixo) difere do CAD ...` enquanto a medida de paquímetro não decidir entre campo e CAD.
- **Flood Fill**: 7 testes de propriedade contra um BFS independente (4x4, 4x8, 8x4, 4x12, 12x4): nenhum contra-exemplo.

### Bloco O do `t.py` (19/11): orientação, robô parado
`python t.py O1` (toque longo alterna), `O2` (toque curto larga ao soltar), `O3` (4x4 girado: o relato ao painel gira 90 graus) e `O4` (comando `labirinto 4x8`). O firmware loga `labirinto da proxima largada: ...` quando o tipo muda e `relato ao painel: labirinto X, largada x= y= rumo ...` na largada; o roteiro confere a posição girada (largada à esquerda: x=3 y=3 rumo O no 4x4; à direita: x=0 y=3 rumo L).

### Roteiro de reconferência (19/11), com critério de aprovação
| Item | Como | Aprovado se |
|:--|:--|:--|
| **Paquímetro, frente** (decide campo x CAD) | Do meio do eixo das rodas até o ponto mais à frente do chassi, e até a face do ToF frontal; depois `calib eixo_ate_frente=.. eixo_ate_tof_frente=..` | os dois valores medidos; se der perto de 107, `calib preset_cad=1`; some o aviso de boot |
| **Cabo da bateria** | Não há cabo à frente. O cabo vermelho e preto da bateria sai ~10 mm para fora da lateral esquerda e prende nas paredes (equipe de energia) | `cabo_frente_mm` = 0 |
| Pose lateral | `calib centralizar=1`; `andar` 5 células pelo corredor, saindo 10 mm deslocado | no fim, `lat E`/`D` com diferença <= 10 mm; linha `pose lateral` com estimativa; sem raspar |
| Curva com uma roda | `calib modo_curva=1`; `virar e` e `virar d` em A2 e C1, 3 vezes cada | giro final 90 +- 3 graus; sem encostar; a roda de dentro anda <= 10 mm; anotar o freio aprendido (`autoajuste_freio=1`) e o desvio lateral final (esperado 15 a 33 mm) |
| Atrito do apoio frontal | Mesma curva, comparar com o arco | registrar o tempo e a inércia; sem referência anterior |
| Velocidade -25% | `andar`, `re`, `virar d/e` (arco) e a corrida D1 | reta 506-511 pulsos e giro <= 2 graus; arco 90 +- 2 graus (se passar, `calib freio_arco=..`); D1 12 passos na ordem; tempo da D1 anotado (modelo: ~45 s) |
| Limite de 10 min | Corrida longa ou `tempo` simulado | termina em Erro com o motivo, motores parados |
| Labirinto em pé | Com o robô parado: `labirinto 4x8`, depois `largar` no canto da via 3 | o log `labirinto diferente do DIP ... (comando BLE)`; o painel mostra "8x4" com o mapa girado; o robô resolve sem bater |
| **Toque longo no 4x4** (sem BLE) | Segurar o botão ~1 s (3 bips), conferir o log, depois um toque curto para largar a corrida D1 | log `toque longo: ... EM PE`; a corrida resolve igual; o painel mostra o mapa 4x4 **girado 90 graus** com a largada embaixo; outro toque longo (1 bip longo) volta ao normal |
| Toque curto | Apertar e soltar rápido | a corrida larga ao soltar, não ao apertar |

