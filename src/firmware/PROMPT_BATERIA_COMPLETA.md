Você vai conduzir comigo a BATERIA COMPLETA de verificação do robô micromouse, depois das correções e das 6 melhorias feitas no firmware (commits de 19/11, branch `feat/controle-motores-tensao`). O objetivo é **provar, com medidas, que nada está incorreto**: cada teste termina em PASSOU, CONFERIR ou FALHOU, com número e critério. Você faz TUDO no computador: confere o código, compila, grava, liga a ponte Bluetooth, manda os comandos, lê os logs, julga e registra. Eu só mexo no robô e nas peças do labirinto com as mãos. Fale comigo em português, em linguagem simples.

**Eu não conheço o robô nem o projeto, e nem tudo nele fui eu que construí** (parte da montagem, da fiação e da eletrônica é de outras pessoas da equipe). Por isso você é o meu guia: diz o que fazer, em que ordem e por quê, e me ensina a reconhecer cada peça. **"Não sei" é uma resposta válida minha**: quando eu disser isso, não registre um palpite; me ensine a descobrir (onde olhar, o que medir, o que testar) e só então siga. Cada instrução física tem de ser explícita, numerada, uma ação por item, dizendo o que pegar, onde pôr, para que lado virar e o que eu devo ver quando der certo. Nunca escreva "posicione o robô" sem dizer a célula e para onde a frente aponta. Nunca me peça para ler log, rodar comando ou decidir se passou: isso é com você. Nunca imprima log inteiro na conversa: use `tail`, `grep` e resumos.

## O que mudou no firmware (leia isto primeiro)

**Não existe `MUDANCAS.md`.** Nunca foi criado. A fonte do que mudou é: `git log --oneline` da branch `feat/controle-motores-tensao` (commits `683e2c6` a `8282d64`, de 19/11), `src/firmware/LOGS_E_MEDIDAS.md` (seção 6 e seção 7, "Novidades de 19/11") e `src/firmware/MEDICOES.md`. **Você cria o `MUDANCAS.md` em `src/firmware/robot-tests/resultados/`** no começo da bateria, com a lista abaixo, e passa a usá-lo para anotar qualquer mudança futura (regra 6).

**Atenção: o firmware da placa NÃO foi compilado para o ESP32 desde as mudanças de 19/11.** Os 317 testes de host passam, mas `main.cpp` e os adapters (`Drv8833MotionAdapter`, `Vl53l1xSensorAdapter`) só compilam com o ESP-IDF. **A primeira compilação (P3) pode falhar**: se falhar, é um achado; mostre o erro, proponha a correção (arquivo, linha) e espere a minha aprovação (regra 6).

