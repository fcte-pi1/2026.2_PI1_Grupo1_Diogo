Você vai conduzir comigo o teste do robô micromouse nos LABIRINTOS OFICIAIS. O objetivo de hoje é **COLETAR DADOS**, não consertar: logs organizados das mesmas manobras e corridas que já fizemos na nossa pista (para comparar) e de corridas nos layouts oficiais. As correções serão feitas depois dos testes de 23/11, a partir destes logs. Você faz TUDO no computador: compila, grava, liga a ponte Bluetooth, manda os comandos, lê os logs, julga e registra. Eu só mexo no robô e nas peças do labirinto. Fale comigo em português, em linguagem simples.

**Eu não conheço o robô nem o projeto.** Cada instrução física tem de ser explícita, numerada, uma ação por item, dizendo o que pegar, onde pôr, para que lado virar e o que eu devo ver quando der certo. Nunca escreva "posicione o robô" sem dizer a célula e para onde a frente aponta. Nunca me peça para ler log, rodar comando ou decidir se passou: isso é com você.

## Leia antes de qualquer coisa

1. `teste-v3/resultados/MUDANCAS.md`: o que mudou no firmware até 17/11 e o que está pendente.
2. `teste-v3/resultados/RESULTADOS.md`: o que aconteceu em 16/11 (é a base de comparação de hoje).
3. `teste-v3/t.py` inteiro, inclusive os comandos `calib-ver`, `calib`, `medidas`, `calib-giro` e **`corrida`** (corrida em qualquer labirinto, sem sequência esperada: salva o log `resultados/<rotulo>_t<N>.log`, imprime métricas e acrescenta uma linha em `resultados/corridas.csv`).
4. `teste-v3/ponte.py`, `teste-v3/MEDICOES.md`, `teste-v3/ROTEIRO_18-11.md`, `src/firmware/LOGS_E_MEDIDAS.md` (seções 1, 5 e 6).

## Fatos do projeto

1. O robô é SÓ de exploração: começa sabendo só as bordas, descobre as paredes pelos ToF e resolve pela inundação. Labirintos só 4x4, 8x4 e 12x4 (4 linhas); largada sempre num canto da linha de baixo; objetivo sempre no canto oposto. Tamanho e canto vêm da chave DIP (vias 1 e 2: 0 0 = 4x4, via 1 fechada = 8x4, via 2 fechada = 12x4, as duas fechadas é proibido; via 3 ABERTA = borda à ESQUERDA do robô na largada, FECHADA = borda à DIREITA), lida só no boot.
2. O mapa é zerado a cada largada. Nada pode depender de um layout fixo.
3. Os labirintos oficiais são **modulares**: dá para montar neles a NOSSA pista 4x4 (o desenho abaixo) e repetir os testes de 16/11 no piso e nas paredes oficiais, e depois montar os layouts oficiais.
4. O firmware novo (16-17/11) tem o comando `calib`. Tudo o que é novidade está DESLIGADO por padrão. **Hoje o robô roda o dia todo com os valores padrão** (a "linha de base"), menos no bloco opcional de experimentos do fim, que tem rótulos próprios.
5. **Hoje NÃO se altera código, nem se grava firmware além do da Etapa 1.** Se algo falhar, registre e siga: a correção é depois de 23/11. Os únicos `calib` permitidos são os do bloco de experimentos (com o meu `ok`, um por vez) e o `calib "padrao"`.

### Comportamentos já conhecidos (16/11), para procurar nos logs de hoje

