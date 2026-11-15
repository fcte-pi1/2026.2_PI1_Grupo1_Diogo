Você vai conduzir a bateria de testes de um robô micromouse comigo. Você faz TUDO no computador: confere o código, compila, grava, liga a ponte Bluetooth, manda os comandos, lê os logs, julga e registra. Eu só mexo no robô com as mãos. Fale comigo em português.

**Eu não conheço o robô nem o projeto.** Trate-me como alguém que nunca viu este robô: cada instrução física tem de ser explícita, numerada, uma ação por item, dizendo o que pegar, onde pôr, para que lado virar e o que eu devo ver quando der certo. Nunca escreva "posicione o robô" sem dizer a célula e para onde a frente aponta. Nunca me peça para ler log, rodar comando ou decidir se passou: isso é com você.

## Contexto

- Repositório: firmware em `src/firmware` (C++17, ESP-IDF 5.3.3, ESP32-S3). Branch `feat/controle-motores-tensao`.
- O código da "versão 3" JÁ ESTÁ na pasta do repositório: eu copiei os arquivos por cima. Pode haver mudanças ainda sem commit; é o esperado. **Quem faz os commits sou eu, depois.**
- Na raiz há a pasta `teste-v3/` (se não houver, peça para eu copiar o conteúdo do `robo-v3-codigo-completo.zip` para a raiz e pare até eu confirmar):
  - `teste-v3/ARQUIVOS_ALTERADOS.txt`: a lista dos 16 arquivos do firmware que a versão 3 mudou.
  - `teste-v3/ponte.py`: roda a ponte BLE do repositório, lê comandos de `teste-v3/resultados/comandos.txt` e grava `log_robo.txt`, `ponte.out`, `telemetria.jsonl` e `estado.txt` (conectado ou não, e o boot atual) em `teste-v3/resultados/`.
  - `teste-v3/t.py`: roda UM teste por vez. É a fonte única dos testes: preparo físico, comando, critério e conferência automática estão nele. Leia o arquivo inteiro antes de começar.
- A versão 3 NUNCA foi compilada com o ESP-IDF nem rodou na placa. Só passou nos testes de host e numa simulação em PC. Um erro de compilação é possível.
- Histórico que você precisa saber (teste de 11/11): o ToF direito parava de responder no meio dos testes; o giroscópio tem desvio em repouso; o robô girava na mão do operador nos testes "suspensos"; a bateria de testes parou no C3 e as curvas no labirinto (C4 a C8) e as corridas (bloco D) nunca foram testadas.
- Antes de qualquer coisa, leia: `teste-v3/t.py`, `teste-v3/ponte.py`, `teste-v3/LEIA-ME.txt`, `src/firmware/LOGS_E_MEDIDAS.md` (formato de cada linha de log, comandos BLE e a seção 5, de diagnóstico), `src/firmware/README.md`, `src/firmware/GUIA_DESENVOLVIMENTO.md`, `src/firmware/ROTEIRO_TESTE_ROBO.md` (seção 1, como gravar), `src/firmware/bridge/README.md` e `src/firmware/esp32/main/Kconfig.projbuild`. Não suponha: o que não estiver nos arquivos, pergunte.

## Regras de segurança (valem sempre)

1. **Bateria e USB nunca ligados ao mesmo tempo.** O USB serve só para gravar, com a bateria desligada. Os testes rodam na bateria, sem cabo, pelo Bluetooth. Em cada troca, me dê os passos um a um (regra 8) e espere eu confirmar cada troca.
2. **Nenhum comando que mexe os motores sem o meu `ok`.** Para cada teste: mostre o preparo, espere eu responder `ok`, e só então rode o teste. Se eu responder `pular`, registre como pulado. `repetir`: refaça. `parar`: rode `python t.py parar` NA HORA, antes de qualquer outra coisa.
3. **Fique sempre em condição de frear.** Rode os testes que mexem os motores em segundo plano (background) e acompanhe a saída; assim, se eu escrever `parar`, você consegue rodar `python t.py parar` imediatamente. Antes do primeiro teste de motor, me diga o plano B: levantar o robô e desligar a bateria.
4. **Não altere código nem parâmetros por conta própria.** Se um teste falhar, analise, proponha a mudança com arquivo e linha, e espere eu aprovar (regra 9).
   **Nunca rode `git commit`, `git add`, `git stash`, `git reset`, `git checkout` de arquivo, `git am` nem `git push`.** Os commits são meus. Você só usa o git para LER (`status`, `diff`, `log`).
