# Auditoria do firmware v3: 15/11/2026

Branch `feat/controle-motores-tensao`, HEAD `038ea1c`. Auditoria feita sem o robô: leitura do código, compilação e testes no computador. Nenhum arquivo do repositório foi editado: tudo o que foi criado está em `auditoria/`. Houve um desvio, descrito em [4.5](#45-desvio-durante-a-auditoria).

## 1. Resumo

- **Integridade:** o código está íntegro. Dos 165 arquivos da lista de referência, os 165 batem com a versão 3 (SHA-256 com fim de linha LF). Nenhum arquivo está como `BASE`, `ALTERADO`, `FALTANDO` ou `NOVO`.
- **Terceiros:** ninguém mexeu no código depois de `03c51e0`. Os 10 commits seguintes são do próprio dono do repositório, de 15/11, e são exatamente a versão 3 dividida em commits, mais a pasta `teste/`. Local e remoto estão iguais.
- **Compilação:** compila. Os testes de host passam: **237 de 237**, com `-Werror` e nenhum aviso. Com o ESP-IDF instalado (v5.3, e não a 5.3.3 pedida), o firmware de calibração (`RATO_LOG_RETA=y`) sai **sem nenhum aviso**. O de competição (`RATO_LOG_RETA` desligado) sai com 1 aviso, que já existia antes da v3. O `esp32-diagnostico` também compila sem aviso. Os três scripts Python passam no `py_compile`.
- **Problemas:** nenhum crítico e nenhum alto. Há **2 médios** e **7 baixos**, explicados na seção 5. Os médios são estes:
  - um `parar` pode se perder se chegar logo antes de um comando de teste começar;
  - um comando de teste mandado durante a corrida roda sozinho logo depois de uma corrida com SUCESSO.
- **Ferramentas de teste:** as cerca de 45 verificações de texto do `t.py` (~35 expressões regulares e 9 buscas com `has()`) batem com os `ESP_LOG*` do firmware, e todas as tags passam pelo filtro do BLE.
- **Pode ir para o robô?** Sim, para a bateria de testes. Nenhum achado impede compilar, quebra a corrida ou põe o robô em risco no roteiro do `t.py`. Recomendo corrigir os dois médios antes do bloco D, porque os dois mexem nos motores sem confirmação.

## 2. Mudanças de terceiros

`git fetch --all` feito. A branch local e `origin/feat/controle-motores-tensao` apontam para o mesmo commit (`038ea1c`). Não há commit remoto que falte aqui, nem commit local que não tenha sido enviado.

O `03c51e0` existe no histórico. Autor: oki (`gustavooki.dev@gmail.com`), em 11/11/2026 16:18. Ele mexe só em `RobotParameters.hpp` e no teste dele (roda de 32 mm).

| Commit | Autor | Data | O que mudou | Risco para o firmware |
|:--|:--|:--|:--|:--|
| `f6c5469` chore(firmware) | samuelncaetano | 15/11 10:35 | Permissão de 61 arquivos de 755 para 644 (só o modo, sem conteúdo) | nenhum |
| `1f5d844` feat(firmware) | samuelncaetano | 15/11 10:35 | `IdfRegisterBus` conta falhas de I²C por endereço; `esp_timer` no `REQUIRES` | nenhum (é a v3) |
| `31cce02` feat(firmware) | samuelncaetano | 15/11 10:35 | `Ina219` conta leituras que falharam | nenhum (é a v3) |
| `46b3f2e` feat(firmware) | samuelncaetano | 15/11 10:35 | `Mpu6050::readAll()`, `powerManagement()` e contador | nenhum (é a v3) |
| `12a2aa9` feat(firmware) | samuelncaetano | 15/11 10:35 | BLE conta os pedaços de mensagem recusados | nenhum (é a v3) |
| `0626148` fix(firmware) | samuelncaetano | 15/11 10:35 | ToF: silêncio de 0,5 s, reinício pelo XSHUT, `health()` | nenhum (é a v3) |
| `84c22c3` feat(firmware) | samuelncaetano | 15/11 10:35 | Desconto do desvio do giroscópio, `wheelTest`, `wheelSweep`, `encoderWatch`, linha `laco` | nenhum (é a v3) |
| `e05e484` feat(firmware) | samuelncaetano | 15/11 10:35 | `main.cpp` com os comandos de diagnóstico; `esp_app_format` no `REQUIRES` | nenhum (é a v3) |
| `246beb3` docs(firmware) | samuelncaetano | 15/11 10:35 | `LOGS_E_MEDIDAS.md` | nenhum |
| `038ea1c` test | samuelncaetano | 15/11 10:35 | Pasta `teste/` (as ferramentas da `teste-v3`) | nenhum |

- **Detalhe completo:** `auditoria/etapa1-log.txt` tem o hash, o autor, o e-mail, as datas e os arquivos de cada commit.
- **Mudanças sem commit:** nenhuma (`git status` limpo). O prompt esperava os 16 arquivos da v3 como modificados e a pasta `teste-v3/` sem rastreio. Os dois já foram commitados nos 10 commits acima, e a pasta entrou no repositório como **`teste/`**, não `teste-v3/`. Os 18 arquivos de conteúdo dos commits são os 16 da v3 mais os 2 do `03c51e0`, que no início estavam só no remoto e entraram por rebase.
- **`src/backend`, `src/frontend`, `docs` e a raiz:** nenhuma mudança depois de `03c51e0` (`git diff --stat 03c51e0 HEAD -- . ':!src/firmware' ':!teste'` vazio). O protocolo de telemetria (`ProtocolV1.*`) não mudou.
- **Outras branches:** nenhuma das branches remotas tem commit depois de 08/11, fora esta.

## 3. Integridade da versão 3

Script: `auditoria/classificar.py`, com os hashes de referência em `auditoria/hashes-v3.txt` e `auditoria/hashes-base-03c51e0.txt`. Cada arquivo é normalizado de CRLF para LF antes do SHA-256. O script considera os arquivos rastreados e os não rastreados não ignorados de `src/firmware` e `teste/`, e trata `teste/` como `teste-v3/`. Saída em `auditoria/etapa2-classificacao.txt`.

| Classe | Quantidade |
|:--|--:|
| `V3` | 165 |
| `BASE` | 0 |
| `ALTERADO` | 0 |
| `FALTANDO` | 0 |
| `NOVO` | 0 |
| **Total** | **165** |

- **Listas `ALTERADO`, `BASE`, `FALTANDO` e `NOVO`:** vazias.
- **Textos da `teste-v3`:** `PROMPT_CLAUDE_CODE.md`, `LEIA-ME.txt` e `ARQUIVOS_ALTERADOS.txt` também batem com a v3. Não foram editados.
- **Arquivos ignorados pelo git que existem no disco** (fora de `build/` e `managed_components/`): `esp32/sdkconfig`, `esp32/sdkconfig.old` e os dois `dependencies.lock`. São gerados pelo build e ficam fora da classificação, como o prompt pede.
- **Pasta de referência:** não foi preciso usar uma pasta com a v3 original fora do repositório, porque não há `ALTERADO`.

## 4. Compilação e testes

### 4.1 Testes de host

`cmake -S src/firmware -B auditoria/build-host -DCMAKE_BUILD_TYPE=Debug -DFIRMWARE_WARNINGS_AS_ERRORS=ON`

| | Resultado |
|:--|:--|
| Compilação | ok, **0 avisos** (`-Wall -Wextra ... -Werror`) |
| Testes | **237 de 237 passaram**, 0 falhas (`auditoria/ctest.log`) |
| Número de testes | 237, igual ao da v3. Nenhum entrou nem saiu |

### 4.2 Firmware ESP32-S3

**Versão do ESP-IDF:** a instalada em `~/esp/esp-idf` é a **v5.3** (`git describe` = `v5.3`), e não a 5.3.3 pedida. Os builds abaixo foram feitos com a v5.3. Isso não muda nenhum achado de código, mas o comando `diag` vai mostrar `IDF v5.3` se o robô for gravado desta máquina.

Cada build tem diretório e `sdkconfig` próprios em `auditoria/`. As opções vieram de um arquivo de defaults extra e foram conferidas no `sdkconfig` gerado antes de compilar.

| Build | Opções (conferidas) | Resultado |
|:--|:--|:--|
| Calibração (`build-esp32-calibracao`, `sdkconfig.calibracao`) | `RATO_LOG_RETA=y`, `RATO_FIOS_MOTORES_TROCADOS=y`; `BANCADA`, `CENTRALIZAR_PAREDES` e `SLOW_DECAY` desligados | **ok, 0 avisos** no código do projeto. Binário 0xbb550 (76% da partição livre) |
| Competição (`build-esp32-competicao`, `sdkconfig.competicao`) | igual, com `RATO_LOG_RETA` desligado | **ok, 1 aviso**: `main.cpp:120: 'wallLetter' defined but not used [-Wunused-function]`. Já existia em `03c51e0`, onde o único uso também ficava dentro de `#if CONFIG_RATO_LOG_RETA`. Ver o problema 5 |
| `esp32-diagnostico` (`build-diagnostico`, `sdkconfig.diagnostico`) | padrões do projeto (alvo esp32s3) | **ok, 0 avisos** |

- **Arquivos do projeto:** o `sdkconfig` e o `dependencies.lock` de `src/firmware/esp32/` foram conferidos por SHA-256 antes e depois dos builds, e não mudaram.
- **Formatos de `printf`:** os `ESP_LOG*` e os `snprintf` são checados pelo `-Wformat` (o `esp_log_write` tem o atributo `format(printf)`). Zero avisos nos dois builds do firmware principal quer dizer que nenhum especificador `%` está trocado, inclusive os `%lu`.

### 4.3 Python

`py_compile` ok em `teste/t.py`, `teste/ponte.py` e `src/firmware/bridge/ble_ws_bridge.py` (Python 3.14.4, `auditoria/py_compile.log`).

### 4.4 Pilha (medida pelo compilador)

`main.cpp`, os adaptadores e o núcleo foram recompilados com `-fstack-usage`, usando o mesmo comando do build de calibração (saída em `auditoria/stack/*.su`). Maiores quadros: `navigationTask` 1568 B, `pivot` 1408 B, `straight` 1136 B, `runDiagnostics` 704 B, `wheelSweep` 576 B, `mirrorLogToBle` 384 B, `runTofMonitor` 368 B.

O caminho mais fundo é a corrida, numa curva que loga. Ele soma `navigationTask`, `Navigator::step`, `arcTurn`, `pivot`, `logTofAfter`, `esp_log`, `mirrorLogToBle` e o `vsnprintf` do newlib completo (não é o nano; uns 1,5 a 2 KB com ponto flutuante): **cerca de 6 KB dos 12288**. O caminho do `diag` (`navigationTask`, `serviceTestCommands`, `runDiagnostics`, log) fica em cerca de 4,5 KB.

12 KB tem folga de cerca de 2 vezes. É uma estimativa estática: o valor real só sai com `uxTaskGetStackHighWaterMark` no robô (ver seção 7).

### 4.5 Desvio durante a auditoria

O build do `esp32-diagnostico` **reescreveu `src/firmware/esp32-diagnostico/dependencies.lock`**. É um arquivo ignorado pelo git e gerado pelo gerenciador de componentes do ESP-IDF, mas fica dentro do projeto. O lock passou a dizer `esp-nimble-cpp 2.6.0`. O componente que já estava baixado em `managed_components/` era o 2.6.0 desde 07/11 e não foi tocado. Não houve efeito no código nem no git (`git status` limpo). Não guardei a versão anterior do lock: se quiser o estado de antes, apague o lock e deixe o próximo build recriá-lo.

## 5. Problemas encontrados

Do mais grave para o menos grave. Nenhum foi corrigido.

| # | Gravidade | Onde | O que está errado | Evidência |
|--:|:--|:--|:--|:--|
| 1 | **médio** | `src/main.cpp:643,648,653,659,664,677` | Um `parar` que chega entre o envio de um comando de teste e o início dele é apagado, e o comando roda inteiro | Cada ramo de `serviceTestCommands` faz `gRemoteStop = false` ao começar. O laço de espera só atende os comandos a cada ~10 ms, e a cada ~1 s gasta ~100 ms em `calibrateGyro(50, true)` e `watchHealth()` (`main.cpp:783-793`). A janela chega a ~110 ms |
| 2 | **médio** | `src/main.cpp:780-795` e `1143` | Um comando de teste recebido durante a corrida fica pendente e roda sozinho logo depois de uma corrida com SUCESSO, sem o `ok` do operador. Exemplo: um `andar` ou `motor ed 6 1500` enviado por engano | Os gatilhos (`gTestManeuver`, `gTestWheelMask`, ...) só são lidos em `serviceTestCommands`, que não roda durante a corrida, e nada os zera. Depois do SUCESSO, `session.rearm()` volta ao laço de espera, que atende o que estiver pendente. Depois de uma FALHA isso não acontece: o modo Erro recusa os comandos de motor |
| 3 | baixo | `src/adapters/Drv8833MotionAdapter.cpp:198-212` | O comando antigo `frente <pot> <ms>` não obedece ao `parar` | `openLoopTest` não chama `aborted()`. O comando vai até 3 s (`main.cpp:260`). O `t.py` não usa esse comando |
| 4 | baixo | `src/adapters/Drv8833MotionAdapter.cpp:476` e `src/domain/BridgeDrive.cpp:11-16` | Com `RATO_SLOW_DECAY=y`, o `enc` freia as rodas em vez de soltá-las, e o H5 falharia | `encoderWatch` usa `setNormalized(0, 0)`. Em slow decay, `bridgeDuty(0)` vale `{1, 1}`, que é o freio (`BridgeDriveTest.cpp:51`: "potência 0 = freio"). Com o padrão `n` (fast decay), zero deixa o motor solto e funciona |
| 5 | baixo | `src/main.cpp:120` | Aviso de compilação no firmware de competição | `-Wunused-function` em `wallLetter`, que só é usada dentro de `#if CONFIG_RATO_LOG_RETA`. Já existia em `03c51e0` |
| 6 | baixo | `teste/t.py:517` e `src/main.cpp:401-454` | O critério do H3 diz que "a linha 'tof: ... PAROU' diz qual sensor", mas essa linha não sai durante o `tofmon` | `gSensor.watch()`, que gera o "PAROU", só roda no laço de espera (`main.cpp:786-788`), e não dentro de `runTofMonitor`. Uma queda que volta antes do fim do `tofmon` nunca gera a linha. O veredito do H3 não é afetado, porque usa as linhas `tofmon fim` |
| 7 | baixo | `src/adapters/Drv8833MotionAdapter.cpp:316,464-470` e `src/main.cpp:136` | Com vários problemas, a linha `rodas: resumo: ... PROBLEMA: ...` passa de 320 caracteres e é cortada no BLE | O texto fixo da linha (~150) mais os problemas (até 159) mais o prefixo do log com cor (~27) dá ~336, contra 320 do `DebugLine`. Só a lista de problemas sai cortada: o `t.py` procura `-> OK`, que nesse caso já não está lá |
| 8 | baixo | `src/main.cpp:237-265` | Um comando mal formado é ignorado sem nenhuma resposta, e o `t.py` só percebe pelo tempo esgotado ("o robô não respondeu") | Exemplos: `motor e 8 1000` (acima de 7,5 V), `motor x 3 1000` e um comando desconhecido. Nenhum ramo loga a recusa |
| 9 | baixo | `teste/t.py:389,404` | As expressões de `fim da corrida` e `nav: passo` aceitam um dígito só em `c(\d)`, e no 12x4 (colunas c10 e c11) a linha não casaria | Os testes do `t.py` são todos no 4x4, então hoje não afeta nada |

### Correções propostas

**1. O `parar` não pode ser apagado pelo comando que ele quer parar.** Zerar o `gRemoteStop` quando o comando CHEGA (no callback do BLE), e não quando ele começa. Assim, um `parar` posterior sempre vale.

```cpp
// main.cpp, onBleCommand: antes de armar cada gatilho de teste
-        gTestManeuver = static_cast<int>(maneuver);
+        gRemoteStop = false;
+        gTestManeuver = static_cast<int>(maneuver);
// (o mesmo antes de gTestWheelMask, gTestWheelSweep, gTestEncoderSeconds,
//  gTestTofMonSeconds e gTestMs)

// main.cpp, serviceTestCommands: tirar as seis linhas
-        gRemoteStop = false;
```

**2. Descartar os comandos pendentes ao voltar da corrida.**

```cpp
// main.cpp, novo, dentro do #if CONFIG_RATO_LOG_RETA
+void discardTestCommands() {
+    const bool any = gTestMs.exchange(0) | gTestManeuver.exchange(0) | gTestWheelMask.exchange(0) |
+                     gTestWheelSweep.exchange(false) | gTestEncoderSeconds.exchange(0) |
+                     gTestTofMonSeconds.exchange(0) | gTestTof.exchange(false) |
+                     gTestGyro.exchange(false) | gTestDiag.exchange(false) |
+                     gTestHealth.exchange(false) | gTestTofRecover.exchange(false);
+    if (any) ESP_LOGW("teste", "comandos recebidos durante a corrida foram descartados");
+}

// main.cpp:1143
-        session.rearm();
+#if CONFIG_RATO_LOG_RETA
+        discardTestCommands();
+#endif
+        session.rearm();
```

(O `|` sem curto-circuito é proposital: todos os `exchange` precisam rodar.)

**3. O `frente` obedece ao `parar`.**

```cpp
// Drv8833MotionAdapter.cpp:201
         if (elapsedMs >= ms) {
             break;
         }
+        if (aborted()) {
+            break;
+        }
// e, depois do ESP_LOGI do fim (linha 216):
+    clearLastMove();
```

**4. `enc` com as rodas soltas em qualquer modo de decay.**

```cpp
// MotorDriver.hpp / MotorDriver.cpp: novo
+void MotorDriver::coast() {  // as duas entradas em 0: motor solto, em qualquer modo de decay
+    apply(kLeftIn1, kLeftIn2, domain::BridgeDuty{0.0, 0.0});
+    apply(kRightIn1, kRightIn2, domain::BridgeDuty{0.0, 0.0});
+}
// Drv8833MotionAdapter.cpp:476
-    motors_.setNormalized(0.0, 0.0);  // motores soltos, para girar a roda à mão
+    motors_.coast();  // motores soltos, para girar a roda à mão
```

**5. Aviso de `wallLetter`.**

```cpp
// main.cpp:120
-char wallLetter(const domain::MazeMap& maze, const domain::Position& cell,
+[[maybe_unused]] char wallLetter(const domain::MazeMap& maze, const domain::Position& cell,
```

**6. "PAROU" também durante o `tofmon`.**

```cpp
// main.cpp, runTofMonitor, dentro do if que loga uma vez por segundo (linha 425)
         if ((now - start) / 1000000 > reported) {
             ++reported;
+            gSensor.watch();  // loga "tof: <lado> PAROU/VOLTOU" na hora
```

Outra opção: trocar o texto do critério em `t.py:517` para citar a linha `tofmon fim <lado>`.

**7. Lista de problemas do `rodas` numa linha própria.**

```cpp
// Drv8833MotionAdapter.cpp:464-470: o resumo termina em "-> OK" ou "-> PROBLEMA" e, se houver,
// uma segunda linha: ESP_LOGW("teste", "rodas: problemas: %s", problems);
```

O `t.py` continua funcionando: ele procura `-> OK` no resumo.

**8. Recusa visível.** Contar as recusas num `std::atomic<int> gRejectedCommands` no `onBleCommand` (sem logar ali: a pilha da tarefa do NimBLE é de 4096 B) e, no começo de `serviceTestCommands`, logar `teste: N comando(s) recusado(s): fora da faixa ou desconhecido`.

**9. `t.py`, para o 12x4.**

```python
# t.py:389 e t.py:404
-posicao \(l(\d),c(\d)\)
+posicao \(l(\d+),c(\d+)\)
-cel \(l(\d),c(\d)\)
+cel \(l(\d+),c(\d+)\)
```

## 6. Conferências OK

**4.1 Parâmetros** (todos iguais aos da v3; os arquivos são idênticos):

- `kWheelDiameterMm` é 32.0, `kCountsPerRevolution` é 285, `kCellSizeMm` é 180.0 e `kWheelTrackMm` é 88.0 (`RobotParameters.hpp:15-18`). `kBody` é {87.0, 50.0, 87.0} (`:24-28`).
- `kMotorMaxVolts` é 7.5, `kArcFrontClearanceMm` é 27.0, `kFrontStopMm` é 35.0 e `kGyroRestMaxSpreadDps`/`kGyroRestMaxBiasDps` são 3.0/25.0 (`RobotMotion.hpp:22,89,118,132-133`).
- Os limiares do construtor do ToF são 90/140 mm (`Vl53l1xSensorAdapter.hpp:71`), e `kMuteMs`/`kMaxFailedStreak` são 500/3 (`Vl53l1xSensorAdapter.cpp:32,35`).
- As pilhas `nav`/`telemetry` são 12288/6144 e a fila de log é de 64 (`main.cpp:1241,1247,1249`).
- `BoardPins.hpp` não mudou de conteúdo desde `03c51e0`, só a permissão. `RATO_SLOW_DECAY` tem padrão `n`.

**4.2 Logs e `t.py`:** cada uma das cerca de 45 verificações do `t.py` (~35 expressões regulares e 9 buscas com `has()`) tem o `ESP_LOG*` que produz a linha, com o texto, os espaços, as vírgulas e as unidades certos:

- **`diag: fim:` e `diag: firmware: versao ...`:** `main.cpp:626,473`.
- **`saude 1/2` e `saude 2/2`:** `main.cpp:349,358`.
- **`tofmon fim`, `tofmon fim <lado>` e `tof N/5`:** `main.cpp:451,444,671`.
- **`giroscopio em repouso ... ligado ha N s`:** `main.cpp:691`.
- **`enc fim`:** `Drv8833MotionAdapter.cpp:492`. **`rodas: roda` e `rodas: resumo`:** `:421,464`. **`motor fim ... bateria minima`:** `:296`.
- **`reta: <nome> N mm ... giro= ... ok` e `reta: laco`:** `:718,742`.
- **Curvas:** `curva: alvo=`, `angulo a cada 100 ms`, `inicio do arco: alvo/sem parede a frente`, `tentativa 2 do arco`, `desfez o arco` e `curva travada` (`:854,869,959,969,922,1008,26`).
- **`teste: manobra`:** `:543`. **`parado pelo operador`:** `:94`.
- **Largada e fim:** `largada N: labirinto`, `largada recusada: sem parede a`, `fim da corrida`, `movimento:`, `nav: passo` e `nav: mapa l3` (`main.cpp:890,925,1099,1108,977,1125`).
- **Filtro do BLE:** todas as tags usadas (`main`, `nav`, `reta`, `curva`, `tof`, `giro`, `diag`, `teste`) passam pelo filtro de `mirrorLogToBle` (`main.cpp:148-155`).
- **Versão gravada:** sai como `038ea1c`, o mesmo hash que o `t.py` compara.
- **`LOGS_E_MEDIDAS.md`:** as linhas descritas nas seções 1, 2 e 5 batem com o firmware. A única diferença é a duração do `diag` ("~6 s" no documento e "~8 s" no `t.py`), que não importa.

**4.3 Comandos BLE:** `onBleCommand` aceita `largar`, `parar`, `reiniciar`, `andar`, `re`, `virar d|e`, `arco d|e`, `pivo d|e`, `tof`, `giro`, `diag`, `saude`, `tofrec`, `rodas`, `tofmon [s]` (1 a 120), `enc [s]` (1 a 60), `motor e|d|ed V MS` (de -7,5 a 7,5 V e de 1 a 3000 ms) e `frente P MS`.

- **`t.py`:** tudo o que ele envia é aceito.
- **Tabela do `LOGS_E_MEDIDAS.md`:** bate com o firmware.
- **Ponte:** manda `comando\n`, e o firmware tira espaços e quebras de linha (`BleTelemetryAdapter.cpp:45-50`).
- **Painel:** o backend e o frontend não mandam comando nenhum ao robô (`grep` vazio).

**4.4 Firmware fora dos testes de host:**

- **Concorrência:** todas as variáveis trocadas entre o callback do BLE e a tarefa `nav` são `std::atomic`. Os contadores do `Ina219` (lido pelas duas tarefas) e do BLE são atômicos. Os do `Mpu6050` e do `IdfRegisterBus` só são usados pela tarefa `nav`.
- **`parar`:** interrompe `wheelTest`, `wheelSweep`, `encoderWatch`, `runTofMonitor`, `straight`, `pivot` e `undoArc`. A exceção é o `frente` (problema 3).
- **Tempo limite:** todos os laços de motor têm limite (`motor` até 3 s, `rodas` cerca de 18 s, `enc` até 60 s, `tofmon` até 120 s, e os limites de reta, curva e desfazer o arco).
- **Freio:** todos os caminhos de saída freiam. São `motors_.brake()` em `wheelTest:293`, `wheelSweep:398,451`, `encoderWatch:496` e `openLoopTest:213`, e `stopAndSettle()` em reta, curva e desfazer o arco, inclusive na saída por `parar` ou erro.
- **ToF:**
  - o silêncio de 0,5 s vale no `freshReading`, e o `sense()` com o robô parado lê mesmo assim;
  - `recoverFailed` põe XSHUT=0 em todos os que falharam antes de religar o primeiro (`:338-346`);
  - o limite de 3 reinícios seguidos vale no automático (`:313-314`);
  - as falhas durante a configuração não entram na conta (`bringUp` repõe os contadores, `:73,98,104`);
  - um `bringUp` que falha deixa o sensor com XSHUT=0. Não achei caminho que deixe dois sensores em 0x29.
- **Giroscópio:** toda leitura da corrida passa por `gyroRate()`, que desconta o desvio (`:101`). Só `measureGyroRest` lê bruto, de propósito. O desvio só é aceito com variação de até 3 graus/s e média de até 25 (`:140-142`). `calibrateGyro` só é chamado com o robô parado: na espera, no começo de cada manobra avulsa e na largada, depois do `sense()`.
- **Buffers:** todos os `snprintf` respeitam o tamanho (`problems[220]`, `problems[160]`, `text[40/48]`, `partText[24]`, `line[260]`, `failure[190]`). As linhas de log cabem nos 320 do `DebugLine`, exceto a do problema 7.
- **Includes e componentes:** `esp_app_desc.h` vem de `esp_app_format` e `esp_timer.h` de `esp_timer`, os dois no `REQUIRES` (`esp32/main/CMakeLists.txt`). `esp_err.h`, `esp_random.h` e `esp_system.h` são de componentes comuns. Os três builds passaram.
- **Modo de competição** (`RATO_LOG_RETA` desligado):
  - larga pelo botão;
  - mede o desvio do giroscópio a cada ~2 s na espera (`main.cpp:800-803`) e na largada (`:938`);
  - corre normalmente: o canal de comandos BLE e o `setAbortFlag` não existem, como antes.
  - O que a v3 mudou fora do `#if` é tudo da corrida e intencional: o desconto do desvio, o silêncio e o reinício dos ToF no `sense()`/`freshReading`, os contadores e o `setPowerMonitor`.

**4.5 Navegação:** `NavigatorTest` (18), `TrackMazeCornersTest` (5), `TrackMaze0911Test` (2), `ManeuverTest` (20) e `DipDecoderTest` (7) existem e passam.

- **Beco:** o robô sai de ré, com `reverses == 2` e `halfTurns == 0` (`TrackMazeCornersTest.cpp:127-135`).
- **Parede da célula seguinte:** não conta (`ManeuverTest` `ArcoNaoAvancaParaAParedeDaCelulaSeguinte`; limiar frontal de 140 mm e `kArcFrontWallMaxMm` = 150).
- **Via 3:** aberta quer dizer borda à esquerda, e a largada é recusada se não bater (`DipDecoderTest` `StartCornerCheckFollowsTheThirdSwitch`; `main.cpp:918-933`).
- **Objetivo:** o canto oposto, `(N-1-x0, N-1-y0)`, nos três labirintos (`DipDecoderTest` `GoalIsAlwaysOppositeDiagonal`; `DipDecoder.cpp:47`).

**4.6 Ferramentas de teste:**

- **IDs:** o `t.py` tem 46 testes (H1-H8, A1-A5, B1, B2, B3-{E,F,D}{50,100,150,200}, B4d/e, B5d/e, C1-C8, D1-D7).
- **D1:** 12 passos. Refiz o caminho no labirinto 4x4 do `PROMPT_CLAUDE_CODE.md`, com a regra "letra = A + linha, número = 4 - coluna", e ele dá D4, C4, B4, A4, A3, A2, B2, B3, C3, C2, C1, B1 até A1, com as ações na ordem do `D1_SEQUENCE`.
- **D2:** 10 passos. D1, C1, B1, A1, ré até B1, ré até C1, C2, C3, B3, A3 até A4, com as duas rés e nenhum 180 graus. O caminho é o mesmo do `TrackMazeCorners.FromD1BacksOutOfTheA1DeadEndAndReachesA4`.
- **Ponte:** o `ponte.py` acha `src/firmware/bridge/ble_ws_bridge.py` (`HERE.parent/src/firmware/bridge`, que funciona com a pasta `teste/` na raiz). Ele troca `ble_ws_bridge._read_command_lines`, que a ponte procura pelo nome a cada leitura (`ble_ws_bridge.py:207`), e passa `--print-only --log-robo --comandos`, que a ponte aceita (`:427-436`). Os textos `[ble] conectado`, `[ble] desconectado`, `[ble] procurando` e `[rx] ` de que o `Tee` depende são os que a ponte imprime (`:240,267,278,387`). O `hello` traz `boot` (`ProtocolV1.cpp:87`). A ponte não mudou depois da v3.

**4.7 Problemas já conhecidos:** nenhum mudou. `kBody` e `kWheelTrackMm` continuam estimados. O MPU-6050 continua sendo acordado com `PWR_MGMT_1 = 0x00` (`Mpu6050.cpp`, no `begin`). Os limites do `diag` e do `rodas` continuam marcados como não calibrados. O 8x4 e o 12x4 não foram testados no robô, e a v3 nunca rodou na placa.

## 7. O que não dá para concluir sem o robô

- **Se a v3 roda na placa:** ela agora compila com o ESP-IDF, mas nunca foi gravada.
- **Pilha real das tarefas:** a estimativa estática é de ~6 KB de 12 KB na `nav`. Para medir, sugiro pôr `uxTaskGetStackHighWaterMark(nullptr)` na linha `saude 1/2`.
- **Desvio do giroscópio medido com o robô na mão:** na espera, o desvio é medido a cada 1 a 2 s. Se a medida da largada for recusada (robô ainda balançando depois do botão), vale a última da espera, que pode ter sido feita enquanto o operador posicionava o robô. Se a mão girar o robô de forma muito suave (variação abaixo de 3 graus/s em 0,1 s), um desvio falso seria aceito. Só o log `giro` das corridas mostra se isso acontece. Se acontecer, uma correção é só aceitar a medida da espera se o robô ficou parado nas duas últimas medidas seguidas.
- **Sentido dos encoders e dos motores no `rodas`, com `RATO_FIOS_MOTORES_TROCADOS=y`:** depende da fiação.
- **Duração real do `diag`** (~4 a 6 s pela conta) e se a fila de 64 linhas basta com o `rodas` e o `motor` logando a cada 100 ms. A telemetria esvazia a fila a cada 100 ms, mas a taxa real do BLE só se vê na placa (contador `ble perdidos` no `saude`).
- **Valores físicos:** os limiares dos ToF, o início do arco e as medidas M1 a M9. São os pontos já conhecidos da 4.7.
- **Roteiro v3:** o documento "Roteiro de testes do robô (firmware v3): passo a passo" não está no repositório. Os critérios do `t.py` foram conferidos contra o firmware e o `LOGS_E_MEDIDAS.md`, e não contra esse roteiro.

## Arquivos da auditoria

`auditoria/` (cerca de 590 MB por causa dos builds; não está no `.gitignore`):

- `etapa1-log.txt`: os commits desde `03c51e0`.
- `classificar.py`, `hashes-v3.txt`, `hashes-base-03c51e0.txt` e `etapa2-classificacao.txt`: a integridade.
- `build-host/`, `build-host*.log` e `ctest.log`: os testes de host.
- `build-esp32-calibracao/`, `build-esp32-competicao/`, `build-diagnostico/`, `sdkconfig.*`, `opcoes-*.defaults` e `*-build.log`: o ESP-IDF.
- `stack/*.su`: o uso de pilha por função.
- `py_compile.log` e `pyc/`.

## Depois da auditoria (15/11)

Os nove problemas da seção 5 foram corrigidos no mesmo dia, a pedido, nos commits seguintes a `038ea1c`. Depois das correções: 237 de 237 testes de host, e o firmware compila sem nenhum aviso nas duas configurações (ESP-IDF v5.3). A pasta `teste/` foi renomeada para `teste-v3/`, o nome que o prompt de testes usa. As seções acima descrevem o estado de ANTES das correções; os números de linha são os de `038ea1c`.