| # | Comportamento | Onde aparece no log |
|:--|:--|:--|
| K1 | Antes das curvas com parede à frente, o nariz para a ~1 cm da parede, o ToF lê errado (abaixo de 40 mm) e o robô faz um "ajuste antes da curva" a mais | `curva: inicio do arco: ... frontal X mm na parada`; `reta: ajuste antes da curva` |
| K2 | Depois das curvas à ESQUERDA, o lado de dentro do robô termina colado na parede (0-12 mm) | `tof: depois da curva: E=... D=...` |
| K3 | Folga lateral pequena: na curva à esquerda em C1 o robô pegou a quina da parede embaixo de B1 e torceu 27° na reta seguinte | `reta: andar ... giro=` alto; `rumo perdido` |
| K4 | O robô não corrige o rumo nem a posição nas retas (centralização e rumo pelo giroscópio desligados) | `lat E=`/`lat D=` muito diferentes; `giro=` crescendo |
| K5 | ToF direito instável (vai ser ressoldado) | `tof: direito PAROU`; `saude` com erros no D |
| K6 | Inércia das curvas depende do piso (no papel escorregou ~4 cm) | `curva: alvo=90 parou=P final=F` (F − P) |
| K7 | "Desfez o arco" não voltou no C8 | `curva: desfez o arco ... NAO voltou` |
| K8 | Comandos executados em dobro pelo ambiente (A1, B1, C8 em 16/11) | `feitos.json` com duas entradas para um `ok` |

Em cada teste, diga em uma frase se algum K apareceu, e registre com `python t.py nota`.

## Regras de segurança (valem sempre)

1. **Bateria e USB nunca ligados ao mesmo tempo.** O USB serve só para gravar, com a bateria desligada. Antes de gravar, leia o boot pela serial: a linha `INA219 PAROU de ler (ou a bateria esta abaixo de 1 V)` confirma que a bateria está fora. Se o INA219 estiver lendo, NÃO grave.
2. **Nenhum comando que mexe os motores sem o meu `ok`.** `pular`: registre como pulado. `repetir`: refaça. `parar`: rode `python t.py parar` NA HORA, antes de qualquer outra coisa.
3. **Fique sempre em condição de frear:** testes de motor em segundo plano, acompanhando a saída. Plano B (diga antes do primeiro teste de motor): levantar o robô pelo chassi e desligar a bateria.
4. **Execução duplicada (K8).** Todo comando que mexe os motores roda por uma trava de execução única com um nome FIXO por `ok` meu (por exemplo `OF4A_ok_2`), nunca calculado a partir do número da tentativa. Crie a trava no início (um script que faz `mkdir` de uma pasta com o nome e recusa se ela já existir). Depois de cada teste, confira em `teste-v3/resultados/feitos.json` que ele rodou uma vez só; se rodou duas, me avise na hora.
5. **Nunca rode `git commit`, `git add`, `git stash`, `git reset`, `git checkout` de arquivo, `git am` nem `git push`.** O git é só para ler.
6. **A chave DIP só é lida quando o robô liga.** Depois de eu mexer nela: `python t.py reiniciar` e confira a linha `entradas:` do `python t.py cmd "diag" 12`.
7. **Corrida em FALHA:** o robô fica em Erro. Antes de me mandar tirar o robô do lugar: `python t.py cmd "tof"`, me pergunte a célula e para onde a frente aponta, anote com `nota`, e só então `python t.py reiniciar`.
8. **Respostas ambíguas:** se eu responder só "ok" a uma pergunta de sim/não ou de célula, pergunte de novo.
9. **Dois reinícios sozinhos do robô: pare tudo.** Um reinício: `python t.py cmd "diag" 12`, registre o `reset=` (`LIGOU (poweron)` = energia cortada: chave ou conector da bateria).

## Formato das instruções físicas

```
TESTE <ID> — <título>   (tentativa N)
O que este teste confere: <uma frase simples>
Faça agora:
1. ...
O que vai acontecer: <o robô anda X, gira Y, por Z segundos / nada se mexe>
Cuidado: <...>
Responda "ok" quando estiver pronto (ou "pular").
```

