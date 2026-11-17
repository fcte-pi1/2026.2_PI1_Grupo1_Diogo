Você vai conduzir comigo, com o robô micromouse, tudo o que ficou pendente dos testes de 16/11 e das mudanças de firmware de 16-17/11. Você faz TUDO no computador: confere o código, compila, grava, liga a ponte Bluetooth, manda os comandos, lê os logs, julga e registra. Eu só mexo no robô com as mãos. Fale comigo em português, em linguagem simples.

**Eu não conheço o robô nem o projeto.** Cada instrução física tem de ser explícita, numerada, uma ação por item, dizendo o que pegar, onde pôr, para que lado virar e o que eu devo ver quando der certo. Nunca escreva "posicione o robô" sem dizer a célula e para onde a frente aponta. Nunca me peça para ler log, rodar comando ou decidir se passou: isso é com você.

## Leia antes de qualquer coisa

Leia inteiros, nesta ordem, e não suponha o que não estiver neles (pergunte):

1. `teste-v3/resultados/MUDANCAS.md`: as mudanças 1 a 12 (o que mudou, por quê, o que falta testar).
2. `teste-v3/ROTEIRO_23-11.md`: a ordem dos testes de hoje. Este prompt detalha e manda nele.
3. `teste-v3/t.py` inteiro (inclusive os comandos novos `calib-ver`, `calib`, `medidas`, `calib-giro`) e `teste-v3/ponte.py`.
4. `src/firmware/LOGS_E_MEDIDAS.md`, principalmente as seções 5 (diagnóstico) e 6 (`calib`), e `teste-v3/MEDICOES.md` (como medir cada valor do `calib` com régua e paquímetro, e como conferir com o robô).
5. `teste-v3/resultados/RESULTADOS.md` (o que aconteceu em 16/11) e o fim de `teste-v3/resultados/log_robo.txt`.
6. `src/firmware/include/domain/Calibration.hpp`, `src/firmware/include/domain/BrakeLearner.hpp` e, em `src/firmware/src/adapters/Drv8833MotionAdapter.cpp`, as funções `straight`, `pivot`, `arcTurn` e `positionForArc`.

## Fatos do projeto (valem para qualquer decisão)

1. O robô é SÓ de exploração: começa sabendo só as bordas, descobre as paredes internas pelos ToF (esquerdo, frontal, direito) e resolve pela inundação. Não existe corrida rápida e não vai existir.
2. Labirintos: só 4x4, 8x4 e 12x4 (4 linhas). A largada é sempre num canto da linha de baixo; o objetivo é sempre o canto oposto. Tamanho e canto vêm da chave DIP, lida só no boot.
3. O mapa é zerado a cada largada. Nada pode depender da pista 4x4 da equipe, de sequência fixa de movimentos ou de posição fixa. O desenho 4x4 e os passos esperados do D1/D2 servem só para interpretar os logs.
4. O firmware novo (16-17/11) tem o comando `calib`, gravado na memória do robô. **Tudo o que é novidade está DESLIGADO por padrão** (`parada_frente=35`, `autoajuste_freio=0`, `ganho_rumo=0`, `centralizar=0`). Hoje cada novidade é ligada pelo `calib`, uma por vez, testada e desligada se piorar.
5. **Nada das mudanças de 16-17/11 rodou no robô ainda.** O sinal do `ganho_rumo` foi conferido só pela lógica do código: se o robô entortar mais com ele, está invertido.
6. O robô está gravado com um build de TESTE de 16/11 (15:35, centralização LIGADA). A primeira coisa de hoje é gravar o build novo.

## Regras de segurança (valem sempre)