| # | O que foi feito | Chave `calib` e padrão | Como provar |
|:--|:--|:--|:--|
| P1 | ToF abaixo do alcance mínimo vira `TooClose` ("perto"): o log mostra `perto` e o mm sai 0. **Frontal: ≤ 40 mm. Laterais: só a leitura 0** (no centro da célula os laterais leem 24 a 34 mm e valem). O arco recua só `alvo − 40 mm` (≈ 65 mm) e mede de novo; a reta também para com o frontal "muito perto" | (sem chave) | E1, E1b |
| P2 | O arco planeja com a bitola efetiva **74,2 mm** (antes 88): o caminho passa de raio ~80,7 para ~90 mm. O limite de rumo numa reta caiu de 30° para **10°**: o motivo vira `rumo perdido: desviou N graus na reta (parede?)` | (constantes) | C, E2 |
| P3 | Desfazer do arco com conferência de progresso (3° em 0,4 s): sem progresso para em ~0,7 s e a corrida vai a Erro com `curva travada e o desfazer nao voltou: sem progresso (preso, segurado ou rodas patinando), robo torto em N graus` | (constantes) | C8 |
| P4 | **A duplicação de comandos NÃO era do firmware**: os 15 `andar` do B1 já estavam em `comandos.txt` (escritos pelo `t.py`). Não existe ID/sequência de comando no firmware | - | E7 (verificar o runner e a trava) |
| P6 | Só verificação: o religamento do ToF pelo XSHUT **só acontece com o robô PARADO** (entre passos ou `tofrec`); em movimento o sensor em falha fica mudo 500 ms. O Erro diz `falha de sensor por 3 passos: ... ToF em falha: direito` | - | E8 |
| M1 | Curva fechada com UMA roda (a de dentro parada) | `modo_curva` 0 = arco (padrão), 1 = uma roda; `freio_uma_roda` 3,2° (proposta) | E3 |
| M2 | Flood Fill conferido: 7 testes de propriedade contra um BFS independente, sem contra-exemplo | - | P1, P2, D, F |
| M3 | **Velocidade de corrida −25% (vem ligada, sem `calib`)**: reta 150 mm/s e 450 mm/s²; arco e uma roda 67,5 °/s e 337,5 °/s²; pivô 225 °/s. Freios acompanham: `freio_arco` 3,2°, `freio_pivo` 10,1° (**propostas, nunca medidas**). **Limite de tempo de 10 min FIXO** (`kRaceTimeLimitS = 600`, não tem chave `calib`): passado o limite, a corrida para em Erro com `tempo limite de 10 min esgotado: N passos, M celulas` | `freio_arco`, `freio_pivo`, `autoajuste_freio` | E4 |
| M4 | Pose lateral por célula: estima o deslocamento do eixo descontando o rumo (os ToF laterais ficam 59,15 mm à frente do eixo), desliga com rumo > 5° (proposta), nunca usa leitura inválida nem 0 mm. Linha de log `reta: pose lateral: eixo X mm para a direita do centro, rumo Y graus, correcao Z mm` | `centralizar` **0 = desligado (padrão)**, 1 = liga | E2 |
| M5 | Modelo do corpo: largura da frente 101, com rodas 108, ToF lateral ao centro 50,5, ToF lateral à frente do eixo 59,15, `cabo_frente_mm` 0 (não existe cabo à frente). **Frente em padrão de CAMPO: eixo→chassi 87, eixo→ToF 85** (o ToF era 87). `preset_cad=1` usa o CAD (107,25 / 107,75). O boot **avisa sempre** `calib: AVISO: a frente em uso ... difere do CAD` até alguém decidir: isso NÃO é falha | `eixo_ate_frente`, `eixo_ate_tof_frente`, `largura_frente`, `largura_com_rodas`, `tof_lado_ao_centro`, `tof_lado_a_frente_do_eixo`, `cabo_frente_mm`, `preset_cad` | M |
| M6 | Labirinto em pé: **o DIP NÃO escolhe o 4x8/4x12** (a combinação das vias 1 e 2 fechadas continua PROIBIDA, #393). Pelo comando BLE `labirinto 4x8` (ou `4x12`, `8x4`, `12x4`, `4x4`, `dip`) ou pelo **toque longo no botão**. O painel recebe o em pé como o deitado (4x8 → "8x4") com o mapa GIRADO 90°; o protocolo não mudou | comando `labirinto`; toque longo | F, bloco O |
| Botão | **Toque curto larga ao SOLTAR** (antes, ao apertar). **Toque longo (~1 s, proposta)** alterna a orientação sem largar (3 bips = em pé, 1 bip longo = deitado; o 4x4 vira "4x4 girado", só para testar o relato girado com o único labirinto físico) | - | bloco O |

**Chave da memória (NVS):** a calibração passou a `calib2` (a struct ganhou campos). **Na primeira vez depois de gravar, o robô volta aos padrões**: reaplique qualquer `calib` que tinha. A linha de base é com os padrões.

**Hardware mudou:** o botão START foi movido do GPIO 4 para o **GPIO 13** depois de uma ressolda (commit `7b1291a`). Confirme que o botão funciona (bloco O) e trate qualquer problema de botão como hardware.

**Critérios antigos que NÃO valem (não use como aprovação):** o critério de partida de roda do **H6** e o de pivô do **B4d/B4e** (o pivô só é usado no fallback sem espaço para recuar, como na largada de A1; o B4 é informativo). A pasta `resultados/16-11/anterior/`, `auditoria/` e `esp32/sdkconfig.old` também não valem.

## Leia antes de qualquer coisa

Leia inteiros, nesta ordem, e não suponha o que não estiver neles (pergunte):

1. `git log --oneline -20` e `src/firmware/LOGS_E_MEDIDAS.md` (seções 1, 2, 5, 6 e 7). Da seção 7 você tira o que mudou. Crie o `MUDANCAS.md` (acima).
2. A linha de base (o que o robô fazia antes): `RESULTADOS.md` de 16/11. **Ele NÃO está no repositório.** Procure primeiro em `/mnt/c/Users/samue/Downloads/markdown/resultados/resultados/16-11/` (tem `RESULTADOS.md`, `log_robo.txt`, `comandos.txt`, `ponte.out`, `telemetria.jsonl`). Se não achar, procure e me diga onde está ou peça o caminho.
3. `src/firmware/robot-tests/t.py` e o pacote `src/firmware/robot-tests/suite/` (`cli.py` com os comandos, `catalog/*.py` com os testes, `checks/*.py` com os critérios). Comandos do `t.py`: `preparo`, `portao`, `responder`, `nota`, `reiniciar`, `parar`, `cmd`, `calib-ver`, `calib`, `medidas`, `calib-giro`, `corrida`, `resumo`. E `robot-tests/ponte.py`. **A pasta `teste-v3/` NÃO existe mais**: tudo que este prompt chama de `teste-v3` está em `src/firmware/robot-tests/` (resultados em `src/firmware/robot-tests/resultados/`).
4. `src/firmware/MEDICOES.md` (tabela CAD × firmware × chaves do `calib`; o conflito da frente).
5. `src/firmware/include/domain/Calibration.hpp`, `include/domain/DipDecoder.hpp`, `src/domain/DipDecoder.cpp`, `include/domain/RobotParameters.hpp` e `include/controller/RobotMotion.hpp` (constantes de movimento).

## Fatos do projeto (valem para qualquer decisão)

1. O robô é SÓ de exploração: começa sabendo só as bordas, descobre as paredes pelos ToF (esquerdo, frontal, direito) e resolve pela inundação. Não existe corrida rápida.
2. Labirintos: 4x4, 8x4 e 12x4 (4 linhas), escolhidos pelo DIP; e o **4x8 e o 4x12 (em pé)**, que o DIP NÃO escolhe: vêm do comando `labirinto` ou do toque longo (veja a tabela acima). **A largada é sempre num canto da linha de baixo, com a frente virada para cima (norte). O objetivo é sempre o canto oposto.** Nomes em COLUNAS x LINHAS: 8x4 = 4 linhas e 8 colunas (deitado); 4x8 = 8 linhas e 4 colunas (em pé). O DIP é lido só no boot: vias 1 e 2 (0 0 = 4x4; via 1 fechada = 8x4; via 2 fechada = 12x4; as duas fechadas é PROIBIDO); via 3 ABERTA = borda à ESQUERDA do robô na largada, FECHADA = borda à DIREITA. O canto de um `labirinto ...` BLE ou do toque longo é sempre o da via 3.
3. O mapa é zerado a cada largada. Nada pode depender da pista 4x4 da equipe.
4. Cada corrida tem **10 minutos no máximo** (e agora o firmware PARA sozinho aos 10 min). Registre o tempo de todas.
5. Medidas da pista: célula 180 mm, parede 12 mm, corredor livre 168 mm. O robô cabe em 165 x 165 mm; com as rodas tem 108 mm de largura, folga de 30 mm por lado.
6. **Hoje nada de código é alterado por conta própria.** Falhou? Registre, analise e proponha a mudança (arquivo, linha, valor antigo e novo, ou o `calib` com valor antigo e novo); espere a minha aprovação. Os únicos `calib` livres são os de VOLTAR ao padrão (`python t.py calib "padrao"`).
7. Cada novidade ligada por `calib` é testada **uma por vez**, comparada com a linha de base (desligada) e desligada se piorar.

## Regras de segurança (valem sempre)

1. **Bateria e USB nunca ligados ao mesmo tempo.** O USB serve só para gravar, com a bateria desligada. Antes de gravar, leia o boot pela serial: a linha `INA219 PAROU de ler (ou a bateria esta abaixo de 1 V)` confirma que a bateria está fora. Se o INA219 estiver lendo, NÃO grave: peça para eu desligar a bateria.
2. **Nenhum comando que mexe os motores sem o meu `ok`.** Para cada teste: mostre o preparo, espere o `ok`, só então rode. `pular`: registre como pulado. `repetir`: refaça. `parar`: rode `python t.py parar` NA HORA, antes de qualquer outra coisa.
3. **Fique sempre em condição de frear.** Rode os testes que mexem os motores em segundo plano e acompanhe a saída. Plano B, que você me diz antes do primeiro teste de motor: levantar o robô pelo chassi e desligar a bateria.
4. **Execução duplicada (K8).** Todo comando que mexe os motores roda por uma trava de execução única com um nome FIXO por `ok` meu (por exemplo `D1_ok_3`), nunca calculado a partir do número da tentativa. Crie a trava no início (um script que faz `mkdir` de uma pasta com o nome e recusa se ela já existir). Depois de cada teste, confira em `resultados/feitos.json` que ele rodou uma vez só. Se rodou duas, me avise na hora e verifique onde o robô está.
5. **Nunca rode `git commit`, `git add`, `git stash`, `git reset`, `git checkout` de arquivo, `git am` nem `git push`.** O git é só para ler.
6. **A chave DIP só é lida quando o robô liga.** Depois de eu mexer nela: `python t.py reiniciar` e confira a linha `entradas:` do `python t.py cmd "diag" 12`. O mesmo vale para `labirinto ...` e toque longo: **só valem até reiniciar**; reinicie antes de qualquer teste que dependa do DIP.
7. **Corrida em FALHA:** o robô fica em Erro e recusa comandos de motor. Antes de me mandar tirar o robô do lugar: `python t.py cmd "tof"`, me pergunte a célula e para onde a frente aponta, anote com `nota`, e só então `python t.py reiniciar`. **Leia o motivo da falha**: agora há motivos novos (`rumo perdido: desviou N graus`, `curva travada e o desfazer nao voltou`, `tempo limite de 10 min esgotado`, `curva com uma roda nao cabe com as medidas do corpo`).
8. **Respostas ambíguas:** se eu responder só "ok" a uma pergunta de sim/não ou de célula, pergunte de novo, explicitamente.
9. **Dois reinícios sozinhos do robô: pare tudo.** Um reinício: `python t.py cmd "diag" 12` e registre o `reset=` (`LIGOU (poweron)` = energia cortada: chave ou conector da bateria).
10. **Hardware nunca se contorna por software.** Sensor que cai, roda que prende, encoder ou bateria: classifique como hardware, diga o que olhar no robô e pare o bloco.
11. **Antes de qualquer ação física nova, diga o que ela faz e o que pode dar errado, em uma frase.** Se eu hesitar, ofereça uma foto minha para você conferir (você pode ler imagens: peça o caminho do arquivo).
12. **O botão agora larga ao SOLTAR.** Nunca me diga "aperte o botão" sem dizer se é toque curto (largar) ou longo (alternar a orientação). Um toque longo por engano troca o tipo de labirinto da corrida: confira sempre o log `labirinto diferente do DIP` / `relato ao painel` antes de uma corrida.

## Formato das instruções físicas

Uma mensagem por teste, sem log junto:

```
TESTE <ID> — <título>   (tentativa N)
O que este teste confere: <uma frase simples>
Faça agora:
1. ...
O que vai acontecer: <o robô anda X, gira Y, por Z segundos / nada se mexe>
Cuidado: <...>
Responda "ok" quando estiver pronto (ou "pular").
```

Rode SEMPRE os testes e as corridas do `t.py` com `--auto` (sem ele o `t.py` espera um "ok" digitado e trava), pela trava da regra 4 e em segundo plano quando mexem os motores, com limite de **6 minutos** (corrida de 12x4: **limite de 11 minutos**). **Com a velocidade 25% menor tudo demora ~25% mais** (uma reta de uma célula ~1,8 s; uma curva com recuo e ajuste ~4,8 s): avise-me das durações e confira se os tempos-limite (`timeout`) dos passos do `t.py` ainda bastam; se algum estourar, é critério antigo (ver abaixo), não falha do robô. Os itens de "Faça agora" são TODOS os do PREPARO (`python t.py preparo <ID>`), completados para um leigo. Nas corridas livres, o preparo é: chave DIP, robô na célula de largada, no meio, alinhado, frente para a célula vizinha da linha de baixo (diga qual e a direção no desenho), mãos fora do labirinto. Depois do teste, resultado em uma ou duas frases; números só se eu pedir.

**Glossário:** frente do robô = a ponta mais longe das rodas, onde fica o sensor do meio. Esquerda e direita = as de quem olha o robô por trás. APOIADO = sobre um suporte firme, rodas no ar, nunca na mão. Seguro firme = apoiado e com o chassi preso contra o suporte pelas duas mãos. Chave DIP: ABERTA = OFF, FECHADA = ON. Centrado na célula = no meio, alinhado com o corredor, mãos fora. **Toque curto** = apertar e soltar o botão de largada em menos de 1 s. **Toque longo** = segurar ~1 s.

**As nossas pistas 4x4** (letras = colunas da esquerda para a direita; números = linhas de cima para baixo). Só há paredes horizontais internas, além da borda externa. É a pista de MDF que a equipe construiu (foto do labirinto):

```
PISTA A (labirinto 1)                  PISTA B (labirinto 2) = pista A + uma parede entre B4 e C4

        A     B     C     D                    A     B     C     D
     +-----+-----+-----+-----+              +-----+-----+-----+-----+
  1  | A1    B1    C1    D1  |           1  | A1    B1    C1    D1  |
     +-----+-----+     +-----+              +-----+-----+     +-----+
  2  | A2    B2    C2    D2  |           2  | A2    B2    C2    D2  |
     +     +-----+-----+-----+              +     +-----+-----+-----+
  3  | A3    B3    C3    D3  |           3  | A3    B3    C3    D3  |
     +-----+-----+     +-----+              +-----+-----+     +-----+
  4  | A4    B4    C4    D4  |           4  | A4    B4  | C4    D4  |
     +-----+-----+-----+-----+              +-----+-----+-----+-----+
```

Paredes internas da pista A: entre as linhas 1 e 2, sob A1, B1 e D1 (aberto em C); entre as linhas 2 e 3, sob B2, C2 e D2 (aberto em A); entre as linhas 3 e 4, sob A3, B3 e D3 (aberto em C). **Antes do bloco C, peça-me para conferir parede por parede que a pista montada está igual a este desenho, e me mostre o desenho.** Se não estiver, pare e me diga a diferença.

**Como o robô larga.** Nas pistas 4x4 a largada é num canto da coluna D, com a frente virada para a coluna C (para a esquerda no desenho), e o objetivo é o canto oposto, na coluna A. No log, largando de D4 ou D1 virado para a coluna C: letra = A + linha do log, número = 4 − coluna do log. Comigo, use sempre o nome da pista. Ao dizer para onde a frente aponta, diga a célula vizinha E a direção no desenho.

**Percursos (calculados por busca em largura sobre estes desenhos; a pista é uma serpentina sem laços, então só existe um caminho):**

| Pista | Largada → objetivo | Caminho (10 movimentos) | Nota |
|:--|:--|:--|:--|
| A | D4 → A1 | D4, C4, C3, B3, A3, A2, B2, C2, C1, B1, A1 | Becos: D1, D2, D3 e o ramo A4-B4 (2 células) |
| A | D1 → A4 | D1, C1, C2, B2, A2, A3, B3, C3, C4, B4, A4 | Becos: D2, D3, D4 e o ramo A1-B1 (2 células) |
| B | D4 → A1 | igual ao da pista A | **A4 e B4 são um bolsão fechado**: o robô nunca precisa entrar |
| B | D1 → A4 | **não existe**: A4 está no bolsão | Teste negativo (D9) |

A via 3 da DIP define o canto: **borda à direita do robô** (largada em D4, com a frente para C4) ou **borda à esquerda** (largada em D1). Confira em `DipDecoder.cpp` qual combinação de via 3 corresponde a cada largada e confirme com `python t.py cmd "diag" 12` (linha `entradas:`). Um passo fora do caminho esperado: mostre o mm de cada sensor e o `mapa NLSO` daquele passo e diga qual parede foi lida diferente da pista. Becos: a pegada do robô não cabe para girar 180° numa célula de 168 mm; o Navigator sai do beco **de ré** (`reverseCell`); confirme nos logs.

**Atenção ao `t.py`:** os passos esperados dos testes D1, D2 e dos C4 a C8 podem estar escritos para uma pista ANTIGA (outras paredes). **Os critérios de tempo e de ângulo dos testes de curva também foram escritos para a velocidade antiga** (por exemplo, `tempo da curva: meta menos de 1500 ms` em `checks/motion.py`; o arco a 67,5 °/s leva ~1,4 s pelo modelo, no limite). Antes de rodar, compare o `preparo` e o critério de cada um com os desenhos acima e com a velocidade nova. Se divergirem, **proponha a correção do `t.py` e espere a minha aprovação**, ou use o comando `corrida` (sem sequência fixa) e compare o caminho do log com a tabela. Um critério obsoleto não é falha do robô: marque CONFERIR e explique.

## Etapa 0: reconhecer a máquina (sem o robô)

1. `git status --short` e `git log --oneline -20`. Confirme que existem os commits `683e2c6` a `8282d64`, `Calibration.hpp` (com `modo_curva`, `preset_cad`, `cabo_frente_mm`), `ArcUndo.cpp`, `SweptFootprint.cpp`, `RaceTimeModel.cpp`, `ReportFrame.cpp`, o comando `calib` e o `labirinto` em `src/firmware/src/main.cpp`, a classe `FreeRace` (comando `corrida`) em `robot-tests/suite/free_race.py` e o bloco O em `robot-tests/suite/catalog/orientation.py`. Liste o que mudou desde a bateria anterior. Se faltar algo, pare.
2. ESP-IDF 5.3 em `~/esp/esp-idf` (`. ~/esp/esp-idf/export.sh`). Ponte pelo Python do Windows `C:\Users\samue\AppData\Local\Programs\Python\Python312\python.exe`, com o caminho de `wslpath -w src/firmware/robot-tests/ponte.py` (o Bluetooth não funciona pelo WSL). Placa pelo `usbipd` (confira com `cmd.exe /c "usbipd list"` e `cmd.exe /c "usbipd attach --wsl --busid <id>"`). Boot pela serial: `pyserial` do ambiente do ESP-IDF, 115200, reiniciando pelo RTS.
3. Pergunte antes e mova o conteúdo atual de `src/firmware/robot-tests/resultados/` (menos o `MUDANCAS.md` que você vai criar) para uma subpasta com a data. O `RESULTADOS.md` novo começa com o cabeçalho "Bateria completa — <data> (calib padrão = linha de base)".

## Etapa 0b: conhecer o robô (faça ANTES de qualquer teste com ele)

Como nem tudo fui eu que construí, esta etapa existe para eu não errar o que é frente, esquerda, onde ligar e desligar, e o que não pode ser tocado. Faça assim:

1. Peça-me **4 fotos nítidas**, salvas em `src/firmware/robot-tests/fotos/` (diga como salvar e como me chamar o arquivo): de cima, de frente, de lado (esquerda) e de baixo (com o robô inclinado sobre uma caixa, sem mexer nas rodas). Leia as fotos e marque, **por escrito e com a posição na foto**, cada peça abaixo. Mostre-me a lista e peça que eu confirme item a item (`sim`, `não` ou `não sei`).
2. Uso do CAD como dica do que procurar (o robô real pode ser diferente; **confirme na foto, não suponha**):

| O que achar | Onde deve estar (CAD) | Por que importa |
|:--|:--|:--|
| Chassi de plástico (PETG) | ~124 mm de comprimento x 100 mm de largura | Base de todas as medidas |
| Duas rodas amarelas de borracha (32 mm) | Na parte de TRÁS do chassi, uma de cada lado | O robô gira em volta delas; o meio entre elas é o "meio do eixo" |
| Roda boba ou apoio na frente | Embaixo, perto da ponta da frente (~95 mm à frente do eixo) | Toca o chão; arrasta nas curvas, principalmente na curva com uma roda |
| 3 sensores de distância (ToF), placas pequenas | 1 na ponta da FRENTE e 1 em cada LADO, a ~59 mm à frente do eixo | Eles dizem onde estão as paredes. A janela é o quadradinho preto |
| Bateria (2 células, LiPo) | Dentro do chassi, tampa por baixo | Tem chave ou conector; é o jeito de desligar tudo |
| Placa do ESP32 e a porta USB marcada UART | Em cima (na foto, com protoboard) | O USB só serve para gravar, com a bateria DESLIGADA |
| **Botão de largada** | Na placa (o pino mudou para o GPIO 13 depois de uma ressolda) | Toque curto larga; toque longo alterna a orientação |
| **Buzzer** | Na placa | Dá os bips de confirmação (3 bips curtos = em pé; 1 bip longo = deitado) |
| Chave DIP de 3 vias | Na placa | Define tamanho do labirinto e canto da largada (só lida quando o robô liga) |
| Fios soltos (jumpers) | Em cima, principalmente perto dos sensores | Podem enroscar nas paredes e soltar durante a corrida |

3. Pergunte-me, **uma pergunta por vez**, o que você não conseguir ver nas fotos:
   - Onde está a chave ou o conector que desliga a bateria, e como se liga (mostre numa foto).
   - Se o conjunto é protoboard ou uma placa soldada (PCB) e se alguém mexeu na fiação ou em solda recentemente (o botão START foi ressoldado).
   - Qual é a roda ESQUERDA e qual é a DIREITA vistas por trás, e qual ponta é a FRENTE (a ponta mais longe das rodas, onde fica o sensor do meio).
   - Se algum fio está solto, descascado ou apoiado no pneu. **Quantos milímetros de conector/cabo saem à frente do ToF frontal.**
4. **Treino de 2 minutos, sem motor:** peça-me para (a) pôr o dedo na frente de cada sensor, um por vez, e você mostra no `python t.py cmd "tof"` qual sensor reagiu (confirma esquerdo, frontal e direito); (b) girar uma roda à mão, para você ver pelo encoder qual roda é qual (`python t.py cmd "diag" 12`); (c) **dar um toque longo no botão e ouvir os bips** (você confere o log `toque longo`). Se o sensor que reagiu não for o esperado, ou o botão não responder, **pare**: classifique como hardware (regra 10).
5. Termine com um **resumo de 8 linhas** do que eu sei sobre o meu robô (peças, frente, lados, como desligar) e guarde em `resultados/RESULTADOS.md`. A partir daqui você só pode usar os nomes que eu confirmei.

## Bloco P: provas no computador (sem o robô)

1. **P1: testes de host** (CMake + GoogleTest, `-DFIRMWARE_WARNINGS_AS_ERRORS=ON`, build fora do repositório, por exemplo `cmake -S src/firmware -B /tmp/build-host -DFIRMWARE_WARNINGS_AS_ERRORS=ON` e depois `ctest`). Esperado: **317 testes passando** (eram 252), sem avisos. Diga o total e se mudou. Se falhar, pare. Os grupos novos são `LateralPose*`, `SweptFootprint*`, `ArcUndo*`, `RaceTimeModel*`, `RaceDeadline*`, `FloodFillProperty*`, `Orientation*`, `ReportFrame*`, `ButtonGesture*`, `RobotModel*` e `SensorRecovery*`.
2. **P2: Flood Fill e os labirintos em simulação.** Os testes de propriedade do Flood Fill contra o BFS independente existem (`FloodFillPropertyTest`: 4x4, 4x8, 8x4, 4x12, 12x4) e a matriz `Orientation.TheRobotSolvesEveryShape...` resolve as 6 formas dos dois cantos. Rode também a pista A (D4→A1 e D1→A4) e a pista B (D4→A1; e D1→A4, inalcançável: confirme o que o firmware faz) com os testes de exploração e `TrackMaze*`. Relate: chegou, passos, células visitadas. Se faltar teste, **proponha** um (sem criar) e siga.
3. **P3: compilar** `src/firmware/esp32` com exatamente `CONFIG_RATO_LOG_RETA=y` e `CONFIG_RATO_FIOS_MOTORES_TROCADOS=y`; `RATO_BANCADA`, `RATO_CENTRALIZAR_PAREDES` e `RATO_SLOW_DECAY` desligados. Build e `sdkconfig` próprios; confira as linhas `RATO` antes de compilar; apague o `esp_app_desc.c.obj` do build antes, para o carimbo sair novo. Log em `resultados/build.log`; anote a hora. **Lembrete: esta é a primeira compilação para a placa depois das mudanças de 19/11; erros de compilação são esperados como risco (veja acima).** As fontes novas já estão no `esp32/main/CMakeLists.txt` (`ArcUndo`, `RaceTimeModel`, `SweptFootprint`, `ReportFrame`).

## Etapa 1: gravar

Um passo por mensagem, esperando o meu `ok`: desligar a bateria → USB na porta UART → você confere a bateria fora pelo boot, grava e lê o boot por 10 s → tirar o USB → ligar a bateria. No boot confira: `Compile time` da sua compilação; `tof: esquerdo/frontal/direito pronto em 0x30/0x31/0x32`; IMU e INA219 sem erro; DIP lida; as linhas `calib:` (**com `nada gravado: valores padrao`, porque a chave da memória mudou para `calib2`**); e o **aviso esperado** `calib: AVISO: a frente em uso (chassi 87.0, ToF 85.0 mm do eixo) difere do CAD...` (não é falha). Guarde `boot.log`, `flash.log` e `versao-firmware.txt` (branch, `git log -20`, `git status`, hora da compilação, opções `RATO_*`, saída do `calib-ver`).

## Etapa 2: ponte e primeiro contato

1. Ponte em segundo plano até o fim; espere `estado.txt` com `"conectado": true` (até 40 s). Se não conectar, me peça: bateria ligada, Bluetooth do computador ligado, robô a menos de 3 m.
2. `python t.py cmd "saude"` e `python t.py calib-ver`. Se algum valor vier `ALTERADO`, me mostre e pergunte se volto ao padrão: a linha de base é com o padrão.

## Bloco M: medidas do corpo (confere o item M5)

O CAD (`assembly.step`) e o robô real divergem na frente. Em milímetros:

| Cota | CAD | Padrão do firmware (hoje) | Campo (16/11) |
|:--|--:|--:|:--|
| eixo até a frente do chassi | 107,25 | **87** (campo) | ~85 a 91 (A2: parede-eixo 127 menos F=42) |
| eixo até a face do ToF frontal | 107,75 | **85** (campo; era 87) | idem |
| largura da frente | 101,0 | **101** (era 100) | - |
| largura com rodas | 108,0 | **108** | - |
| ToF lateral ao centro | 50,5 | **50,5** | confere (84 − 50,5 = 33,5; medido 33,6) |
| ToF lateral à frente do eixo | 59,15 | **59,15** | - |
| cabo à frente do ToF | não existe | **0** | - |
| eixo até a traseira | 17,25 | - | - |
| diâmetro da roda / bitola | 32,0 / 87,8 | 32 / 88 (o arco usa 74,2, medida em 45 arcos) | 32 (medido 11/11) |

O arquivo impresso (`.3mf`) tem o chassi 5 mm mais curto na frente que o CAD (102,25).
1. Faça-me as medidas de paquímetro **uma por vez**, seguindo o `MEDICOES.md` (eixo até a frente, largura da frente, eixo até o ToF frontal, largura com as rodas, ToF lateral ao centro, ToF lateral à frente do eixo, e o comprimento do cabo que sobra à frente do ToF). Grave com `python t.py medidas` ou `python t.py calib "..."` (atalho: `calib preset_cad=1` usa a frente do CAD).
2. Faça a conferência com o próprio robô (`MEDICOES.md`): `eixo_ate_tof_frente` ≈ parede-eixo − F do `tof`; `tof_lado_ao_centro` ≈ (168 − E − D) ÷ 2.
3. Compare com o CAD. **Diferença de mais de 10 mm na frente: não troque o valor sozinho**; me mostre as três fontes (CAD, paquímetro, campo) e espere a minha decisão. Registre tudo no `RESULTADOS.md`. Pegada (comprimento total = 17,25 + frente + cabo, e largura com rodas) tem de ficar ≤ 165 mm; folga lateral por lado = (168 − 108) ÷ 2 = 30 mm.

## Etapa 3: como rodar cada teste

1. `python t.py preparo <ID>`; mensagem no formato acima; espere o `ok`.
2. `python t.py <ID> --auto` pela trava da regra 4. O log fica em `resultados/<ID>_t<N>.log`. Os testes do bloco O têm passos que só esperam o log (`(nada: aguardando você)`): é eu apertando o botão.
3. Linhas `PERGUNTAR:`: uma pergunta por vez, em linguagem simples, dizendo como medir; registre com `python t.py responder <ID> chave=valor ...`.
4. Resultado em uma ou duas frases; análise com `python t.py nota <ID> "..."` quando houver algo a dizer.
5. `PASSOU`: siga. `CONFERIR`: anote e siga. `FALHOU`: leia o `.log` e o `log_robo.txt`, diga a causa provável, repita UMA vez conferindo o preparo comigo; falhou de novo: regra de parada do bloco.
6. Erro de preparo meu (robô torto, mão na frente do sensor, robô girou na mão): não é falha do robô. Explique, corrija a instrução e repita.

## Etapa 4: a bateria

Antes de cada bloco: `python t.py portao`. Se o portão der `FALHOU`: `python t.py reiniciar` e portão de novo; se falhar de novo, rode o H1, me explique a linha `diag: fim:` e pare.

| Bloco | Testes, na ordem | Onde | Regra de parada |
|:--|:--|:--|:--|
| H: hardware | H1, H2, H4, H5, H6, H7, H8 | robô APOIADO | Um teste falhou duas vezes: pare tudo (defeito de montagem) |
| O: orientação (novo) | O1, O2, O3, O4 | robô APOIADO, sem paredes, **sem mover** | Botão sem resposta ou bips ausentes: hardware (botão ressoldado) |
| R: regressão | tabela abaixo | robô apoiado e chão | Qualquer item regrediu: não siga para o bloco A |
| A: no ar | A1 a A5 | APOIADO e seguro firme | Falhou duas vezes sem ser erro de preparo: o robô não vai para o chão |
| B: chão livre | B1, B2, os 12 `B3-*`, B4d, B4e (informativos), B5d x3, B5e x3 | chão liso, fora do labirinto | B1 ou B2 fora da faixa: pare antes do C |
| C: labirinto, manobra a manobra | C1 a C3, C4 a C7 x3, C8 (e C9 se existir) | pista | Uma curva encostou ou falhou nas 3 vezes: não faça D, E3 nem F |
| E: novidades | E1 a E8 | apoiado e pista | Uma novidade piorou a linha de base: desligue-a e anote |
| D: corridas na pista da equipe | D1 x3 (pista A, D4→A1), D2 x3 (pista A, D1→A4), D3 a D7, D8 x2 (pista B, D4→A1, bolsão), D9 (pista B, D1→A4, inalcançável) | pista, corrida completa | Bateu forte ou prendeu em 2 corridas seguidas: pare |
| F: layouts oficiais | F1 a F5 | labirinto modular oficial | Veja o bloco F |
| G: resistência | G1, G2 | pista | Veja o bloco G |

### Pontos de atenção por bloco

- **H1:** a linha `firmware gravado` tem de trazer a data e a hora da compilação. Traduza cada item de `diag: fim:` para mim. **H6 (partida de roda) é informativo**: o critério antigo está errado (já reprovou com roda boa em 16/11).
- **H4:** antes, eu desligo a bateria, espero 10 s e ligo; 3 minutos sem ninguém encostar na mesa.
- **H5:** eu giro cada roda à mão, uma volta para a frente em 25 s ("para a frente" = a parte de cima da roda vai em direção à frente do robô). Marque o pneu com caneta antes. Diga "AGORA" quando mandar o comando.
- **H6 e H7:** as rodas giram sozinhas. Avise antes.
- **Bloco O (novo, robô apoiado, sem paredes por perto, rodas NÃO giram):** O1 = dois toques longos (o 1º dá "EM PE" e 3 bips; o 2º dá "deitado" e 1 bip longo), sem largar. O2 = toque curto: larga ao SOLTAR, não conta toque longo, e a largada é recusada (sem paredes, rodas paradas). O3 = 4x4 girado pelo toque longo e `largar`: o log tem `relato ao painel: labirinto 4x4, largada x=.. y=.. rumo .. (mapa girado)` com a largada girada (à esquerda: x=3 y=3 rumo O; à direita: x=0 y=3 rumo L). O4 = `labirinto 4x8` + `largar`: o relato sai 8x4 girado (à esquerda: x=7 y=3 rumo O; à direita: x=0 y=3 rumo L). Reinicie (`python t.py reiniciar`) entre os testes e confirme o DIP antes (O2 e O3 pedem DIP 4x4; O2 pede as 3 vias abertas). Em O3, só me pergunte se o painel mostrou o mapa girado se o painel estiver aberto.
- **A4:** a manobra TEM de falhar (`curva travada` duas vezes): explique antes, para eu não me assustar. Agora o desfazer confere o giro: com o robô SEGURO FIRME o desfazer para em ~0,7 s com `sem progresso`. **A5 e D5:** a largada TEM de ser recusada; se as rodas girarem, `parar` e pare tudo.
- **B1 e B2:** fita no chão sob as duas rodas e marca no meio; depois me peça a distância da fita ao eixo das rodas e o desvio lateral, em mm. Critério de pulsos continua 506 a 511 por célula.
- **B3:** 12 medidas. A caixa fica APOIADA, paralela ao sensor, à distância medida da JANELA do sensor. Um sensor por vez, as quatro distâncias em sequência. Monte a tabela (real, lido, erro). Comparar com a linha de base (frontal +4,4 a +7,2 mm; esquerdo +2,9 a +10,5; direito −9,2 a +6,3). **A 50 mm do direito, a linha de base teve leituras 0 mm: agora elas têm de sair `perto`, e a média não pode mais ser puxada por zeros.**
- **B5d/B5e (arco no chão livre):** o arco está a 67,5 °/s com freio 3,2° (proposta, nunca medido). Meça o ângulo final de cada curva (esperado 90° ± 2°); se tender a passar ou ficar curto sempre para o mesmo lado, é caso de `freio_arco` ou `autoajuste_freio=1` (Etapa 5), não de falha.
- **C4 a C7:** eu OLHO o robô na curva e digo se encostou, qual canto e qual parede. Se puder filmar, melhor. Anote para cada curva: o desvio lateral depois da curva (`tof depois da curva`: esperado sem `E=0` nos dois lados) e o motivo de qualquer falha de reta (`rumo perdido: desviou N graus`).
- **C8:** eu seguro o robô por 1 s quando ele COMEÇA a girar e solto; você diz "agora" quando mandar. O robô tem de **desfazer o arco e voltar** (P3), e a 2ª tentativa tem de funcionar. **Se eu ainda estiver segurando durante o desfazer**, ele para com `curva travada e o desfazer nao voltou: sem progresso (...)` e vai a Erro: isso é o comportamento seguro esperado, não falha; repita soltando antes. Nunca pode ficar torto andando.
- **Bloco D:** confira comigo a via 3 antes de cada teste e `python t.py reiniciar` quando ela mudar. Numa corrida que falha: regra 7. **D8 e D9 são novos** (proponha-me o acréscimo ao `t.py` ou use `corrida`). Para montar a pista B, eu acrescento UMA parede entre B4 e C4 (você me diz como, peça por peça). **D9 é um teste negativo:** o objetivo A4 está num bolsão fechado, então o robô nunca consegue chegar. O esperado é ele explorar tudo o que alcança, não entrar em laço nem andar até estourar o tempo, e parar com erro explícito (o Navigator tem `stuck`; ele esquece o mapa uma vez antes de desistir). Se o firmware não tiver essa saída, registre como **achado** e me diga o que ele fez e em quanto tempo. **Agora há um limite de 10 min: o robô para sozinho com `tempo limite de 10 min esgotado`.** Rode no máximo 1 vez, com o `parar` pronto.

### Regressão (bloco R): nada que já estava bom pode ter piorado

Compare com a linha de base de 16/11. Um valor que ainda "passa" mas piorou além da tolerância é regressão: registre e avise na hora. **Itens que dependem da velocidade (tempo por célula, tempo da curva, tempo do laço) mudam de propósito (−25%): não são regressão; compare as retas só em pulsos e giro.**

| O que conferir | Teste | Linha de base de 16/11 | Regressão se |
|:--|:--|:--|:--|
| I²C: ToF E/F/D, IMU e INA219 respondem, nada em 0x29 | H1 | 10/10; 0x29 = 0 | qualquer um abaixo de 10, ou 0x29 acima de 0 |
| Os 3 ToF sem falha | H1, H2 | 20/20 e 327/327 | qualquer falha; direito variando mais de ±15 mm parado |
| Erros e quedas desde o boot | H8 | zero | qualquer valor diferente de zero |
| Giroscópio parado | H1, H4 | desvio −0,15 °/s; variação máx. 0,7 °/s | variação acima de 2 °/s, ou leituras perdidas |
| Chip e gravidade | H1 | `WHO_AM_I=0x72`; Z 1,02 g | outro `WHO_AM_I`, ou Z fora de 0,95 a 1,05 |
| Bateria | H1, H8 | ~8,0 V cheia | não lê, ou difere mais de 0,3 V do multímetro |
| Encoders girando | H5 | esquerda 284 a 294, direita 289 a 291 pulsos/volta | fora de 225 a 345, ou diferença entre rodas acima de 15% |
| Rodas e motores | H6, H7 | a 6 V: 2293 a 2312 pulsos/s, 0,09 A; H7: bateria mínima 8,02 V | diferença acima de 5%, corrente acima de 0,2 A, ou reinício |
| Sensores contra parede | B3 | esquerdo +2,9 a +10,5 mm; frontal +4,4 a +7,2 mm; direito −9,2 a +6,3 mm | erro de algum sensor mudou mais de 5 mm |
| Reta e ré | B1, B2 | 506 a 510 pulsos por reta; giro até 1,3° | pulsos fora de 496 a 526, ou giro acima de 3° |
| Botão | O1, O2 | (não existia) | botão sem resposta depois da ressolda |

Se a equipe de eletrônica mexeu em qualquer componente (ToF, MPU, INA219, motores, encoders, ponte H, regulador, ESP32, **botão**), pergunte a lista por escrito, peça foto de cima e de perto, e rode as conferências de TUDO mesmo assim. Fios de motor trocados mudam a opção `RATO_FIOS_MOTORES_TROCADOS`: registre e me avise, sem mudar o build.

### Bloco E: as novidades (uma por vez, ligada contra desligada)

Para cada teste, a chave `calib` e o padrão estão na tabela do início. **O `t.py` não tem os testes E1 a E8** (só o bloco O): **proponha o acréscimo** (preparo, comando, critério) e espere a minha aprovação antes de usar; sem isso, use `cmd`, `tofmon`, `corrida` e leia os logs. Critérios marcados "(a confirmar)" são propostas minhas: me mostre os números e eu decido.

| ID | O que testa | Como | Passa se |
|:--|:--|:--|:--|
| E1 | ToF abaixo de 40 mm (P1) | Robô APOIADO; uma caixa a 0, 20, 30, 40 e 60 mm da janela do **frontal** (`tofmon 5`), depois do esquerdo e do direito | **Frontal:** de 0 a 40 mm o log diz `perto` (mm 0), nunca `0 (ok)`; acima de 40 mm a leitura é distância válida. **Laterais:** só a leitura 0 vira `perto`; leituras de 24 a 40 mm continuam válidas (no centro da célula elas leem 24 a 34). Nenhum `E=0 (ok)` em lugar nenhum |
| E1b | Início do arco com parede à frente | Pista; C4 a C7 | Sem recuo exagerado: o 1º recuo ≈ alvo − 40 mm (~58 a 65 mm dependendo do alvo em uso; cheque a linha `inicio do arco`); o "ajuste antes da curva" ≤ 40 mm; o arco começa com o frontal em ~100 mm (alvo `kArcStartFrontMm` ≈ 100 com a frente de campo) |
| E2 | Auto-centralização célula a célula (M4) | `calib centralizar=1`. Corredor reto com parede dos dois lados, 4 a 6 células. Largue o robô 20 mm fora do centro e com ~5° de erro de rumo; leia as linhas `reta: pose lateral`. Ligado e desligado | Depois de 3 células: desvio lateral ≤ 5 mm (a confirmar) e rumo ≤ 2° (a confirmar); a estimativa existe (não `(sem estimativa)`) com paredes válidas; desligada acima de 5° de rumo; desligado, anote o desvio para comparar. B1 deve ficar ≤ 10 mm (em 16/11 foi 22 mm). **Volte `centralizar` a 0 no fim se piorar** |
| E3 | Curva em uma roda (M1) | `calib modo_curva=1`. Quina com parede à frente e passagem para um lado. 10 curvas à esquerda e 10 à direita, modo "uma roda" contra "arco" (`modo_curva=0`). Use `autoajuste_freio=1` para o freio e anote o freio aprendido. **Nenhum log tem curva de uma roda: este teste mede o atrito do apoio frontal e a inércia pela primeira vez** | Ângulo final de 88 a 92°; nenhuma batida; a roda de dentro anda ≤ 10 mm; o log `curva: uma roda: eixo comeca N mm antes do centro` mostra N dentro da faixa do CAD (**55,5 a 77,5 mm** com a frente do CAD; **40,5 a 77,5 mm** com a frente de campo; o firmware usa o meio da faixa); depois da curva o robô termina ~44 mm à frente e 15 a 33 mm fora do eixo da saída, e a centralização (`centralizar=1`) corrige em até 1 célula. Se a curva não couber: `curva com uma roda nao cabe com as medidas do corpo` (revise as medidas do corpo) |
| E4 | Velocidade e limite de tempo (M3) | Reta de 1 e de 5 células: meça o tempo (modelo: ~1,8 s por célula; ~4,8 s por passo com curva); `saude` e bateria; sem derrapar nem passar do ângulo. **O limite de 10 min é FIXO (sem chave `calib`)**: para testá-lo é preciso uma corrida que dure 10 min ou uma mudança de código (peça a minha aprovação); sem isso, registre "limite não exercitado no robô" e cite o teste de host `RaceDeadline` | Tempo por célula registrado e dentro de ±15% do modelo. **O modelo dá 10,5 min para o pior caso do 12x4 (192 passos, metade curvas), acima dos 8 min que se queria: é uma decisão conhecida e o limite de 10 min para a corrida; registre o número, não é falha.** Nenhuma corrida acima de 10 min |
| E5 | Mapa e Flood Fill (M2) | Em cada corrida: compare o `mapa NLSO` final com a pista real e o percurso com a tabela de percursos | Mapa igual à pista nas células visitadas; percurso igual ao da tabela; na pista B, A4 e B4 ficam sem visita |
| E6 | Becos (D1, D2: D1, D2, D3, D4 e o ramo A4-B4 ou A1-B1) | Corrida na pista A | Entra e sai de ré (`re de 1 celula`); sem girar 180° no lugar; sem batida; sem `rumo perdido`; o recuo no beco cabe na célula |
| E7 | Comandos duplicados (P4) | **Não há ID de comando no firmware** (a duplicação veio do `t.py`). Verifique o runner e a trava: depois de cada teste que mexe os motores, compare o nº de comandos de movimento em `comandos.txt` com as linhas `[cmd] ->` do `ponte.out` e com as execuções no `log_robo.txt`; confirme a regra 4 | Cada comando de movimento enviado roda UMA vez; `feitos.json` com uma entrada por `ok` meu; nenhuma tentativa extra sem pedido |
| E8 | ToF cai em movimento (P6) | Robô APOIADO com as rodas girando devagar (H6) e eu mexendo nos cabos | O firmware **não religa o sensor em movimento** (só parado): o sensor em falha fica mudo 500 ms; depois, no próximo passo, o Erro diz `falha de sensor por 3 passos: ... ToF em falha: direito`; o robô nunca "avança cego" por lado desconhecido. |

### Bloco F: labirintos oficiais (modulares), um layout por vez

Antes: peça uma **foto de cima** do labirinto montado e meça com régua, uma por vez: de centro a centro de células vizinhas em 3 lugares (esperado 180 ± 3 mm), espessura da parede (12 mm), largura livre do corredor em 3 lugares (168 ± 3 mm), altura das paredes, cor e material, degrau ou fresta entre módulos. Registre tudo. **Se o centro a centro passar de 180 ± 3 mm ou o corredor de 168 ± 3 mm, avise na hora** (as retas andam 180 mm fixos).

Cada corrida: `python t.py corrida <nome> "<descrição>"` (salva o log, imprime métricas e acrescenta uma linha em `resultados/corridas.csv`). Registre: chegou, tempo, passos, células visitadas, mapa final igual ao real, batidas, maior `giro=`, tensão da bateria no início e no fim. **Corrida acima de 10 minutos: o firmware para sozinho com erro explícito; anote.** Antes de cada corrida confira no log `largada N: labirinto CxL` e, se usou `labirinto`/toque longo, `labirinto diferente do DIP` e `relato ao painel`.

| ID | Layout | Como escolher | Corridas |
|:--|:--|:--|:--|
| F1 | A pista A montada no piso oficial (repete D1 e D2) | DIP 4x4; via 3 conforme a largada | 3 |
| F1b | A pista B no piso oficial (D4→A1) | DIP 4x4; borda à direita | 1 |
| F1c | 4x4 com o relato GIRADO (testa o painel com o único labirinto físico) | DIP 4x4; **toque longo** (3 bips) e depois toque curto | 1 |
| F2 | 8x4 "deitado" (4 linhas, 8 colunas) | DIP: via 1 fechada; via 3 aberta | 3 |
| F3 | 8x4, largada pelo outro canto | via 3 invertida | 2 |
| F4 | 4x8 "em pé" (8 linhas, 4 colunas) | **Está implementado** (não pelo DIP): com o DIP em 8x4, `python t.py cmd "labirinto 4x8"` ou **toque longo**. O painel recebe "8x4" girado | 2 |
| F4b | 4x12 "em pé" (12 linhas, 4 colunas) | DIP em 12x4 + `labirinto 4x12` ou toque longo | 1 |
| F5 | 12x4 | DIP: via 2 fechada | 1 a 2 |

Para cada layout desenhe-me o labirinto no mesmo estilo da pista 4x4, diga a célula de largada, a de chegada e para onde a frente aponta, e explique a conversão do log. **Nos em pé o mapa do robô fica no quadro dele (8 linhas × 4 colunas); só o relato ao painel é girado.** Se eu não tiver as peças para algum layout, registre como "não testado" e siga.

### Bloco G: resistência

- **G1:** 10 corridas seguidas na pista A (D4→A1 e D1→A4 alternando). Meta: **10 de 10 sem falha**. Uma falha: anote a causa e reinicie a contagem depois de eu aprovar a correção.
- **G2:** 3 corridas com a bateria já mais gasta (anote a tensão do início e do fim). A velocidade menor não pode causar parada por falta de força nem por limite de tempo.

## Etapa 5: quando algo falha de verdade

1. Junte as evidências: o `.log` do teste, as linhas `saude` e `laco` (laço acima de 4 ms, `erros I2C` ou `pulou` diferentes de zero = sensor falhou em movimento) e os avisos `tof: ... PAROU`.
2. Classifique: **hardware**, **preparo** (erro meu), **critério antigo do t.py** (velocidade ou pista antiga) ou **firmware** (o robô fez errado com tudo respondendo).
3. Hardware: diga exatamente o que olhar (qual sensor, fio, roda ou botão) e pare o bloco.
4. Firmware: primeiro proponha um valor do `calib` (nome, valor antigo, novo, como foi medido pelo `MEDICOES.md` e o teste que deve passar). Se o `calib` não resolver, proponha mudança de código com arquivo e linha. Espere a aprovação. Aprovada: aplique só ela, rode os testes de host, mostre o `git diff`, anote em `MUDANCAS.md` (teste, valor medido, critério, arquivos e linhas, valor antigo e novo; sem commit), compile, grave (troca bateria/USB da Etapa 1), `python t.py reiniciar`, portão, e repita o teste que falhou e os anteriores do mesmo bloco.

| Sintoma no log | `calib` a considerar |
|:--|:--|
| Curvas com `final` fora de 88 a 92°, sempre para o mesmo lado (muito provável com os freios novos, nunca medidos) | `freio_arco` (3,2) / `freio_pivo` (10,1) / `freio_uma_roda` (3,2), ou `autoajuste_freio=1` |
| Volta de 4 curvas não volta à direção inicial | `escala_giro` (`python t.py calib-giro`). **A bitola efetiva do arco (74,2) foi medida com a escala 1,08: se `escala_giro` mudar, ela muda junto** (peça a minha aprovação antes de mexer) |
| `frontal perto` ou `X mm na parada` abaixo de 40 e "ajuste antes da curva" | `parada_frente` (meta: o nariz parar a 40 a 50 mm da parede) |
| Arco começa perto ou longe demais da parede | `eixo_ate_frente`, `largura_frente`, `eixo_ate_tof_frente` (ou `preset_cad=1`) |
| Curva com uma roda não cabe, ou bate | as medidas do corpo (o alvo vem do meio da faixa de início); `cabo_frente_mm` |
| `lat E`/`lat D` muito diferentes no fim das retas, ou `pose lateral` sem estimativa | `centralizar=1` |
| `giro=` grande nas retas, desvio no B1 | `ganho_rumo` (se entortar mais, volte a 0) |

## Etapa 6: fechamento e veredito

1. Rode `python t.py` e acrescente ao `RESULTADOS.md`: resumo por bloco (passou, falhou, conferir, pulado), cada falha com a causa provável e a mudança proposta, a tabela do B3, os números do H4 e do H6, o último `saude`, a tabela de medidas do bloco M (CAD, paquímetro, campo e a decisão tomada) e a tabela de corridas do `corridas.csv`.
2. **Veredito**, linha a linha, com PASSOU/FALHOU:
   - Testes de host: 317 passando, sem avisos.
   - Compilação para a placa: compilou (primeira vez depois das mudanças de 19/11).
   - Regressão (bloco R): nenhum item pior que 16/11 (itens de velocidade não contam).
   - Hardware (bloco H) e botão (bloco O): sem queda do ToF direito; botão e buzzer funcionando.
   - Curvas (C4 a C7, B5, E3): 0 batidas, ângulo final de 88 a 92°; freios novos medidos ou ajustados.
   - Desfazer do arco (C8): voltou com o robô solto; parou em Erro com motivo claro quando segurado.
   - Centralização (E2) e reta (B1): dentro dos limites.
   - ToF abaixo de 40 mm (E1): sem leitura "ok" de 0 mm.
   - Tempo (E4, F): tempo por célula medido; modelo do pior caso (10,5 min) e nenhuma corrida acima de 10 min.
   - Pista A (D, G1): 10 de 10 sem falha. Pista B (D8, D9): bolsão ignorado e objetivo inalcançável tratado com erro explícito (ou registrado como achado).
   - Layouts (F): quais foram testados (inclusive em pé por `labirinto` e toque longo, com o painel girado) e quais ficaram sem teste físico (diga isso com clareza).
   - Pendências: tudo o que ficou como "não implementada", "não testado" ou "a confirmar" (limite de 10 min no robô, atrito da curva com uma roda, freios novos, `cabo_frente_mm`, frente do CAD x campo, toque longo de 1 s).
3. Anote `python t.py calib-ver` final no `RESULTADOS.md`. Confirme que `resultados/` tem `RESULTADOS.md`, `log_robo.txt`, `ponte.out`, `telemetria.jsonl`, `comandos.txt`, os `<ID>_t<N>.log`, `corridas.csv`, `feitos.json`, `build.log`, `flash.log`, `boot.log`, `versao-firmware.txt` e `MUDANCAS.md`. Compacte em `src/firmware/robot-tests/resultados-AAAA-MM-DD.zip` e me diga o caminho. Encerre a ponte.

Comece pela Etapa 0 e me diga, em poucas linhas, o que encontrou nesta máquina e o que precisa que eu instale ou confirme antes da Etapa 1.