Rode SEMPRE os testes e as corridas do `t.py` com `--auto` (sem `--auto` ele espera um "ok" digitado e trava em segundo plano), pela trava da regra 4 e em segundo plano quando mexem os motores. Para os testes do `t.py`, os itens de "Faça agora" são TODOS os do PREPARO (`python t.py preparo <ID>`), completados para um leigo. Para as corridas livres, o preparo é: chave DIP, robô na célula de largada, no meio, alinhado, frente para a célula vizinha da linha de baixo (diga qual e a direção no desenho), mãos fora do labirinto. Depois do teste, resultado em uma ou duas frases; números só se eu pedir.

**Glossário:** frente do robô = a ponta mais longe das rodas, onde fica o sensor do meio. Esquerda e direita = as de quem olha o robô por trás. APOIADO = sobre um suporte firme, rodas no ar, nunca na mão. Centrado na célula = no meio, alinhado com o corredor, mãos fora.

**A nossa pista 4x4** (letras = colunas da esquerda para a direita; números = linhas de cima para baixo):

```
        A     B     C     D
     +-----+-----+-----+-----+
  1  | A1    B1    C1    D1  |
     +-----+-----+     +-----+
  2  | A2    B2  | C2  | D2  |
     +           +     +     +
  3  | A3    B3    C3    D3  |
     +     +-----+-----+-----+
  4  | A4    B4    C4    D4  |
     +-----+-----+-----+-----+
```

No log, largando de D4 ou D1 virado para a coluna C: letra = A + linha do log, número = 4 − coluna do log. Para os layouts oficiais, use o mesmo esquema de nomes (letras = colunas da esquerda para a direita, números = linhas de cima para baixo, com a linha 4 embaixo) e explique a conversão do log para cada largada.

## Etapa 0: máquina e pastas (sem o robô)

1. `git status --short` e `git log --oneline -3`. Confira que existem `src/firmware/include/domain/Calibration.hpp`, o comando `calib` em `src/firmware/src/main.cpp` e a função `free_run` em `teste-v3/t.py`. Se faltar algo, pare e me avise.
2. Testes de host (CMake + GoogleTest, avisos como erro, build fora do repositório): esperado **252** passando.
3. ESP-IDF 5.3 em `~/esp/esp-idf` (`. ~/esp/esp-idf/export.sh`). Ponte pelo Python do Windows `C:\Users\samue\AppData\Local\Programs\Python\Python312\python.exe`, com o caminho de `wslpath -w teste-v3/ponte.py`. Placa pelo `usbipd` (em 16/11, CH343 no busid `2-1`; confira com `cmd.exe /c "usbipd list"` e `cmd.exe /c "usbipd attach --wsl --busid <id>"`). Boot pela serial: `pyserial` do ambiente Python do ESP-IDF, 115200, reiniciando pelo RTS.
4. Pergunte antes e mova o conteúdo atual de `teste-v3/resultados/` (menos `MUDANCAS.md`) para `teste-v3/resultados/16-11/`. Os dados de hoje ficam em `teste-v3/resultados/`. No `RESULTADOS.md` novo, comece com um cabeçalho "18/11 — labirintos oficiais (linha de base, calib padrão)".

## Etapa 1: gravar o build novo (o robô está com um build de TESTE de 16/11, centralização ligada)

1. Compile `src/firmware/esp32` com exatamente `CONFIG_RATO_LOG_RETA=y`, `CONFIG_RATO_FIOS_MOTORES_TROCADOS=y`; `RATO_BANCADA`, `RATO_CENTRALIZAR_PAREDES` e `RATO_SLOW_DECAY` desligados. Build e `sdkconfig` próprios, fora do repositório; confira as cinco linhas `RATO`; apague o `esp_app_desc.c.obj` do build antes, para o carimbo sair novo. Log em `resultados/build.log`.
2. Gravar, um passo por mensagem com o meu `ok`: desligar a bateria → USB na porta UART → você confere a bateria fora pelo boot, grava e lê o boot 10 s → tirar o USB → ligar a bateria.
3. No boot: `Compile time` da sua compilação; os três ToF prontos em 0x30/0x31/0x32; as linhas `calib:`; e NÃO pode aparecer "centralizacao ... LIGADA". Guarde `boot.log`, `flash.log` e `versao-firmware.txt`.
4. Ponte em segundo plano, `estado.txt` conectado (até 40 s), `python t.py calib-ver`. Se algum valor vier `ALTERADO`, me mostre e pergunte se volto ao padrão (`python t.py calib "padrao"`): hoje a linha de base é com o padrão.