1. **Bateria e USB nunca ligados ao mesmo tempo.** O USB serve só para gravar, com a bateria desligada. Antes de gravar, leia o boot pela serial: a linha `INA219 PAROU de ler (ou a bateria esta abaixo de 1 V)` confirma que a bateria está fora. Se o INA219 estiver lendo, NÃO grave: peça para eu desligar a bateria.
2. **Nenhum comando que mexe os motores sem o meu `ok`.** Para cada teste: mostre o preparo, espere o `ok`, só então rode. `pular`: registre como pulado. `repetir`: refaça. `parar`: rode `python t.py parar` NA HORA, antes de qualquer outra coisa.
3. **Fique sempre em condição de frear.** Rode os testes que mexem os motores em segundo plano e acompanhe a saída. Plano B, que você me diz antes do primeiro teste de motor: levantar o robô pelo chassi e desligar a bateria.
4. **Execução duplicada.** Em 16/11 alguns comandos foram executados DUAS vezes pelo ambiente (A1, B1, C8), uma delas sem o meu `ok`. Por isso, todo teste que mexe os motores roda por uma trava de execução única com um nome FIXO por `ok` meu (por exemplo `D1_ok_3`), nunca calculado a partir do número da tentativa. Recrie a trava no início (um script que faz `mkdir` de uma pasta com o nome e recusa se ela já existir). Depois de cada teste, confira em `teste-v3/resultados/feitos.json` que ele rodou uma vez só. Se rodou duas: me avise na hora e verifique onde o robô está.
5. **Não altere código nem parâmetros por conta própria.** Se um teste falhar, analise e proponha a mudança com arquivo, linha, valor antigo e novo; espere a minha aprovação. Mudança aprovada: aplique só ela, rode os testes de host e anote em `teste-v3/resultados/MUDANCAS.md`. Trocar um valor pelo `calib` também precisa do meu `ok`, exceto os comandos de voltar ao padrão escritos neste prompt.
6. **Nunca rode `git commit`, `git add`, `git stash`, `git reset`, `git checkout` de arquivo, `git am` nem `git push`.** Os commits são meus. O git é só para ler (`status`, `diff`, `log`).
7. **A chave DIP só é lida quando o robô liga.** Depois de eu mexer nela, rode `python t.py reiniciar` e confira a linha `entradas:` do `python t.py cmd "diag" 12`.
8. **Depois de uma corrida que termina em FALHA o robô fica em Erro**: comandos de motor são recusados. Antes de me mandar tirar o robô do lugar, rode `python t.py cmd "tof"`, me pergunte a célula e para onde a frente aponta, e só então `python t.py reiniciar`.
9. **Respostas ambíguas.** Se eu responder só "ok" a uma pergunta de sim/não ou de célula, NÃO registre como sim: pergunte de novo, explicitamente.

## Formato das instruções físicas

Uma mensagem por teste, neste formato, sem log junto:

```
TESTE <ID> — <título>   (tentativa N)
O que este teste confere: <uma frase simples>
Faça agora:
1. ...
O que vai acontecer: <o robô anda X, gira Y, por Z segundos / nada se mexe>
Cuidado: <...>
Responda "ok" quando estiver pronto (ou "pular").
```

Os itens de "Faça agora" são TODOS os itens do PREPARO que `python t.py preparo <ID>` imprime, na mesma ordem, completados para um leigo. Depois do teste, diga o resultado em uma ou duas frases e só mostre números se eu pedir.

**Glossário:** frente do robô = a ponta mais longe das rodas, onde fica o sensor do meio. Esquerda e direita = as de quem olha o robô por trás. APOIADO = sobre um suporte firme, com as duas rodas no ar, nunca na mão. Seguro firme = apoiado e com o chassi preso contra o suporte pelas duas mãos. Chave DIP: ABERTA = OFF, FECHADA = ON. Centrado na célula = no meio da célula, alinhado com o corredor, mãos fora do labirinto. O "meio do eixo" = o ponto entre as duas rodas.

**O labirinto 4x4 da equipe** (letras = colunas da esquerda para a direita; números = linhas de cima para baixo):

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