5. **Siga a ordem dos blocos (H, A, B, C, D) e as regras de parada** da Etapa 4. Antes de cada bloco, rode `python t.py portao`.
6. **A chave DIP só é lida quando o robô liga.** Depois de eu mexer nela, rode `python t.py reiniciar`.
7. **Depois de uma corrida que termina em FALHA o robô fica em Erro**: comandos de motor são recusados (`IGNORADO`). Os de leitura continuam valendo. Antes de me mandar tirar o robô do lugar, rode `python t.py cmd "tof"` para registrar onde ele parou, me pergunte a célula, e só então `python t.py reiniciar`.
8. **Como me dar instruções físicas.** Uma mensagem por teste, neste formato, e nada de log junto:

   ```
   TESTE <ID> — <título>   (tentativa N)
   O que este teste confere: <uma frase simples>
   Faça agora:
   1. ...
   2. ...
   O que vai acontecer: <o robô anda X, gira Y, por Z segundos / nada se mexe>
   Cuidado: <mãos longe das rodas / não encoste na mesa / ...>
   Responda "ok" quando estiver pronto (ou "pular").
   ```

   Os itens de "Faça agora" são TODOS os itens do PREPARO que o `python t.py preparo <ID>` imprime, na mesma ordem, sem resumir. Acrescente o que faltar para alguém leigo (onde fica a frente do robô, qual é a roda esquerda, como é "apoiado"), usando o glossário abaixo. Depois do teste, diga o resultado em uma ou duas frases simples ("passou", "falhou porque o sensor da direita parou de responder") e só mostre números se eu pedir.
9. **Mudança de código só com a minha aprovação, e sem commit.** Quando eu aprovar uma mudança: aplique só ela, rode os testes de host, e me mostre o `git diff` dos arquivos que você mexeu. Não commite. Anote cada mudança aprovada em `teste-v3/resultados/MUDANCAS.md`: o teste que falhou (ID), o valor medido no log e o critério, os arquivos e linhas alterados, o valor antigo e o novo de cada parâmetro. É por esse arquivo que eu vou montar os commits depois.

## Glossário para as instruções físicas

- **Frente do robô:** a ponta mais longe das rodas, onde fica o sensor de distância do meio. **Esquerda e direita:** as de quem olha o robô por trás (das rodas para a frente).
- **APOIADO:** sobre um suporte firme (caixa pequena ou pilha de livros sob o chassi), com as duas rodas no ar e livres, numa mesa em que ninguém esbarre. Não é na mão. Em 11/11, "suspenso na mão" estragou três testes.
- **Seguro firme:** apoiado E com o chassi preso contra o suporte pelas duas mãos, sem tocar nas rodas e sem tapar os sensores.
- **Chave DIP:** a chavinha de 3 vias na placa. ABERTA = OFF. FECHADA = ON. Para saber como o robô a está lendo: `python t.py cmd "diag" 12`, linha `entradas:`.
- **Centrado na célula:** no chão da pista, no meio da célula (mesma distância das duas paredes laterais), alinhado com o corredor, mãos fora do labirinto.
- **O labirinto 4x4** (letras = colunas, da esquerda para a direita; números = linhas, de cima para baixo; `|` e `-----` são paredes):

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

  Antes do bloco C, me peça para conferir parede por parede que a pista está igual a esse desenho, e me mostre o desenho. Quando disser para onde a frente aponta, diga a célula vizinha E a direção no desenho (por exemplo: "frente virada para A1, que no desenho é para cima").
- No log, o robô usa outro nome para as células. Largando de D4 ou D1 virado para a coluna C: letra = A + linha do log, número = 4 − coluna do log (`(l0,c2)` = A2). Comigo, use sempre o nome da pista.

## Etapa 0: reconhecer a máquina

Descubra e me diga em poucas linhas, antes de fazer qualquer coisa:

1. Sistema, shell, onde está o ESP-IDF 5.3.3 e como ativá-lo (no Windows: o `export.bat` da instalação; em 11/11 foi `C:\Users\<usuário>\esp\esp-idf\export.bat` chamado por `cmd /c`). Se não achar o ESP-IDF, pare e me diga o que instalar.
2. Python 3.10 ou mais novo com `bleak` e `websockets` para a ponte. No Windows a ponte tem de rodar no Python do Windows (em 11/11 o Bluetooth pelo WSL2 não funcionou) e o venv tem de ficar num caminho curto (`C:\rato\.venv`); crie-o e instale `src/firmware/bridge/requirements.txt` se faltar.
3. `git status` e `git log --oneline -3`.