## Etapa 2: o labirinto oficial em si (sem o robô andando)

1. Peça uma **foto de cima** do labirinto oficial montado e as medidas com régua (diga onde medir, uma por vez):
   - De centro a centro de duas células vizinhas, em 3 lugares (o firmware usa 180 mm).
   - A espessura de uma parede (o firmware usa 12 mm).
   - A largura livre de um corredor, em 3 lugares (o firmware supõe 168 mm).
   - A altura das paredes; a cor e o material das paredes e do piso; se as junções entre módulos têm degrau ou fresta.

   Registre tudo no `RESULTADOS.md`. **Se o centro a centro passar de 180 ± 3 mm ou o corredor de 168 ± 3 mm, avise na hora**: as retas andam 180 mm fixos, e o robô vai errar a posição. Mesmo assim siga coletando, e anote em cada corrida.
2. `python t.py portao` e `python t.py H1` (robô apoiado). Se o ToF direito foi ressoldado, faça também o **H3** (60 s mexendo nos cabos com um palito de plástico). Se aparecer `tof: direito PAROU`, registre (K5) e pergunte se seguimos. O item 3 abaixo traz a comparação com 16/11.
3. **Regressão pós-ressolda.** Faça a conferência da tabela abaixo (H2, H4, H5, H6, H7 e H8, que somam ~10 min com o robô apoiado), além do H1 e do H3. É a única hora do dia em que o robô fica no suporte. Se a Etapa 2 falhar em algum item crítico (I²C, ToF, `saude`), pare e me diga antes de seguir para o chão.

### Regressão pós-ressolda: nada que já estava bom pode ter piorado

O ToF direito foi ressoldado depois dos testes de 16/11. Mexer num módulo pode afetar o que divide fio com ele (3V3, GND, SDA, SCL) ou ficava ao lado (outros ToF, giroscópio, medidor de bateria, fios dos motores e dos encoders). **Compare cada item com a linha de base de 16/11** (está em `teste-v3/resultados/16-11/RESULTADOS.md` e nos `.log` de lá). Um valor que ainda "passa" mas piorou além da tolerância é regressão: registre com `python t.py nota` e me avise na hora.

Antes de tudo, me pergunte e registre: **o que exatamente foi ressoldado** (quais fios do módulo direito: 3V3, GND, XSHUT, SDA, SCL, GPIO1), se **mais alguma coisa foi mexida** (outros sensores, motores, encoders, conectores, a placa, a bateria), e peça uma **foto de cima e uma de perto** da região mexida. Registre no `RESULTADOS.md`.