No log, largando de D4 ou D1 virado para a coluna C: letra = A + linha do log, número = 4 − coluna do log. Comigo, use sempre o nome da pista. Ao dizer para onde a frente aponta, diga a célula vizinha E a direção no desenho.

## Etapa 0: reconhecer a máquina (sem o robô)

Em poucas linhas, me diga:

1. `git status --short` e `git log --oneline -3`. As mudanças de 16-17/11 estão sem commit, ou eu já commitei? Confira que existem `src/firmware/include/domain/Calibration.hpp`, `BrakeLearner.hpp`, `test/use_cases/ExplorationTest.cpp` e o comando `calib` em `src/firmware/src/main.cpp`. Se faltar algo, pare e me avise.
2. Testes de host (CMake + GoogleTest, avisos como erro, build fora do repositório): esperado **252** passando. Se falhar, pare.
3. ESP-IDF 5.3 em `~/esp/esp-idf` (ativa com `. ~/esp/esp-idf/export.sh`).
4. Ponte: Python do Windows `C:\Users\samue\AppData\Local\Programs\Python\Python312\python.exe` (tem `bleak` e `websockets`), chamado do WSL com o caminho de `wslpath -w teste-v3/ponte.py`. O Bluetooth não funciona pelo WSL.
5. Placa: porta serial pelo `usbipd` (em 16/11, CH343 no busid `2-1`; confira com `cmd.exe /c "usbipd list"` e, se não estiver em `/dev/ttyACM0`, `cmd.exe /c "usbipd attach --wsl --busid <id>"`). Leitura do boot: `pyserial` do ambiente Python do ESP-IDF, abrindo `/dev/ttyACM0` a 115200 e reiniciando pelo RTS.
6. Mova os arquivos de `teste-v3/resultados/` que forem de 16/11 para `teste-v3/resultados/16-11/` (pergunte antes), para não misturar com os de hoje. O `MUDANCAS.md` FICA onde está.

## Etapa 1: compilar e gravar o build novo

1. Compile `src/firmware/esp32` com exatamente: `CONFIG_RATO_LOG_RETA=y`, `CONFIG_RATO_FIOS_MOTORES_TROCADOS=y`; `RATO_BANCADA`, `RATO_CENTRALIZAR_PAREDES` e `RATO_SLOW_DECAY` desligados. Use diretório de build e `sdkconfig` próprios, fora do repositório; confira as cinco linhas `RATO` no `sdkconfig` gerado. Apague o objeto `esp_app_desc.c.obj` do build antes de compilar, para o carimbo de data e hora sair novo. Log em `teste-v3/resultados/build.log`. Anote a hora.
2. Gravar, um passo por mensagem, esperando o meu `ok` em cada um: "Desligue a bateria" → "Ligue o cabo USB de dados na porta UART" → você confere pelo boot que a bateria está fora (regra 1), grava e lê o boot por 10 s → "Tire o cabo USB" → "Só agora ligue a bateria".
3. No boot confira: `Compile time` com a hora da sua compilação; `tof: esquerdo/frontal/direito pronto em 0x30/0x31/0x32`; as linhas `calib:` (todas "padrao", a não ser que já tenham sido gravadas medidas); e que NÃO aparece "centralizacao ... LIGADA". Guarde em `boot.log` e `flash.log`; atualize `versao-firmware.txt`.
4. Suba a ponte em segundo plano e espere `teste-v3/resultados/estado.txt` com `"conectado": true` (até 40 s). Rode `python t.py calib-ver`: as 13 linhas têm de aparecer. Se o robô já tiver valores gravados de outro dia (`ALTERADO`), me mostre e pergunte se volto ao padrão com `python t.py calib "padrao"`.

## Etapa 2: como rodar cada teste

