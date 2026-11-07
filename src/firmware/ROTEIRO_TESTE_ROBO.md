# Roteiro de teste do firmware no robô

Passo a passo para quem está com o robô testar o **firmware da corrida** e juntar tudo o que a equipe de firmware precisa para achar e corrigir erros.

> **Público:** quem está com o robô montado (placa ESP32-S3, motores, ToF, bateria).
>
> **Diferença para o [`TESTES_HARDWARE.md`](TESTES_HARDWARE.md):** aquele roteiro testa cada peça isolada com o firmware de diagnóstico. Este testa o robô inteiro andando, com o firmware da corrida. Ele usa o diagnóstico só na Fase A, para garantir que o hardware está bom antes de culpar o firmware.

**Regra de ouro:** um teste sem registro não serve para corrigir nada. Em todo passo, guarde **o log, a foto ou o vídeo e o valor anotado na ficha**. Se algo der errado, **não tente consertar na hora**: anote o que aconteceu, salve o log e siga para o próximo passo, se ele não depender do que falhou.

---

## Sumário

0. [Material e preparação](#0-material-e-preparação)
1. [Como gravar o firmware](#1-como-gravar-o-firmware)
2. [Como capturar os logs (leia antes de tudo)](#2-como-capturar-os-logs-leia-antes-de-tudo)
3. [Fase A: hardware com o firmware de diagnóstico](#fase-a-hardware-com-o-firmware-de-diagnóstico)
4. [Fase B: sensores de distância na pista](#fase-b-sensores-de-distância-na-pista)
5. [Fase C: firmware da corrida, robô suspenso](#fase-c-firmware-da-corrida-robô-suspenso)
6. [Fase D: reta no chão e calibração do ganho (kp)](#fase-d-reta-no-chão-e-calibração-do-ganho-kp)
7. [Fase E: curvas](#fase-e-curvas)
8. [Fase F: corrida completa](#fase-f-corrida-completa)
9. [Fase G: testes de falha](#fase-g-testes-de-falha)
10. [Como ler as mensagens do firmware](#10-como-ler-as-mensagens-do-firmware)
11. [O que entregar para a equipe de firmware](#11-o-que-entregar-para-a-equipe-de-firmware)
12. [Ficha de registro](#12-ficha-de-registro)

**Ordem obrigatória:** A → B → C → D → E → F → G. Cada fase supõe que a anterior passou. Se uma fase falhar, registre tudo e pare, a não ser que a ficha diga que dá para seguir.

---

## 0. Material e preparação

### Material

| Item | Para quê |
|:--|:--|
| Robô montado, com a bateria 2S **carregada** (8,2 a 8,4 V) | Tudo |
| Uma segunda bateria carregada, se houver | A tensão muda a velocidade das rodas: compare testes com a bateria parecida |
| Multímetro | Tensão da bateria antes e depois de cada fase |
| Cabo USB **de dados** de pelo menos 1,5 a 2 m | Logs com o robô andando no chão |
| PC com Chrome ou Edge (para gravar) e um monitor serial | Gravar e capturar logs |
| PC com Bluetooth e Python 3 (pasta `bridge/`) | Telemetria das corridas na bateria, sem cabo |
| Celular para filmar | **Toda** corrida no chão é filmada, de cima se possível |
| Régua de 30 cm e trena | Distâncias dos ToF e desvio lateral |
| Suporte para deixar o robô **suspenso** (rodas fora da mesa) | Fases A e C |
| Pista com paredes e pelo menos 7 peças de parede soltas | Fases B a G |
| Fita crepe e caneta | Marcar o centro das células e a posição de largada |

### Antes de começar

1. **Anote a versão do firmware.**
   - Se for compilar: na pasta do repositório, rode `git log -1 --oneline` e copie a saída (ex.: `a04d911 fix(firmware): ...`). Rode também `git status --short` e anote se houver arquivos alterados.
   - Se for baixar o binário do CI: anote o número da execução do **Actions → Firmware CI** e a branch.
2. **Crie uma pasta para o dia:** `testes-AAAA-MM-DD/`. Tudo vai para ela, com nomes no formato **`<fase><número>_<descrição>.<ext>`** (ex.: `C1_boot.txt`, `D3_kp0.010_rep2.txt`, `F1_corrida.mp4`).
3. **Meça e anote a tensão da bateria** com o multímetro.
4. **Confira as rodas à mão:** gire cada roda com o robô desligado. Elas devem girar livres, sem raspar no chassi. Em 04/11, a roda esquerda quase não girou no chão nem com 85% de potência (`enc E=0..6`). Se ainda raspar ou travar, **anote e foto**: nenhum ajuste de firmware compensa isso.

---

## 1. Como gravar o firmware

São dois firmwares diferentes:

| Firmware | Pasta | Para quê |
|:--|:--|:--|
| **Diagnóstico** | `esp32-diagnostico/` | Fases A e B: console com comandos por peça |
| **Corrida** | `esp32/` | Fases C a G: o robô de verdade |

### Opção 1: binário pronto do CI (sem instalar nada)

Siga as seções 1 e 2 do [`TESTES_HARDWARE.md`](TESTES_HARDWARE.md). Os artefatos são `esp32-diagnostico-esp32s3` (diagnóstico) e `esp32-esp32s3` (corrida). O binário do CI tem **todas as opções desligadas**, então ele não tem o log da reta da Fase D.

### Opção 2: compilar no PC (necessário para a Fase D)

Com o ESP-IDF 5.3 instalado (ver `GUIA_DESENVOLVIMENTO.md`), dentro de `src/firmware/`:

```bash
. ~/esp/esp-idf/export.sh                 # ativa o ESP-IDF no terminal (Linux/macOS)
idf.py -C esp32 set-target esp32s3        # só na primeira vez
idf.py -C esp32 menuconfig                # escolher as opções (abaixo)
idf.py -C esp32 build
idf.py -C esp32 -p /dev/ttyUSB0 flash     # Windows: -p COM5. Ajuste a porta
```

No `menuconfig`, entre em **Rato Borrachudo** e marque com a barra de espaço:

| Opção | Quando ligar | O que faz |
|:--|:--|:--|
| `Logar o controle de reta no fim de cada célula (calibração)` (`RATO_LOG_RETA`) | Fases D, E e F | Uma linha `reta` por célula com os números do controle (seção 10.3). Não muda o movimento |
| `Centralizar pelas paredes laterais na reta (RF-44, experimental)` (`RATO_CENTRALIZAR_PAREDES`) | **Só** na Fase D.6 | Liga a correção pelas paredes. **Muda o movimento** |
| `Fios dos motores trocados` (`RATO_FIOS_MOTORES_TROCADOS`) | Já vem ligada | Não mexa, a menos que a Fase A mostre roda ou encoder ao contrário |
| `Modo bancada` (`RATO_BANCADA`) | **Nunca** no robô | Só para uma placa solta |

Tecle `S` para salvar e `Q` para sair. **Anote na ficha quais opções estavam ligadas em cada teste.**

Para gravar o diagnóstico, troque `esp32` por `esp32-diagnostico` nos comandos.

---

## 2. Como capturar os logs (leia antes de tudo)

O firmware escreve no **serial (115200 baud)** tudo o que acontece: inicialização dos sensores, falhas, motivo do fim da corrida e o log da reta. Sem esse texto, a equipe de firmware não consegue corrigir quase nada.

Na ESP32-S3-DevKitC, use a porta USB marcada **UART**.

### Opção A: `idf.py monitor` (Linux/macOS, ou Windows com o ESP-IDF)

1. Abra o monitor:

   ```bash
   idf.py -C esp32 -p /dev/ttyUSB0 monitor      # Windows: -p COM5
   ```

2. Ligue a gravação em arquivo: **`Ctrl+T` e depois `Ctrl+L`**. Aparece `Logging is enabled into file log.micromouse_firmware.<data>.txt`, e o arquivo fica na pasta onde você rodou o comando.
3. Reinicie a placa para o boot entrar no arquivo: **`Ctrl+T` e depois `Ctrl+R`**.
4. Faça o teste.
5. Feche o arquivo: **`Ctrl+T` e depois `Ctrl+L`** de novo.
6. **Renomeie** o arquivo para o nome do teste (ex.: `C1_boot_1.txt`) e mova-o para a pasta do dia.

Para sair do monitor: `Ctrl+]`. Use um arquivo por teste.

### Opção B: PuTTY (Windows)

1. **Session:** Connection type = Serial, Serial line = `COMx`, Speed = `115200`.
2. **Session → Logging:** marque **All session output**, escolha o arquivo e marque **Always overwrite**. Troque o nome a cada teste.
3. Clique em **Open** e aperte o botão **RST** da placa para pegar o boot.

### Opção C: console do esptool-js (navegador)

Funciona, mas não salva sozinho. No fim de cada teste, selecione todo o texto, copie e cole num `.txt`.

### Telemetria pelo Bluetooth (corridas sem cabo)

Na bateria, sem o cabo, a única informação que sai do robô é a telemetria BLE. Ela inclui o **motivo da falha** no campo `detalhe` do `fim_corrida`. Na pasta `src/firmware/bridge/`:

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python ble_ws_bridge.py --print-only | tee <pasta-do-dia>/F2_telemetria.jsonl
```

Deixe a ponte rodando **antes** de ligar o robô. A primeira linha depois de conectar tem que ser o `hello`.

### Vídeo

- Filme **toda** corrida no chão, de cima e com a pista inteira no quadro.
- Comece a filmar **antes** de apertar o botão e só pare depois do bip final.
- Fale o nome do teste no começo do vídeo (ex.: "D3, kp 0,010, repetição 2").

---

## Fase A: hardware com o firmware de diagnóstico

**Objetivo:** ter certeza de que o hardware está bom. Se uma peça falha aqui, o problema **não é** do firmware da corrida.

**Firmware:** diagnóstico. **Robô:** suspenso, rodas fora da mesa. **Log:** um arquivo para a fase toda (`A_diagnostico.txt`).

Faça os passos em ordem. Os detalhes de cada comando estão no [`TESTES_HARDWARE.md`](TESTES_HARDWARE.md).

| Passo | Comando | Passa se | Se falhar, anote |
|:--|:--|:--|:--|
| A1 | `info` | `esp32s3`, 2 núcleos, 16 MB | A saída inteira |
| A2 | `verificar` | Todos os itens `[ OK ]` | Quais itens falharam |
| A3 | `i2c` | `0x40` (INA219), `0x68` (IMU), `0x30`, `0x31`, `0x32` (ToF), **nada em `0x29`** | A lista de endereços |
| A4 | `tof xshut` | Cada sensor responde sozinho em `0x29`; nada com todos desligados | Qual sensor falhou |
| A5 | `tof 20`, com a mão a ~5 cm de cada sensor, um de cada vez | O lado com a mão mostra `S` e ~50 mm; nenhuma linha com `FALHA` | As linhas com `FALHA` ou `?` |
| A6 | `imu 10`, parado | A média do giro perto de 0 | O desvio médio |
| A7 | `imu 5`, girando o robô 90° à mão | O ângulo final perto de ±90° | O ângulo final |
| A8 | `ina 10` e o multímetro na bateria | A tensão bate com o multímetro (±0,05 V) | Os dois valores |
| A9 | `dip` | Mostra o labirinto e o canto que você escolheu | A saída |
| A10 | `botao`, `led pronto`, `led erro`, `led apagar`, `buzzer pronto`, `buzzer alarme` | Tudo funciona | O que não funcionou |

### A11: sentido das rodas e dos encoders (robô suspenso)

1. `enc zerar`
2. `motor 0.5 0.5 1000`
3. `enc 1`

**Passa se:** as **duas** rodas giram **para frente** e os **dois** encoders contam **positivo**. Se algo vier ao contrário, siga a seção "Sentido da roda esquerda" do `TESTES_HARDWARE.md` e **pare**: o firmware da corrida vai andar errado.

### A12: pulsos por volta

1. `enc zerar`
2. Gire **uma** volta da roda esquerda à mão, devagar, com uma marca de fita na roda.
3. `enc 1`
4. Repita para a direita.

Faça 3 vezes cada roda e anote todos os valores. O firmware usa **285**. Diferença de mais de 5 pulsos: avise.

### A13: comparação das rodas (o teste mais importante para a reta)

Robô **suspenso**:

1. `enc zerar`, depois `motor 0.5 0.5 2000`, depois `enc 1`. Anote E e D.
2. Repita com `motor 0.7 0.7 2000`.
3. Repita cada potência **3 vezes**.

Depois, **com o robô no chão** e segurando-o pela traseira com a mão (as rodas apoiadas, sem deixar andar mais que uns centímetros):

4. `enc zerar`, depois `motor 0.7 0.7 1000`, depois `enc 1`. Anote E e D. Repita 3 vezes.

Na ficha, calcule para cada linha a **razão = maior / menor**.

| Razão (no chão) | O que significa |
|:--|:--|
| até 1,15 | Normal. O controle de reta corrige com folga |
| 1,15 a 1,5 | O controle corrige, mas o robô vai desviar alguns graus por célula |
| acima de 1,5, ou uma roda abaixo de 50 pulsos | **Problema mecânico** (roda raspando, motor fraco, eixo solto). Resolva antes das Fases D a F |

**Não passe de 0.7** no comando `motor` (motores de 6 V; ver o aviso no `TESTES_HARDWARE.md`).

---

## Fase B: sensores de distância na pista

**Objetivo:** saber o que os ToF leem na pista de verdade. O limiar de parede é **90 mm**, e em 04/11 o frontal lia ~40 a 50 mm a mais que o real.

**Firmware:** diagnóstico. **Robô:** no chão, parado, na pista. **Log:** `B_tof.txt`.

### Como ler o `tof`

A marca `?` e o resumo no fim da linha só existem no diagnóstico compilado a partir da branch com a correção das medidas incertas. O binário antigo do CI mostra só os números e `FALHA`.

```
esquerdo  frontal  direito (mm)  paredes E/F/D
      38      612      41       S/-/S
      37     140?      40       S/S/S   incerto: frontal(sigma 140)
   FALHA      615      40       S/-/S   ToF em falha: esquerdo
```

- **Número:** distância em mm. **`9999`:** nada ao alcance (corredor aberto).
- **`140?`:** medida **incerta** (o sensor funcionou, mas não confia na medida: parede escura, brilhante, inclinada, luz forte ou alvo longe). Se for menor que 180 mm, o robô trata como parede possível e não grava no mapa. A partir de 180 mm, vale "sem parede".
- **`FALHA`:** o sensor não respondeu ou não mediu a tempo. Três passos seguidos com `FALHA` levam o robô ao **Erro**.
- **`S/-/S`:** parede (`S`) ou livre (`-`) na esquerda, frente e direita.
- **Fim da linha:** resumo das falhas e das medidas incertas, com o tipo: `sigma`, `wrap` ou `xtalk`.

### Passos

**B1. Célula com 3 paredes.** Robô **centrado** numa célula com paredes à esquerda, à frente e à direita. Use a fita para marcar o centro. Rode `tof 20`.
- Anote a média de E, F e D.
- Meça com a régua a distância real de cada sensor até a parede e anote ao lado.
- **Passa se:** as 20 linhas mostram `S/S/S`, sem `FALHA` nem `?`.
- **A média de E e D é o "centro"** do RF-44 (`centerMm`). Anote com destaque.

**B2. Robô fora do centro.** Desloque o robô **10 mm** para a esquerda e rode `tof 10`. Depois 10 mm para a direita, e `tof 10`. Anote as médias. Elas mostram quanto a leitura muda por mm de deslocamento.

**B3. Célula sem paredes laterais.** Tire as paredes da esquerda e da direita e rode `tof 20`.
- **Passa se:** E e D mostram `-`, com `9999` ou um número acima de 90 sem `?`.
- Anote qualquer `?` e o tipo.

**B4. Distância da frente.** Robô olhando para uma parede a **50, 100, 150 e 200 mm**, medidos com a régua da frente do robô. Rode `tof 10` em cada uma e anote a média do frontal ao lado da distância real. Isso mede a diferença do frontal (os +40 a 50 mm de 04/11).

**B5. Corredor longo (importante).** Coloque o robô na largada, olhando para o **corredor aberto mais longo** da pista. No 12×4 pode passar de 2 m. Rode `tof 50`.
- Conte quantas linhas do frontal deram `9999`, número normal, número com `?` e `FALHA`.
- Anote os tipos (`sigma`, `wrap`, `xtalk`) e as distâncias com `?`.
- **Passa se:** não houver `FALHA` e nenhum `?` abaixo de 180 mm.
- Repita com o robô na metade do corredor.

**B6. Paredes difíceis.** Se a pista tiver paredes de cores ou materiais diferentes, ou luz forte (janela, refletor), repita o B1 nesses lugares e anote.

**B7. Sensor que solta.** Com `tof 50` rodando, encoste levemente no cabo de cada sensor, **sem desconectar**. Se aparecer `FALHA`, o mau contato está ali: anote qual sensor. Em 04/11, o direito falhou às vezes na pista.

---

## Fase C: firmware da corrida, robô suspenso

**Objetivo:** ver o firmware da corrida ligar, largar e se mover sem o risco de bater.

**Firmware:** corrida, com `RATO_LOG_RETA` ligado se possível. **Robô:** suspenso. **Log:** um arquivo por passo.

### C1. Boot (5 vezes seguidas)

Abra o monitor (seção 2) com o arquivo `C1_boot_1.txt` e aperte o **RST**. O log esperado é este, nesta ordem (o texto entre `[]` varia):

```
I (...) tof: esquerdo pronto em 0x30
I (...) tof: frontal pronto em 0x31
I (...) tof: direito pronto em 0x32
I (...) main: mapa de pinos dos motores: [...]
I (...) main: DIP lido no boot: labirinto [4x4], partida pela [esquerda]
I (...) main: aguardando o botao de largada
```

- **Passa se:** as 6 linhas aparecem nas 5 vezes.
- **Anote** qualquer `tentativa 1 de 3 falhou`, `nao respondeu` ou aviso do MPU-6050 (`WHO_AM_I`), e em qual das 5 vezes apareceu.
- Confira se o labirinto e o canto batem com o DIP.

### C2. Largada suspensa

1. Com o log aberto (`C2_suspenso.txt`), aperte o **botão de largada**.
2. **Esperado:**
   - o LED de pronto acende e tocam **2 bips**;
   - as rodas giram para frente, param, giram de novo (uma "célula" por vez) e às vezes giram em sentidos opostos (as curvas);
   - com o log da reta ligado, aparece uma linha `reta` por célula.
3. Como o robô está no ar, os ToF não veem paredes, e as curvas não terminam pelo giroscópio, porque o robô não gira. O comportamento normal aqui é a curva terminar **pelos encoders** em menos de 3 s.
4. Deixe rodar até parar: ou chega ao "objetivo" (**3 tons subindo**) ou vai ao **Erro** (LED de erro e **3 bips**).

**Anote:** como terminou, o motivo (seção 10.2) e as linhas `reta`.

**Passa se:**
- nenhuma linha `reta` mostra `TEMPO ESGOTADO`;
- `saturou` fica em `0` ou perto de 0;
- os pulsos E e D de cada célula ficam perto de ~481.

---

## Fase D: reta no chão e calibração do ganho (kp)

**Objetivo:** ver se o robô anda reto e escolher o ganho do controle de reta (`kp`). Hoje o kp é **0,005**, um valor estimado, não medido.

**Firmware:** corrida, compilado com `RATO_LOG_RETA` (seção 1, opção 2). **Robô:** no chão, **com o cabo USB** (alguém segura o cabo no alto, sem puxar o robô). **Vídeo:** sempre.

### D0. Montar a pista em L

O robô sempre começa num canto de baixo, **virado para cima**, e o objetivo é o canto oposto, em cima. Para ele andar em linha reta, monte um corredor em L.

Labirinto **4×4** com o DIP em 4×4 e a partida pela esquerda (visto de cima, linha 0 em cima):

```
        col 0   col 1   col 2   col 3
       +-------+-------+-------+-------+
lin 0  |  ->      ->      ->     OBJ   |
       +       +-------+-------+-------+   <- paredes ao sul de (0,1), (0,2), (0,3)
lin 1  |   ^   |                       |
       +       +                       +
lin 2  |   ^   |    (região fechada)   |   <- paredes a leste de (1,0), (2,0), (3,0)
       +       +                       +
lin 3  | LARG. |                       |
       +-------+-------+-------+-------+
```

- O robô anda **3 células para cima**, faz **1 curva à direita** e anda **3 células para a direita**.
- Com o **8×4** (DIP em 8×4), a parte de cima fica com **7 células** seguidas: melhor para ver o desvio acumulado. Use se a pista permitir.
- Marque com fita o **centro** da célula de largada e posicione o robô sempre ali, **alinhado** com as paredes.

### D1. Primeira corrida com o kp atual (0,005)

1. Meça e anote a tensão da bateria.
2. Abra o log (`D1_kp0.005_rep1.txt`) e comece a filmar.
3. Aperte o botão de largada.
4. A cada célula, aparece uma linha como esta:

   ```
   I (...) reta: kp=0.0050 enc E=482 D=470 erro final=12 max=15 corr max=0.075 saturou=0/520 parede=0.0 ok
   ```

5. No fim da **primeira reta** (antes da curva), meça com a régua a **distância do centro do robô ao centro do corredor** e anote se o robô encostou numa parede.
6. Repita **3 vezes**: `rep1`, `rep2` e `rep3`.

### D2 a D5. Subir o kp

Para cada valor da tabela, faça como em D1 (3 repetições):

| Passo | kp |
|:--|:--|
| D2 | 0,0075 |
| D3 | 0,010 |
| D4 | 0,015 |
| D5 | 0,020 (**só se D4 estiver limpo**) |

Para trocar o kp:

1. Abra `include/domain/RobotParameters.hpp` e ache a linha `inline constexpr PidGains kStraightGains{0.005, 0.0, 0.0};`.
2. Troque **só o primeiro número**.
3. `idf.py -C esp32 build` e `idf.py -C esp32 -p <porta> flash`.
4. Confira na linha `reta` que o `kp=` mudou.

**Pare de subir** assim que aparecer qualquer sinal de oscilação ou de saturação (abaixo).

### Como reconhecer os problemas na linha `reta`

| Sinal | Significado | O que fazer |
|:--|:--|:--|
| `saturou=0` e `max` perto de `erro final` | Controle convergiu sem saturar | Bom. Pode tentar o próximo kp |
| `saturou` acima de ~5% dos passos (ex.: `30/520`), ou `corr max=0.200` | **Saturação**: o controle pediu mais do que o limite. O erro que satura é 0,20 / kp: 40 pulsos com kp 0,005, 20 com 0,010 | Se acontecer já com o kp 0,005, o problema é a **roda** (volte à A13). Se só com kp alto, volte ao kp anterior |
| `max` bem maior que o `erro final` (ex.: `max=30`, `erro final=3`), robô "serpenteando" no vídeo, motor "cantando" | **Oscilação**: ganho alto demais | Volte ao kp anterior |
| `erro final` grande (acima de ~20) e do mesmo sinal em todas as células | Sobra do controle: o robô desvia sempre para o mesmo lado | Normal com kp baixo. Subir o kp diminui |
| `erro final` muda de sinal de uma célula para outra sem padrão | Ruído ou roda patinando | Anote e filme |
| `TEMPO ESGOTADO` | A célula não terminou em 3 s | Ver a seção 10.2 |
| `enc` de uma roda muito menor que o da outra (ex.: `E=50 D=480`) | Roda travando | **Mecânica**. Pare a Fase D |

**Escolha** o maior kp que tenha `saturou=0`, nenhuma oscilação e o menor desvio lateral nas 3 repetições. Anote na ficha e **avise a equipe de firmware** do valor, junto com os logs.

### D6. Centralização pelas paredes (RF-44, opcional, só depois do D5)

Esta parte é experimental. Os passos detalhados estão em [`docs/rf44-centralizacao.md`](../../docs/rf44-centralizacao.md), seção "Na pista". Em resumo:

1. Ponha a média de E e D do B1 no **primeiro número** de `kWallCentering` em `RobotParameters.hpp`.
2. Compile com `RATO_CENTRALIZAR_PAREDES` **e** `RATO_LOG_RETA` ligados.
3. Repita a pista em L com o kp escolhido, largando **5 a 10 mm fora do centro**. Na linha `reta`, o campo `parede=` mostra o termo das paredes.
4. Compare o desvio lateral no fim da reta com e sem a opção.

---

## Fase E: curvas

**Objetivo:** ver se as curvas de 90° e a meia-volta saem certas. Não há log do ângulo, então a evidência é o **vídeo** e a **posição** do robô depois da curva.

**Firmware:** corrida, com o kp escolhido. **Robô:** no chão, com cabo.

1. **E1:** use a pista em L da Fase D. Depois da curva, na primeira célula da reta de cima, pare o vídeo e anote:
   - se o robô ficou **alinhado** com o corredor (ângulo aproximado, olhando de cima);
   - se ele encostou em alguma parede na reta seguinte.
2. **E2:** repita com a partida pela **direita** (mude a via 3 do DIP e espelhe a pista). A curva passa a ser **à esquerda**.
3. **E3, meia-volta:** monte um beco sem saída de 1 célula logo na frente da largada: paredes ao **norte** e a **leste** da célula (2,0) (a oeste já é a borda). Deixe **aberto** o leste da largada (3,0). O robô deve entrar no beco, ver as paredes, dar meia-volta e sair pela largada. Filme.

**Falhas comuns:** curva com `TEMPO ESGOTADO` (seção 10.2), robô que gira demais ou de menos (anote o ângulo estimado), robô que gira no lugar e não para.

---

## Fase F: corrida completa

**Firmware:** corrida, com o kp escolhido e o RF-44 **desligado** (a não ser que a D6 tenha ido bem). **Robô:** no chão.

### F1. Com o cabo

1. Monte um labirinto 4×4 de verdade (não o L), de preferência com um beco sem saída e mais de um caminho.
2. **Desenhe o labirinto** num papel e tire foto de cima. Isso é essencial para comparar com o mapa que o robô montou.
3. Log `F1_corrida.txt`, vídeo e botão.
4. Anote o resultado (objetivo ou Erro), o tempo e o motivo, se houver.

### F2. Na bateria, sem cabo (como na competição)

1. Ponte BLE rodando com a saída salva (seção 2).
2. Mesmo labirinto do F1. Vídeo e botão.
3. No fim, confira a última linha do `.jsonl`: `"tipo":"fim_corrida"`, com `"resultado"` e, se falhou, `"detalhe"`.
4. Repita **3 vezes**. Se o painel web estiver no ar, tire print do mapa no fim.

**Passa se:** chega ao objetivo (3 tons subindo) nas 3 vezes, e o mapa da telemetria bate com o desenho.

Depois de chegar ao objetivo, o robô volta ao **Aguardando** e larga de novo no próximo toque do botão. Depois de um **Erro**, ele fica parado até o RST.

---

## Fase G: testes de falha

**Objetivo:** confirmar que o robô **para e avisa** quando algo dá errado, em vez de andar às cegas. Em cada passo, o esperado é: **LED de erro, 3 bips** e o motivo no log ou no `detalhe`.

| Passo | Como provocar | Motivo esperado (seção 10.2) |
|:--|:--|:--|
| G1 | Robô desligado: solte o conector de **um** ToF, ligue e aperte o botão | `auto-teste reprovou: ToF [lado]`, e o robô não sai do lugar |
| G2 | DIP com as vias 1 e 2 **fechadas**, ligar | Log `DIP em combinacao proibida`, e o robô não larga |
| G3 | Na corrida, **segure uma roda** com a mão na metade de uma célula por 3 s | `andar 1 celula nao terminou em 3 s: enc E=... D=... pot E=... D=...` |
| G4 | Monte a largada **fechada** (parede na frente e à direita) | `sem caminho ate o objetivo em (3,0), mesmo lendo de novo. tof E=... F=... D=...` |
| G5 | Pista em L, com uma folha de papel **preto fosco** cobrindo a parede do fim da primeira reta. Antes, com o diagnóstico e o robô a 1 célula da folha, rode `tof 20` e anote o frontal | Com medida válida ou `?`: o robô **não** vai ao Erro por `falha de sensor`. Com `?` 3 vezes seguidas, ele assume parede e faz a curva. **Se o frontal mostrar `9999` com a folha na frente, é grave** (o robô bateria): anote e avise |

**Não** teste a bateria fraca descarregando a bateria até o fim: isso danifica a 2S. O limite é **6,6 V** por 5 leituras seguidas.

---

## 10. Como ler as mensagens do firmware

### 10.1 Linhas de log no serial

| Linha (tag: texto) | Significa |
|:--|:--|
| `tof: [lado] pronto em 0x3N` | O sensor iniciou e mudou de endereço. Tem que aparecer para os 3 |
| `tof: [lado]: tentativa N de 3 falhou` | O sensor não iniciou de primeira. Algumas vezes é normal. Nas 3 tentativas, vira `nao respondeu` |
| `tof: [lado] nao respondeu (XSHUT=GPIOnn)` | O sensor não iniciou: o robô não larga (auto-teste) |
| `tof: ToF em falha: [lados]` | Numa leitura, um sensor não respondeu ou não mediu a tempo. 3 leituras seguidas levam ao Erro |
| `tof: incerto: [lado](sigma 140)` | Medida incerta (não é falha). `sigma`, `wrap` ou `xtalk` é o tipo, e o número é a distância lida em mm |
| `main: DIP lido no boot: labirinto CxL, partida pela X` | Configuração lida do DIP. Confira com a chave |
| `main: aguardando o botao de largada` | Pronto para largar |
| `main: centralizacao pelas paredes (RF-44) LIGADA` | O firmware foi compilado com o RF-44: confira se era a intenção |
| `reta: kp=... enc E=... D=...` | Fim de uma célula, com os números do controle (10.3) |
| `mpu6050: WHO_AM_I = 0x.. (...): aceito como MPU-6050` | IMU compatível: normal |
| `E (...) main: ...` | Erro. O texto é o motivo do fim da corrida (10.2) |

### 10.2 Motivo do fim da corrida

O motivo aparece no serial (`E (...) main: ...`) e no `"detalhe"` do `fim_corrida` da telemetria.

| Motivo | O que aconteceu | O que juntar para o firmware |
|:--|:--|:--|
| `auto-teste reprovou: IMU INA219 ToF esquerdo ToF frontal ToF direito` (só os que falharam) | Um sensor não iniciou no boot | O log do boot inteiro e o `i2c` do diagnóstico |
| `falha de sensor por 3 passos: [IMU] [INA219] ToF em falha: [lados]` | Um sensor parou de responder no meio da corrida | O log, a célula onde parou (vídeo) e o teste B7 |
| `bateria fraca: X.XX V` | A tensão ficou abaixo de 6,6 V | A tensão no multímetro logo depois |
| `sem caminho ate o objetivo em (L,C), mesmo lendo de novo. tof E=.. F=.. D=.. [resumo]` | Com as paredes que leu, o robô não acha caminho. (L,C) é linha e coluna, com a linha 0 em cima e a coluna 0 à esquerda | Foto do labirinto, o vídeo, as leituras `tof` daquela célula (diagnóstico, Fase B) |
| `andar 1 celula nao terminou em 3 s: enc E=.. D=.. pot E=.. D=.. tof ...` | Andou menos de uma célula em 3 s: roda travada, patinando ou encoder sem contar | O vídeo e o A13. Se um `enc` está perto de 0 e o `pot` dele está alto: roda travada ou encoder solto |
| `curva de 90 graus nao terminou em 3 s: ...` / `meia-volta nao terminou em 3 s: ...` | Nem o giroscópio nem os encoders confirmaram a curva | O vídeo, o A7 (IMU) e o A11 |
| `limite de passos sem chegar ao objetivo. [resumo]` | Deu mais passos que 4 × o número de células sem chegar | Vídeo inteiro, foto do labirinto e o log completo |

### 10.3 A linha `reta`

```
reta: kp=0.0050 enc E=482 D=470 erro final=12 max=15 corr max=0.075 saturou=0/520 parede=0.0 ok
```

| Campo | Significa |
|:--|:--|
| `kp` | Ganho em uso. Confira se é o que você gravou |
| `enc E= D=` | Pulsos de cada roda nesta célula (~481 por célula) |
| `erro final` | Diferença esquerda − direita no fim, em pulsos. Positivo: a esquerda andou mais, então o robô virou para a direita. 1 pulso ≈ 0,375 mm ≈ 0,24° de rumo |
| `max` | Maior diferença durante a célula |
| `corr max` | Maior correção aplicada a uma roda (o limite é 0,200) |
| `saturou=N/T` | Em N dos T passos de 1 ms, a correção ficou no limite |
| `parede` | Termo da centralização pelas paredes (0 com o RF-44 desligado) |
| `ok` / `TEMPO ESGOTADO` | A célula terminou ou estourou os 3 s |

### 10.4 LEDs e buzzer

| Sinal | Significa |
|:--|:--|
| LED de pronto aceso + **2 bips** | Largou: o auto-teste passou |
| **3 tons subindo** | Chegou ao objetivo |
| LED de erro aceso + **3 bips** | Erro: o robô parou. Só volta com o RST |
| Nada ao apertar o botão | Ver se o log mostra `aguardando o botao de largada`; testar `botao` no diagnóstico |

---

## 11. O que entregar para a equipe de firmware

Ao fim do dia, compacte a pasta `testes-AAAA-MM-DD/` e envie com:

- [ ] **Versão do firmware:** saída do `git log -1 --oneline`, ou o número da execução do CI.
- [ ] **Opções do menuconfig** ligadas em cada teste, e o kp de cada teste da Fase D.
- [ ] **A ficha (seção 12) preenchida.** Pode ser foto do papel.
- [ ] **Todos os logs `.txt` do serial**, com os nomes do padrão. Não corte nada, nem as partes "sem nada de interessante".
- [ ] **Todos os `.jsonl` da telemetria.**
- [ ] **Os vídeos**, com o nome do teste falado no começo.
- [ ] **Foto ou desenho de cada labirinto** usado.
- [ ] **A tensão da bateria** antes e depois de cada fase.
- [ ] **Para cada falha:** o passo, o que você esperava, o que aconteceu, e se ela se repete (quantas vezes em quantas tentativas).

Uma falha que aconteceu **uma vez** também é importante: anote. Saber "1 em 5" é o que separa um mau contato de um erro de lógica.

---

## 12. Ficha de registro

Copie para um papel ou planilha.

**Cabeçalho**

| Campo | Valor |
|:--|:--|
| Data | |
| Quem testou | |
| Versão do firmware (commit ou CI) | |
| Opções (`RATO_LOG_RETA`, `RATO_CENTRALIZAR_PAREDES`, outras) | |
| Bateria no início (V) | |

**Fase A**

| Passo | Passou? | Valores / observação |
|:--|:--:|:--|
| A1 a A10 | | |
| A11 sentido rodas/encoders | | |
| A12 pulsos/volta (E: 3 valores; D: 3 valores) | | |
| A13 suspenso 0.5 (E, D, razão) ×3 | | |
| A13 suspenso 0.7 (E, D, razão) ×3 | | |
| A13 chão 0.7 (E, D, razão) ×3 | | |

**Fase B**

| Passo | E (mm) | F (mm) | D (mm) | Real (régua) | `?` / `FALHA` | Observação |
|:--|:--:|:--:|:--:|:--:|:--:|:--|
| B1 centrado | | | | | | **centro = (E+D)/2 =** |
| B2 10 mm à esq. | | | | | | |
| B2 10 mm à dir. | | | | | | |
| B3 sem laterais | | | | | | |
| B4 frente 50 / 100 / 150 / 200 | | | | | | |
| B5 corredor longo (contagens) | | | | | | |
| B6 paredes difíceis | | | | | | |
| B7 cabo de cada sensor | | | | | | |

**Fase C**

| Passo | Passou? | Observação |
|:--|:--:|:--|
| C1 boot ×5 (quantas OK) | | |
| C2 suspenso: como terminou, motivo | | |

**Fase D** (uma linha por repetição)

| Passo | kp | Rep. | Bateria (V) | `erro final` (células 1, 2, 3) | `max` | `saturou` | Desvio lateral (mm) | Encostou? | Oscilou? |
|:--|:--:|:--:|:--:|:--|:--:|:--:|:--:|:--:|:--:|
| D1 | 0,005 | 1 | | | | | | | |
| D1 | 0,005 | 2 | | | | | | | |
| D1 | 0,005 | 3 | | | | | | | |
| D2 | 0,0075 | 1 | | | | | | | |
| ... | | | | | | | | | |
| **kp escolhido:** | | | | | | | | | |

**Fases E, F e G**

| Passo | Resultado (objetivo / Erro / outro) | Motivo (`detalhe`) | Tempo | Observação |
|:--|:--|:--|:--:|:--|
| E1 curva à direita | | | | ângulo após a curva: |
| E2 curva à esquerda | | | | |
| E3 meia-volta | | | | |
| F1 com cabo | | | | |
| F2 bateria 1 | | | | |
| F2 bateria 2 | | | | |
| F2 bateria 3 | | | | |
| G1 a G5 | | | | |