| O que conferir | Teste | Linha de base de 16/11 | Regressão se |
|:--|:--|:--|:--|
| Os 5 dispositivos do I²C respondem, nada em 0x29 | H1 (`diag: i2c`) | ToF E/F/D, IMU e INA219 = 10/10; 0x29 = 0 | qualquer um abaixo de 10, ou 0x29 acima de 0 |
| Os 3 ToF medem sem falha, inclusive o direito | H1, H2 (`tofmon 30`) | 20/20 e 327/327 medidas, 0 falhas; direito a 266 mm de uma parede, estável (260 a 273) | qualquer falha, ou variação do direito acima de ±15 mm parado |
| Erros e quedas desde o boot | H8 (`saude`) | zero erros de I²C, zero quedas, zero reinícios XSHUT | qualquer valor diferente de zero |
| Giroscópio parado | H1 e H4 (3 min) | desvio -0,15 °/s; variação máxima 0,7 °/s; mudança do desvio em 3 min 0,02 °/s; 0 leituras perdidas | variação acima de 2 °/s, mudança acima de 1 °/s, ou leituras perdidas |
| Identidade do chip e gravidade | H1 (`diag: imu`) | `WHO_AM_I=0x72`; aceleração Z 1,02 g | outro `WHO_AM_I`, ou Z fora de 0,95 a 1,05 |
| Medidor de bateria | H1, H8 | lê (8,0 V com a bateria cheia), `INA219 ok` | não lê, ou diferença de mais de 0,3 V para o multímetro |
| Encoders parados | H1 | E=0 D=0 em 1 s | qualquer pulso |
| Encoders girando | H5 | esquerda 284 a 294, direita 289 a 291 pulsos por volta | fora de 225 a 345, ou diferença entre as rodas acima de 15% |
| Rodas e motores | H6, H7 | a 6 V: 2293 a 2312 pulsos/s (diferença 1%), 0,09 A; H7: 6 V por 1,5 s, 3287 e 3276 pulsos, corrente média 0,11 A, bateria mínima 8,02 V | diferença entre as rodas acima de 5%, corrente acima de 0,2 A, ou reinício |
| Sensores contra parede | B3 (6 distâncias) | erros de 16/11: esquerdo +2,9 a +10,5 mm; frontal +4,4 a +7,2 mm; direito -9,2 a +6,3 mm | erro de qualquer sensor mudou mais de 5 mm em relação a 16/11 |
| Reta e ré | B1, B2 | 506 a 510 pulsos por reta, giro até 1,3°, régua 895 mm e 540 mm | pulsos fora de 496 a 526, ou giro acima de 3° |

Além da tabela:
1. **Multímetro no módulo direito**, com a bateria ligada (se eu tiver): a tensão 3V3 do módulo tem de ficar **estável** entre 3,2 e 3,3 V, como a do esquerdo (3,25 V), e a resistência do GND entre os módulos esquerdo e direito tem de ficar **abaixo de 0,3 ohm** (em 16/11 era 1,0 ohm, contra 0,02 ohm do VIN).
2. **`python t.py cmd "tofmon 120" 130`** com o robô parado e depois com **eu balançando de leve os fios do módulo direito** (H3): zero falhas nos três sensores.
3. **Uma reta e uma curva no chão** (`andar` x3 e `virar d` x1 e `virar e` x1) logo depois: o ToF direito não pode cair durante o movimento (a linha `reta: laco:` com `erros I2C` e `pulou` iguais a zero).

Se qualquer item da tabela ou da lista regredir: **não siga para o bloco seguinte**. Diga qual sensor ou fio aponta a evidência (sempre classifique como hardware, sem contornar por software) e o que eu devo olhar no robô.

### Se a equipe de eletrônica mexer em MAIS do que o ToF direito

Não se sabe, antes de chegar, quais componentes serão ressoldados. Por isso **não assuma que só o ToF direito foi mexido**: confira o robô inteiro, componente por componente, na tabela abaixo. Pergunte a quem ressoldou **a lista do que foi mexido**, pegue-a por escrito e peça uma foto de cima e outra de perto de cada região, mas **rode as conferências de tudo, mesmo do que "não foi mexido"**: um fio que encosta na vizinhança, ou uma solda quente que solta o pino ao lado, só se descobre medindo.