1. `python t.py preparo <ID>`; mensagem no formato acima; espere o `ok`.
2. Rode `python t.py <ID> --auto` pela trava da regra 4 (em segundo plano se mexe motores; limite de 6 minutos).
3. Linhas `PERGUNTAR:`: uma pergunta por vez, em linguagem simples; registre com `python t.py responder <ID> chave=valor ...`.
4. Resultado em uma ou duas frases; análise com `python t.py nota <ID> "..."` quando houver algo a dizer.
5. `PASSOU`: siga. `CONFERIR`: anote e siga. `FALHOU`: leia o `.log` e o `log_robo.txt`, diga a causa provável, repita UMA vez conferindo o preparo; falhou de novo: regra de parada do bloco.
6. Robô reiniciou sozinho ou a ponte caiu: espere reconectar, rode `python t.py cmd "diag" 12`, registre o `reset=`. `LIGOU (poweron)` = a energia foi cortada (chave ou conector da bateria). Dois reinícios sozinhos: pare tudo.

## Etapa 3: a sequência de hoje

Antes de cada bloco: `python t.py portao`.

### 3.1 Hardware: o ToF direito ressoldado (bloco H inteiro)

H1, H2, **H3**, H4, H5, H6, H7, H8, robô APOIADO.
- O H3 é o que prova a solda: durante 60 s eu mexo com um palito de PLÁSTICO nos cabos do esquerdo, do da frente e do direito (~15 s cada) e bato de leve no chassi. Avise quando faltar pouco.
- Em 16/11 o ToF direito reiniciava sozinho (voltava ao 0x29) de 1 a 200 s depois de ligar; a alimentação dele oscilava (3,3 → 1,85 V) e o GND dele tinha 1,0 Ω contra 0,02 Ω do VIN. Se aparecer `tof: direito PAROU`: é a solda; pare o bloco e me diga o que olhar.
- No H5 eu giro as DUAS rodas na mesma janela de 25 s (primeiro a esquerda, depois a direita). Diga "AGORA" assim que mandar o comando.
- O H6 reprovou em 16/11 só pelo critério de partida (0,6 V numa das quatro medidas, mudando de roda a cada vez). Se for igual, registre CONFERIR com essa análise.
- Regra de parada: um teste falhou duas vezes sem ser erro de preparo → pare tudo; é montagem.

### 3.2 Medidas do robô e escala do giroscópio

1. `python t.py medidas` (interativo: rode-o você e me faça as perguntas UMA de cada vez, passando as respostas). Para cada medida, me explique COMO medir seguindo a seção 2 do `teste-v3/MEDICOES.md` (material, onde encostar o paquímetro, o "meio do eixo", o método da "parede"). Se eu ainda não tiver alguma, pule-a.
1b. Faça as conferências com o robô da seção 2 do `MEDICOES.md` (`eixo_ate_tof_frente` pela parede e o `tof`; `tof_lado_ao_centro` no meio de um corredor). Se a conferência e o paquímetro diferirem em mais de 5 mm, me mostre os dois números e pergunte qual gravar. Peça também, na mesa, as medidas da seção 5 (eixo até a traseira, diâmetro da roda, bitola) e anote no `RESULTADOS.md`, sem mudar o código.
2. `python t.py calib-ver`: me diga onde o arco passa a começar (linha `calib: fim:`), comparado com os 104,8 mm de 16/11.
3. `python t.py calib-giro` num corredor da pista com parede contínua de um lado e 3 células (por exemplo a linha 4 de A4 a C4, ou a linha 1). Repita até o "erro da volta" ficar abaixo de 1,5 grau. Grave a escala proposta só com o meu `ok`. Se o `calib-giro` não conseguir ler a parede, use o método com fita e régua da seção 3 do `MEDICOES.md`.

### 3.3 No ar e no chão livre (blocos A e B)

A1 a A5; B1, B2 (régua: 900 ± 25 mm e 540 ± 15 mm); os 12 B3 (caixa de face CLARA, ou coberta com papel branco); B4d e B4e x3 cada; B5d x3 e B5e x3. Monte a tabela do B3 (real, lido, erro) e compare com a de 16/11. Meta do arco (B5): `final` entre 88 e 92.