## Etapa 1: código, build e gravação

1. **Conferir que a versão 3 está na pasta.** Rode `git status --short` e `git log --oneline -3` e me mostre. Confira que existem no código: o comando `"tofrec"` em `src/firmware/src/main.cpp`, a função `recoverFailed` em `src/firmware/src/adapters/Vl53l1xSensorAdapter.cpp` e `calibrateGyro` em `src/firmware/src/adapters/Drv8833MotionAdapter.cpp`. Se faltar algum, o código copiado não é a versão 3: pare e me avise. Não desfaça nem "limpe" mudanças sem commit: elas são a versão 3.
   A versão que o robô vai mostrar no H1 vem do git na hora da compilação e pode terminar em `-dirty` (mudanças sem commit): é normal. A prova de que o robô está com o firmware certo é a **data e hora de compilação** que o H1 mostra: anote a hora em que você compilar.
2. **Testes de host** de `src/firmware` (CMake + GoogleTest, com avisos como erro). Esperado: 237 passando. Se falhar, pare e me mostre.
3. **Compilar** `src/firmware/esp32` para o ESP32-S3 com exatamente: `CONFIG_RATO_LOG_RETA=y`, `CONFIG_RATO_FIOS_MOTORES_TROCADOS=y`, e `RATO_BANCADA`, `RATO_CENTRALIZAR_PAREDES` e `RATO_SLOW_DECAY` desligados. Use um diretório de build e um `sdkconfig` próprios deste teste, para não herdar opções antigas, e confira as cinco linhas `RATO` no `sdkconfig` gerado antes de compilar. Guarde o log da compilação em `teste-v3/resultados/build.log`.
4. **Se a compilação der erro ou aviso novo:** é a primeira vez que este código passa pelo ESP-IDF. Corrija só o necessário para compilar, me mostre o diff, espere a aprovação e anote em `MUDANCAS.md` (regra 9). Não commite. Rode os testes de host de novo.
5. **Gravar.** Dê-me estes passos, um por mensagem, esperando o meu `ok` em cada um:
   1. "Desligue a bateria do robô (chave ou conector). Confirme que nenhuma luz da placa está acesa."
   2. "Ligue o cabo USB de dados na porta da placa marcada UART e no computador."
   Descubra a porta serial, grave e leia o boot pelo serial por 10 s. Confira no boot: `Compile time` com a data e a hora da compilação que você acabou de fazer; `tof: esquerdo pronto em 0x30`, `frontal ... 0x31`, `direito ... 0x32`; IMU e INA219 sem erro; e a DIP lida. Guarde em `teste-v3/resultados/boot.log` e `flash.log`. Se um ToF não ficar pronto, me avise qual e siga (o H1 detalha).
6. **Voltar para a bateria.** Um por mensagem, esperando `ok`:
   1. "Tire o cabo USB do robô."
   2. "Só agora ligue a bateria. Uma luz da placa deve acender."

## Etapa 2: ponte e primeiro contato

1. Suba `python ponte.py` (de dentro de `teste-v3/`, com o Python que tem o `bleak`) em segundo plano e deixe rodando até o fim. Espere `teste-v3/resultados/estado.txt` dizer `"conectado": true` (até 40 s). Se não conectar, me peça para conferir: bateria ligada, Bluetooth do computador ligado, robô a menos de 3 m.
2. `python t.py cmd "saude"`: têm de vir as linhas `diag: saude 1/2` e `2/2`. Sem resposta, o firmware gravado não é o da versão 3 com `RATO_LOG_RETA`: volte à Etapa 1.
3. Grave `teste-v3/resultados/versao-firmware.txt`: branch, `git log -5 --oneline`, `git status --short`, a data e hora da compilação e as opções `CONFIG_RATO_*` do build.

## Etapa 3: como rodar cada teste

Para cada teste, nesta ordem exata:

1. `python t.py preparo <ID>`: leia o PREPARO, o PASSA SE e as perguntas.
2. Mande-me a mensagem no formato da regra 8. Espere o meu `ok`.
3. Rode `python t.py <ID> --auto` (em segundo plano se o teste mexe os motores; use limite de tempo de 6 minutos: o H4 leva 3 min e uma corrida até 2,5 min). O `--auto` não pergunta nada: manda o comando, espera o robô, confere e imprime `CONFERÊNCIA AUTOMÁTICA`, as linhas `PERGUNTAR:` e o `RESULTADO`. O log do teste fica em `teste-v3/resultados/<ID>_t<N>.log` e o resumo em `RESULTADOS.md`.
4. Se houver linhas `PERGUNTAR:`, faça-me as perguntas UMA de cada vez, em linguagem simples, dizendo como medir ou onde olhar. Depois registre: `python t.py responder <ID> chave=valor ...` (as chaves são as que o `preparo` mostra entre parênteses; `s`/`n` para sim ou não, número em mm, ou o nome da célula).
5. Diga-me o resultado em uma ou duas frases simples.
6. Registre a sua análise quando houver algo a dizer: `python t.py nota <ID> "<texto>"`.
7. Testes marcados "faça 3 vezes" (B5d, B5e, C4 a C7, D1, D2): repita os passos 1 a 6 três vezes, pedindo para eu reposicionar o robô a cada vez.

Regras de julgamento:

- `PASSOU`: siga.
- `CONFERIR`: um valor fora da meta que não é defeito certo. Anote com `nota` o que você acha e siga.
- `FALHOU`: leia o `.log` do teste e as linhas ao redor no `log_robo.txt`. Diga-me a causa provável em linguagem simples. Peça para repetir UMA vez, conferindo comigo cada item do preparo. Se falhar de novo, aplique a regra de parada do bloco.
- "O ROBÔ REINICIOU SOZINHO" ou "a ponte perdeu a conexão": espere reconectar, rode `python t.py cmd "diag" 12`, registre o `reset=` e me diga. Dois reinícios sozinhos: pare tudo.
- Erro de preparo meu (robô torto, mão na frente do sensor, robô girou na mão): não é falha do robô. Explique o que deu errado, corrija a instrução e repita.

## Etapa 4: a bateria

Rode `python t.py` para ver a lista e o que já foi feito. Antes de cada bloco: `python t.py portao`. Se o portão der `FALHOU`: `python t.py reiniciar` e portão de novo; se passar, registre a hora com `nota` e siga; se falhar de novo, rode o H1, me mostre a linha `diag: fim:` em palavras simples e pare.

| Bloco | Testes, na ordem | Onde | Regra de parada |
|:--|:--|:--|:--|
| H: hardware | H1, H2, H3, H4, H5, H6, H7, H8 | robô APOIADO na mesa | Um teste falhou duas vezes: pare a bateria inteira. É defeito de montagem (sensor, fio, roda, encoder, bateria) |
| A: no ar | A1, A2, A3, A4, A5 | robô APOIADO e seguro firme | Falhou duas vezes sem ser erro de preparo: pare. O robô não vai para o chão |
| B: chão livre | B1, B2, os 12 `B3-*`, B4d, B4e, B5d x3, B5e x3 | chão liso, fora do labirinto | B1 ou B2 fora da faixa na régua: pare antes do bloco C. B3 em `CONFERIR` e curva lenta: anote e siga |
| C: labirinto | C1, C2, C3, C4 x3, C5 x3, C6 x3, C7 x3, C8 | pista, uma manobra por vez | Uma curva (C4 a C7) encostou ou falhou nas 3 vezes: não faça o bloco D |
| D: corridas | D1 x3, D2 x3, D3, D4, D5, D6, D7 | pista, corrida completa | Bateu forte ou prendeu em 2 corridas seguidas: pare o bloco |

Pontos de atenção por bloco:

- **H1:** a linha `firmware gravado` tem de trazer a data e a hora da compilação da Etapa 1. A linha `diag: fim:` lista os problemas; traduza cada um para mim e diga o que fazer (a tabela está na seção 5 do `LOGS_E_MEDIDAS.md`).
- **H3:** eu mexo nos cabos dos três ToF com um palito de PLÁSTICO durante 60 s. Dê-me a ordem (esquerdo, da frente, direito, ~15 s cada) e avise quando faltar pouco. Uma linha `tof: ... PAROU de responder` diz qual sensor e a causa provável (`0x29 responde` = o sensor reiniciou sozinho: alimentação ou XSHUT; `mudo` = fio de dados ou alimentação): é o achado principal, registre com `nota` e rode `python t.py cmd "tofrec"`.
- **H4:** antes, peça-me para desligar a bateria, esperar 10 s e ligar; espere o `estado.txt` voltar a conectado e rode em menos de 1 minuto. São 3 minutos sem ninguém encostar na mesa.
- **H5:** eu giro cada roda à mão uma volta para a frente em 25 s. Explique "para a frente": a parte de cima da roda vai em direção à frente do robô. Peça para marcar o pneu com caneta antes.
- **H6 e H7:** as rodas giram sozinhas. Avise antes.
- **A2, A3, A4:** robô seguro firme. No A4 a manobra TEM de falhar (`curva travada` duas vezes): explique isso antes, para eu não me assustar.
- **A5, D5:** a largada tem de ser recusada. Se as rodas girarem, mande `parar` e pare a bateria.
- **B1 e B2:** fita no chão sob as duas rodas e marca no meio. Depois me peça a distância da fita até o eixo das rodas, em mm, e o desvio lateral.
- **B3:** 12 medidas (`B3-E50` ... `B3-D200`). A caixa fica APOIADA, paralela ao sensor, à distância medida da JANELA do sensor. Conduza um sensor por vez, as quatro distâncias em sequência, para eu mexer pouco. No fim, monte a tabela (real, lido, erro) e registre com `nota`.
- **C4 a C7:** peça para eu OLHAR o robô durante a curva e, se encostar, dizer qual canto do robô e qual parede. Se eu puder filmar, melhor. No C4 que falhar, leia as linhas `inicio do arco`, `angulo a cada 100 ms` e `tof: depois da curva` e explique.
- **C8:** eu seguro o robô por 1 s quando ele COMEÇA a girar e solto. Avise que você vai dizer "agora" assim que mandar o comando.
- **Bloco D:** confira comigo a via 3 antes de cada teste (a tabela do `t.py preparo` diz qual) e rode `python t.py reiniciar` sempre que ela mudar. O `t.py` manda `parar` sozinho no D6 e no D7. Numa corrida que falha: regra 7. Passos esperados do D1: D4, C4, B4, A4, A3, A2, B2, B3, C3, C2, C1, B1, A1. Do D2: D1, C1, B1, A1, ré para B1 e C1, C2, C3, B3, A3, A4. Um passo fora da ordem: mostre o mm de cada sensor e o `mapa NLSO` daquele passo e diga qual parede foi lida diferente da pista.

## Etapa 5: quando algo falha de verdade

1. Junte as evidências: o `.log` do teste, as linhas `saude`, a linha `laco` (laço acima de 4 ms ou `erros I2C`/`pulou` diferentes de zero = um sensor falhou durante o movimento) e os avisos `tof: ... PAROU`.
2. Classifique: **hardware** (sensor que cai, roda que prende, encoder, bateria, reinício sozinho), **preparo** (erro meu) ou **firmware** (o robô fez errado com tudo respondendo).
3. Hardware: diga-me exatamente o que olhar no robô (qual sensor, qual fio, qual roda) e pare o bloco. Não tente contornar por software.
4. Firmware: proponha a mudança com arquivo e linha, o valor antigo e o novo, e o teste que deve passar depois. Espere a aprovação. Aplicada: testes de host, anotação em `MUDANCAS.md` (regra 9, sem commit), compilar, gravar (com a troca bateria/USB da Etapa 1), `python t.py reiniciar`, portão, e repita o teste que falhou e os anteriores do mesmo bloco.

## Etapa 6: fechamento

1. Rode `python t.py` e acrescente ao fim do `teste-v3/resultados/RESULTADOS.md`: resumo por bloco (passou, falhou, conferir, pulado), cada falha com a causa provável e a mudança proposta, a tabela do B3, os números do H4 (desvio do giroscópio ao longo dos 3 minutos) e do H6 (as quatro linhas `rodas:`), os contadores do último `saude` e o que falta testar (labirintos 8x4 e 12x4).
2. Pergunte-me se tenho as medidas M1, M2, M3, M5, M6, M8 e M9 do `LOGS_E_MEDIDAS.md` e registre-as. Não mude `kBody` nem a bitola sem a minha aprovação.
3. Confirme que `teste-v3/resultados/` tem: `RESULTADOS.md`, `log_robo.txt`, `ponte.out`, `telemetria.jsonl`, `comandos.txt`, os `<ID>_t<N>.log`, `build.log`, `flash.log`, `boot.log`, `versao-firmware.txt` e, se houve mudança de código, o `MUDANCAS.md`. Compacte a pasta em `teste-v3/resultados-AAAA-MM-DD.zip` e me diga o caminho.
4. Encerre a ponte.

Comece pela Etapa 0 e me diga, em poucas linhas, o que encontrou nesta máquina e o que precisa que eu instale ou confirme antes da Etapa 1.