| Componente | Como conferir | Passa se | Atenção |
|:--|:--|:--|:--|
| **ESP32** (placa e pinos) | H1 inteiro; `diag: firmware` | boot sem `BROWNOUT`/`PANICO`/`WATCHDOG`; `reset=LIGOU` | um pino mexido pode trocar um GPIO: confira todos os itens abaixo |
| **3 ToF** (E, F, D) | H1, H2, H3 | 20/20 medidas sem falha em cada um, endereços 0x30/0x31/0x32, nada em 0x29 | se dois sensores trocarem de lugar, o `diag` mostra E e D com leituras trocadas: ponha um objeto só de um lado e veja qual lê |
| **Giroscópio (MPU)** | H1, H4 | `WHO_AM_I=0x72`, desvio ~-0,15 °/s, variação até 0,7 °/s | se o `WHO_AM_I` mudar, o chip foi trocado: a escala `escala_giro` (1,08) não vale mais, refaça o `calib-giro` |
| **Medidor de bateria (INA219)** | H1 `energia:`; H7 | lê a tensão, a corrente e a potência, e a tensão difere do multímetro em menos de 0,3 V | se o INA219 for refeito, os dois fios de medição podem ficar invertidos: a corrente dá negativa |
| **Motores** | H6, H7 | as duas rodas giram nos 4 casos (frente e trás de cada uma), velocidades a 6 V iguais (diferença abaixo de 5%) | **fios de motor trocados mudam a opção `RATO_FIOS_MOTORES_TROCADOS`**: se a roda esquerda girar quando o teste manda a direita, ou a roda for para trás quando devia ir para a frente, é troca de fios. NÃO mude o build hoje: registre e me avise |
| **Encoders** | H5, H6 | cada roda conta ~285 pulsos por volta, no sentido certo, e a outra roda não conta | fios A e B de um encoder trocados dão sentido ERRADO; fios entre as rodas trocados dão "outra roda contando" |
| **Driver dos motores (ponte H)** | H6, H7 | os mesmos de motores e encoders; bateria mínima acima de 7,5 V em H7 | aquece: se o chip estiver muito quente ao toque depois do H7, avise |
| **Regulador de tensão** | multímetro: 3V3 da placa e dos 3 módulos ToF, com a bateria ligada | 3,2 a 3,3 V estável nos quatro pontos (em 16/11, esquerdo 3,25 V) | oscilação ou queda abaixo de 3,0 V: solda do regulador ou de um módulo |
| **Chave DIP (3 vias)** | `python t.py cmd "diag" 12` e a linha `entradas:`. Eu mexo **uma via de cada vez** (diga qual, e o lado), e você repete o `diag` | cada via muda sozinha e volta; as três leem aberta e fechada | uma via que não responde ou mexe outra: pino ou solda |
| **Botão START** | `diag`, linha `entradas: botao START=`; peça para eu apertar e segurar, e leia de novo | `solto` e depois `pressionado` | se travar em `pressionado`, o robô larga sozinho no boot: avise antes de qualquer teste |
| **LEDs e buzzer** | peça-me para olhar e ouvir ao ligar a bateria e ao mandar `largar` (o LED azul acende quando o robô está pronto; o buzzer toca ao largar e ao falhar) | LED azul aceso pronto; buzzer toca | se o buzzer ou o LED de erro ficarem ligados direto, é curto num transistor ou resistor |
| **Conector e chave da bateria** | H7 (bateria não cai abaixo de 7,5 V) e o robô mexido de leve com a bateria ligada | nenhum reinício (`reset=LIGOU (poweron)` aparece só quando eu ligo) | em 16/11 o robô reiniciou uma vez, e o motivo foi um corte de energia (provável mau contato): se acontecer de novo, é prioridade |
| **Fios soltos** | olhar o robô de cima e de lado, com a lanterna | nenhum fio ou terminal sai do contorno do chassi (um fio solto encostou na parede no C7 em 16/11) | prenda com fita |

Se mais de um componente mudou, **repita a regressão completa** (H1 a H8) depois de **cada** grupo de soldas, e não só no fim: assim fica claro qual mexida causou o problema.

4. Se eu tiver as medidas do robô, `python t.py medidas`, seguindo o `MEDICOES.md`, uma pergunta por vez. Se não, siga com o padrão.

## Etapa 3: caracterizar parede e piso oficiais (coleta, ~20 min)

Rótulos de todos os logs com o prefixo `OF-`.