### 3.4 Labirinto, uma manobra por vez (bloco C)

Antes, me mostre o desenho e peça para eu conferir a pista parede por parede.
C1, C2, C3, C4 x3, C5 x3, C6 x3, C7 x3, C8. Em cada curva com parede à frente, anote o "frontal X mm na parada" e se apareceu "ajuste antes da curva". Em cada curva, anote o `tof: depois da curva` (lateral abaixo de ~15 mm = passou raspando). No C8: diga "AGORA" quando mandar o comando; eu seguro ~1 s quando o robô COMEÇAR a girar e SOLTO logo; em 16/11 o "desfez o arco" não voltou e não se sabe se foi a mão. Regra de parada: uma curva de C4 a C7 encostou ou falhou nas 3 vezes → não faça o bloco D.

### 3.5 As novidades, uma por vez

Para cada uma: me explique em uma frase o que muda, peça o `ok` para o `calib`, repita os testes indicados e compare com os do passo 3.4. Passou: fica ligada. Piorou: volte com o comando "desligar" e anote.

| # | Ligar | Repetir | Passa se | Desligar |
|:--|:--|:--|:--|:--|
| 1 | `python t.py calib "parada_frente=65"` | C4 x3, C5 x3 | `frontal X mm na parada` acima de 40 e nenhum "ajuste antes da curva"; nada encosta. Peça para eu medir com a régua o nariz até a parede na parada (meta 40-50 mm) e ajuste pela fórmula da seção 4 do `MEDICOES.md` | `calib "parada_frente=35"` |
| 2 | `python t.py calib "autoajuste_freio=1"` | B5d x3, B5e x3, C4 x3 | a linha `curva: freio:` converge; `final` entre 88 e 92 | `calib "autoajuste_freio=0"` |
| 3 | `python t.py calib "ganho_rumo=1.0"` | B1; `andar` x3 no corredor da linha 1 | `giro=` de cada reta perto de 0 e desvio lateral menor que 22 mm. Entortou MAIS: desligue na hora e me avise (sinal invertido) | `calib "ganho_rumo=0"` |
| 4 | `python t.py calib "centralizar=1"` | C3; `andar` x3 no corredor; em C1 com a frente para a borda de cima, `virar e` seguido de `andar` | `lat E` e `lat D` parecidos no fim de cada reta; sem balançar; entra em B1 sem pegar a quina embaixo de B1 | `calib "centralizar=0"` |

No fim, `python t.py calib-ver` e anote a combinação que ficou.

### 3.6 Corridas (bloco D) com a combinação final

D1 x3, D2 x3, D3, D4, D5, D6, D7. Confira comigo a via 3 antes de cada teste e rode `python t.py reiniciar` sempre que ela mudar. Passos esperados do D1: D4, C4, B4, A4, A3, A2, B2, B3, C3, C2, C1, B1, A1. Do D2: D1, C1, B1, A1, ré para B1 e C1, C2, C3, B3, A3, A4. Um passo fora da ordem: mostre o mm de cada sensor e o `mapa NLSO` daquele passo e diga qual parede foi lida diferente da pista. Em 16/11 o D1 falhou no passo 11: depois da curva à esquerda em C1, o robô pegou a quina da parede embaixo de B1 (giro de 27° numa reta de 90 mm). Confira se isso some. Para cada corrida, calcule o tempo médio por célula pelos carimbos das linhas `nav: passo` (16/11: ~2,6 s) e o tempo de cada curva com parede (16/11: 3,4 a 3,8 s). Regra de parada: bateu forte ou prendeu em 2 corridas seguidas → pare o bloco.

### 3.7 Uma pista DIFERENTE do desenho 4x4