1. **ToF nas paredes oficiais** (a cor e o material mudam a leitura): o B3 com uma **peça de parede oficial** no lugar da caixa, para o frontal e um lateral, nas distâncias 50, 100 e 150 mm (`python t.py B3-F50`, `B3-F100`, `B3-F150`, `B3-E50`, `B3-E100`, `B3-E150`). Monte a tabela (real, lido, erro) e compare com a de 16/11.
2. **Inércia das curvas no piso oficial (K6):** numa área aberta do piso oficial (ou numa célula grande sem paredes perto), `python t.py B5d` x2 e `python t.py B5e` x2. Anote `parou` e `final` de cada uma e compare com 16/11 (arco: ~82,7 → ~89,5).
3. **Escala do giroscópio (só medir):** `python t.py calib-giro --auto`, num corredor reto oficial com parede contínua de um lado e 3 células. NÃO grave o valor proposto: só registre (o `--auto` não grava). Se o `calib-giro` não ler a parede, pule.

## Etapa 4: a NOSSA pista montada com os módulos oficiais (comparação direta com 16/11)

1. Me mostre o desenho da nossa pista e me guie para montá-la com os módulos oficiais, **parede por parede**, numa área 4x4 do labirinto oficial (diga quais peças tirar e onde pôr). Depois confira comigo parede por parede e peça uma foto de cima.
2. Rode, nesta ordem, com os testes do `t.py` (eles já conhecem esta pista): `python t.py portao`, C1, C2, C3, **C4 x3, C5 x3, C6 x3, C7 x3**, C8 x1, depois **D1 x3** e **D2 x3** (D1: via 3 ABERTA, largada em D4 virado para C4; D2: via 3 FECHADA, largada em D1 virado para C1; `python t.py reiniciar` sempre que a via 3 mudar).
3. Em cada curva, anote para a comparação com 16/11: `frontal X mm na parada` (K1), "ajuste antes da curva" (K1), `tof: depois da curva` (K2), `final` (K6), e se encostou (pergunte-me, e se encostou, qual canto do robô e qual parede).
4. Nas corridas, um passo fora da ordem esperada (D1: D4, C4, B4, A4, A3, A2, B2, B3, C3, C2, C1, B1, A1; D2: D1, C1, B1, A1, ré para B1 e C1, C2, C3, B3, A3, A4): mostre o mm de cada sensor e o `mapa NLSO` daquele passo e diga qual parede foi lida diferente. Em 16/11 o D1 falhou no passo 11 (K3): veja se repete.
5. Regras de parada: uma curva de C4 a C7 encostou ou falhou nas 3 vezes → anote e siga para a Etapa 5 assim mesmo (hoje é coleta), mas me avise antes. Bateu forte ou prendeu em 2 corridas seguidas → pare a Etapa 4 e vá para a 5.

## Etapa 5: os layouts oficiais (a coleta principal)

Para cada layout oficial que a organização montar (ou que eu montar com os módulos, seguindo as regras oficiais):

1. Peça uma **foto de cima** do layout. Desenhe-o em texto, no mesmo formato da nossa pista (com as linhas e colunas nomeadas), e confira comigo **parede por parede** antes de rodar. Salve o desenho no `RESULTADOS.md`, com o rótulo do layout (`OF-4x4-A`, `OF-8x4-A`, `OF-12x4-A`...).
2. Chave DIP do tamanho; me diga a via 3 para cada canto de largada; `python t.py reiniciar`; confira a linha `entradas:`.
3. Corridas: `python t.py corrida <rótulo>-<canto> "<descrição: tamanho, layout, canto, via 3, calib padrão>" --auto`. Por exemplo: `python t.py corrida OF-4x4-A-esq "4x4 layout A, largada no canto de baixo à esquerda, via 3 aberta" --auto`. Faça **3 corridas de cada canto de largada permitido**, reposicionando o robô no meio da célula de largada a cada vez.
4. Depois de cada corrida, me pergunte: em que célula o robô parou; quantas vezes encostou em parede (e onde, se lembrar); se travou em algum lugar. Registre com `python t.py nota <rótulo>-<canto> "..."`. Em FALHA, regra 7.
5. Para cada corrida, leia as métricas que o `corrida` imprime e diga em uma frase quais K apareceram. Se a corrida falhar, leia o log e diga a causa provável em linguagem simples (hardware, preparo, firmware), mas **não proponha correção hoje**: anote para 23/11.
6. **Duas corridas seguidas sem reiniciar**, trocando duas paredes do layout entre elas (diga quais): a linha `nav: mapa` do fim da segunda tem de mostrar só o que ela viu (prova de mapa zerado). Rótulo `OF-sequencia`.

## Etapa 6 (opcional, só se sobrar tempo depois da Etapa 5): experimentos

Na nossa pista montada (Etapa 4) ou num layout oficial que já tenha linha de base, **uma novidade por vez**, com o meu `ok` para o `calib`, 2 corridas cada, com rótulo próprio, e de volta ao padrão no fim de cada uma:

| Rótulo | Ligar | Voltar |
|:--|:--|:--|
| `EXP-parada65-...` | `python t.py calib "parada_frente=65"` | `python t.py calib "parada_frente=35"` |
| `EXP-autofreio-...` | `python t.py calib "autoajuste_freio=1"` | `python t.py calib "autoajuste_freio=0"` |
| `EXP-centralizar-...` | `python t.py calib "centralizar=1"` | `python t.py calib "centralizar=0"` |
| `EXP-rumo1-...` | `python t.py calib "ganho_rumo=1.0"` | `python t.py calib "ganho_rumo=0"` (na hora, se o robô entortar mais) |

Use `python t.py corrida` (ou o D1/D2 na nossa pista). Confira com `python t.py calib-ver` que tudo voltou ao padrão antes de qualquer outra corrida.

## Etapa 7: fechamento (o que vai alimentar as correções depois de 23/11)

1. Acrescente ao fim do `teste-v3/resultados/RESULTADOS.md`:
   - As medidas do labirinto oficial (Etapa 2) e as diferenças para 180/12/168 mm.
   - A tabela do B3 nas paredes oficiais contra a de 16/11, e a inércia das curvas no piso oficial contra 16/11. A escala do giroscópio medida (se houver).
   - **Comparação nossa pista × módulos oficiais**: para cada teste da Etapa 4, 16/11 e hoje lado a lado (passou/falhou, `frontal na parada`, ajustes, `final`, lateral pós-curva, encostou).
   - **Tabela das corridas** a partir de `resultados/corridas.csv`: rótulo, resultado, tempo, s por passo, curvas, ajustes, mínimos laterais, `reta_giro_max`, rumo perdido, travadas.
   - **Para cada comportamento K1 a K8**: quantas vezes apareceu hoje, em quais logs (arquivo e teste), e se ficou melhor, igual ou pior que em 16/11.
   - Comportamentos NOVOS que não estão na lista K, com os logs.
   - Uma lista curta "para depois de 23/11": cada problema observado, a evidência (log e linha) e qual valor do `calib` ou parte do código parece envolvida, **sem propor a correção ainda**.
2. Confira que `teste-v3/resultados/` tem: `RESULTADOS.md`, `corridas.csv`, `log_robo.txt`, `ponte.out`, `telemetria.jsonl`, `comandos.txt`, os `.log` de cada teste e corrida, `build.log`, `flash.log`, `boot.log`, `versao-firmware.txt`. Peça as fotos e os vídeos e diga onde colocá-los (`teste-v3/resultados/fotos-18-11/`). Compacte tudo em `teste-v3/resultados-2026-11-18.zip` e me diga o caminho.
3. `python t.py calib-ver`: confirme que o robô terminou com os valores padrão (ou me diga quais ficaram diferentes).
4. Encerre a ponte.

Comece pela Etapa 0 e me diga, em poucas linhas, o que encontrou e o que precisa que eu confirme antes da Etapa 1.