Peça para eu mudar pelo menos 4 paredes internas (um beco novo e um laço aberto), me diga exatamente quais peças tirar e onde pôr, e desenhe a pista nova. Rode 3 corridas de cada canto (via 3 certa para cada um). Se houver peças, monte um 8x4 (via 1 fechada, `python t.py reiniciar`) e rode 2 corridas. Depois, duas corridas SEGUIDAS sem reiniciar, trocando duas paredes entre elas: a linha `nav: mapa` do fim da segunda tem de mostrar só o que ela viu. Passa se o robô chega ao canto oposto, sem bater, em todas.

## Etapa 4: quando algo falha de verdade

1. Junte as evidências: o `.log` do teste, as linhas `saude`, a linha `laco` (laço acima de 4 ms ou `erros I2C`/`pulou` diferentes de zero = um sensor falhou durante o movimento) e os avisos `tof: ... PAROU`.
2. Classifique: **hardware** (sensor que cai, roda que prende, encoder, bateria, reinício sozinho, fio solto encostando), **preparo** (erro meu) ou **firmware**.
3. Hardware: diga o que olhar no robô e pare o bloco. Não contorne por software.
4. Firmware: primeiro veja se um valor do `calib` resolve (sem regravar). Se não, proponha a mudança de código com arquivo e linha e espere a aprovação.

## Etapa 5: fechamento do dia

1. `python t.py` e acrescente ao fim de `teste-v3/resultados/RESULTADOS.md`: resumo por bloco (passou, falhou, conferir, pulado); cada falha com a causa provável; a tabela do B3; os números do H4 e do H6; os contadores do último `saude`; a combinação final do `calib-ver`; a comparação com 16/11 (tempo por célula, tempo por curva, "ajuste antes da curva", raspadas).
2. Confira que `teste-v3/resultados/` tem `RESULTADOS.md`, `log_robo.txt`, `ponte.out`, `telemetria.jsonl`, `comandos.txt`, os `<ID>_t<N>.log`, `build.log`, `flash.log`, `boot.log`, `versao-firmware.txt` e `MUDANCAS.md`. Compacte em `teste-v3/resultados-2026-11-23.zip` e me diga o caminho.
3. Encerre a ponte.

## Etapa 6: o que fica para o código, DEPOIS do robô (sem o robô)

Só depois da Etapa 5, e com os dados de hoje. Tudo com as mesmas regras: plano primeiro, minha aprovação item por item, testes de host (os 252 e os de exploração em `ExplorationTest.cpp`), `MUDANCAS.md`, sem commit e sem gravar.

1. **Rumo absoluto entre movimentos e "zerar" o rumo pelas paredes** (ideia 1): o adaptador soma o giro em todos os movimentos, sabe que o rumo certo é múltiplo de 90° e corrige na reta seguinte o que a curva deixou torto; o erro é zerado quando uma parede lateral confirma o alinhamento durante a reta. Nada de parada extra só para isso.
2. **Centralizar logo após as curvas** (ideia 3): usar `tof_lado_ao_centro` e `tof_lado_a_frente_do_eixo` medidos hoje e a centralização calibrada no passo 3.5.
3. **Não parar no centro quando o próximo passo é seguir reto, e não parar de novo em célula já visitada** (ideias 4c e 4d): ler as paredes laterais em movimento num ponto fixo da célula, dividido em passos pequenos (reta que emenda na próxima; leitura em movimento; o Navigator decide sem parar). A margem calculada em 16/11: a 200 mm/s, ~18 leituras laterais por célula e ~33 mm de frenagem.
4. Para cada item: diga o risco para a capacidade de resolver qualquer labirinto e como os testes de exploração provam que ela continua (objetivo alcançado em todos os labirintos gerados, mapa zerado entre largadas, paradas contadas antes e depois).
5. No fim, escreva o roteiro de retestes desses itens, com o build exato e o que cada log deve mostrar.

Comece pela Etapa 0 e me diga, em poucas linhas, o que encontrou e o que precisa que eu confirme antes da Etapa 1.
