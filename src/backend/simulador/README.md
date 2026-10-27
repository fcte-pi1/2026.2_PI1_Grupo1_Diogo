# Simulador de robô

Simulador em Node/TypeScript que fala o mesmo protocolo do robô (RNF-53). Com ele dá para desenvolver e testar o backend e o painel **sem hardware**. É a ferramenta dos testes E2E do backend (CT-BE), dos testes do painel (#330) e das demonstrações.

Ele se conecta direto em `/ws/telemetria`, sem a ponte BLE, e envia as mesmas mensagens que o robô envia: o `hello` e depois uma corrida completa, de `inicio_corrida` a `fim_corrida`. Os tipos vêm de [`../protocolo/tipos.ts`](../protocolo/tipos.ts), e os testes verificam cada mensagem gerada com o validador do protocolo v1 ([`../protocolo/validador.ts`](../protocolo/validador.ts)).

Além da corrida normal, o simulador reproduz os **cenários de falha** dos casos de teste do backend: queda e reconexão com reenvio do buffer, perda de sinal com a conexão aberta, reinício do robô, mensagens duplicadas, fora de ordem, malformadas ou fisicamente impossíveis, tensão baixa, atraso de rede e dois robôs ao mesmo tempo.

> **Regra de ouro:** como o robô real, o simulador é um **emissor unidirecional**. O envio da corrida nunca depende do que o backend responde, nem nos cenários de falha: depois de uma queda, ele reenvia o buffer inteiro sem saber o que já foi gravado. Os `ack` recebidos são guardados, e só `aguardarConfirmacao()` olha para eles, **depois** do envio, para quem usa o simulador saber se o backend gravou tudo.

## Uso pela linha de comando

Com o ambiente no ar (`docker compose up`) e o seed aplicado (`docker compose exec backend npm run seed`):

```bash
docker compose exec backend npm run simulador -- --labirinto 4x4
```

No computador, fora do Docker, depois de `npm install` em `src/backend`, o comando é o mesmo, sem o `docker compose exec backend`.

### Opções da corrida

| Opção | Padrão | O que faz |
|:--|:--|:--|
| `--url <url>` | `ws://localhost:8080/ws/telemetria` | Endereço do backend |
| `--dispositivo <id>` | `sim-01` | Identificador cadastrado no backend (o seed cria o `sim-01` e o `sim-02`). Vários ids separados por vírgula correm ao mesmo tempo |
| `--token <token>` | `T-VALIDO` | Token do dispositivo |
| `--labirinto <tipo>` | `4x4` | `4x4`, `8x4` ou `12x4` |
| `--taxa <n>` | `20` | Mensagens por segundo. `20` é o ritmo do robô; `0` envia sem pausas |
| `--resultado <r>` | `sucesso` | `sucesso` ou `falha` |
| `--semente <n>` | aleatória | Inteiro de 0 a 4294967295. A mesma semente repete o mesmo labirinto e o mesmo percurso |
| `--partida <canto>` | `oeste` | Canto de partida, como o DIP 3 do robô: `oeste` = (0, 3) e `leste` = (C−1, 3) |
| `--ajuda`, `-h` | | Mostra a ajuda |

### Opções dos cenários de falha

| Opção | Padrão | O que faz |
|:--|:--|:--|
| `--queda <seq>` | | Derruba a conexão logo depois da sequência `<seq>` e reconecta com o mesmo `boot` |
| `--duracao-queda <ms>` | `5000` | Tempo fora do ar. O robô continua andando: o que ele emite nesse tempo vai só para o buffer |
| `--silencio <seq>` | | Depois da sequência `<seq>`, para de enviar e de responder ao ping, com a conexão aberta |
| `--duracao-silencio <ms>` | `5000` | Tempo em silêncio. O backend declara a perda de sinal depois de 3 s |
| `--sem-reenvio` | | Na volta, não reenvia o buffer: o que se perdeu fica como lacuna |
| `--buffer <ms>` | `60000` | Retenção do buffer circular, no relógio do robô |
| `--reinicio <seq>` | | Reinicia o robô logo depois da sequência `<seq>`: a corrida fica sem fim e ele volta com outro `boot` |
| `--anomalias <lista>` | | Mensagens problemáticas espalhadas na corrida (veja a tabela abaixo). Aceita os grupos `malformadas`, `impossiveis` e `todas` |
| `--tensoes <lista>` | | Tensões da bateria, em V, em degraus iguais ao longo da corrida. Cada valor tem de estar entre 5 e 9 V |
| `--atraso <ms>` | | Atraso de rede artificial de 0 a `<ms>` em cada mensagem, ou `<min>-<max>` |

As opções podem ser combinadas, por exemplo uma queda com atraso de rede.

### Corridas normais

```bash
# Corrida completa, no ritmo do robô, em cada labirinto
npm run simulador -- --labirinto 4x4
npm run simulador -- --labirinto 8x4
npm run simulador -- --labirinto 12x4

# Partindo do canto leste
npm run simulador -- --labirinto 12x4 --partida leste

# Repetir exatamente a mesma corrida (a semente aparece na primeira linha da saída)
npm run simulador -- --labirinto 8x4 --semente 42

# Corrida que falha: o robô para no meio do caminho e envia estado ERRO e fim_corrida falha
npm run simulador -- --labirinto 8x4 --resultado falha

# Corrida rápida, sem esperar entre as mensagens
npm run simulador -- --labirinto 12x4 --taxa 0

# Dispositivo ou token errado: o backend fecha com 4001 e o simulador mostra o erro
npm run simulador -- --token T-ERRADO
```

Exemplo de saída:

```
15:09:33.143 [simulador] sim-01 · boot 008db5 · labirinto 4x4 · semente 42 (repita com --semente 42)
15:09:33.143 [simulador] conectando em ws://localhost:8080/ws/telemetria
15:09:33.219 [simulador] conectado, hello enviado
15:09:38.219 [simulador] emitidas 100/470 · acks 97 · último ack 100 · buffer 100
...
15:09:56.671 [simulador] corrida r008db5-1 enviada (resultado simulado: sucesso): 470 mensagens, 20 células percorridas (6 revisitas), 22.3 s no relógio do robô
15:09:56.687 [simulador] confirmada pelo backend: último ack 470 de 470
```

Depois de enviar, o comando espera o backend confirmar a última mensagem (até 5 s, mais o atraso de rede, se houver). Ele termina com código `0` quando a corrida foi **confirmada como esperado** e com `1` em caso de erro: backend fora do ar, `hello` recusado (`4001`, `4002`, `4003`), nenhuma confirmação no prazo ou opção inválida. Com o token errado, por exemplo:

```
[simulador] ERRO: conexão encerrada antes do ack da sequência 220 (fechada com o código 4001: token inválido)
[simulador] ERRO: dispositivo ou token recusado: rodou o seed? confira --dispositivo e --token
```

Com dois ou mais dispositivos, cada linha começa com o id (`[sim-01]`, `[sim-02]`), e o código de saída é `0` só se todos terminarem bem.

## Cenários de falha

Cada cenário corresponde a um caso de teste de [`docs/software/backend/4_casos_de_teste.md`](../../../docs/software/backend/4_casos_de_teste.md). A coluna "No backend" diz o que se espera ver no banco, no log ou no painel.

| Cenário | Casos de teste | Comando | No backend |
|:--|:--|:--|:--|
| Queda e reconexão, com reenvio do buffer | CT-BE-04, CT-BE-13 | `--queda 120 --duracao-queda 10000` | Corrida completa, sem lacunas. O contador de duplicadas sobe com o que foi reenviado |
| Queda sem reenvio | CT-BE-04 (variante) | `--queda 120 --sem-reenvio` | Lacuna depois da 120 em `seqs_faltantes`. O `ack` para em 120 |
| Perda de sinal com a conexão aberta | CT-BE-03, CT-BE-25 | `--silencio 100 --duracao-silencio 5000` | `SINAL_PERDIDO` 3 s depois do silêncio, `SINAL_RETOMADO` na volta e a corrida completa |
| Reinício do robô | CT-BE-14 | `--reinicio 200` | A corrida vira `INTERROMPIDA (REINICIO_ROBO)` |
| Mensagens problemáticas | CT-BE-05 a CT-BE-08, CT-BE-17 | `--anomalias todas` | Cada uma rejeitada com o motivo da tabela abaixo, sem derrubar a conexão. A corrida termina completa |
| Tensão baixa | CT-BE-18, CT-BE-19 | `--tensoes 7.2,6.9,6.8,7.05,6.9,7.2,6.9` | Exatamente 2 alertas `TENSAO_BAIXA` |
| Atraso de rede | CT-BE-15 | `--atraso 0-800` | O tempo de conclusão é o do relógio do robô, igual com ou sem atraso |
| Dois robôs ao mesmo tempo | CT-BE-21 | `--dispositivo sim-01,sim-02` | Duas corridas, cada uma no seu dispositivo |

Nos exemplos abaixo, `--semente 42` fixa o labirinto e o percurso (no 8x4, são 514 mensagens), para a sequência pedida existir e a saída ser a mesma. Sem a semente, uma corrida curta pode ter menos mensagens que a sequência pedida, e o simulador avisa (`apos (queda) deve ser uma sequência de 1 a N`).

### Queda e reconexão (CT-BE-04, CT-BE-13)

O simulador faz o que o firmware faz (`telemetryTask` no `main.cpp`): **toda** mensagem da corrida entra num buffer circular, esteja o enlace no ar ou não. A cada conexão, o robô envia o `hello` e, logo depois, o buffer inteiro.

```bash
# Cai depois da 120, fica 10 s fora e volta: o backend recebe de novo de 1 a 120 (duplicadas) e o que se perdeu
npm run simulador -- --labirinto 8x4 --semente 42 --queda 120 --duracao-queda 10000

# Variante do CT-BE-04: sem reenvio, as mensagens emitidas fora do ar viram lacuna
npm run simulador -- --labirinto 8x4 --semente 42 --queda 120 --duracao-queda 10000 --sem-reenvio

# Queda mais longa que o buffer: só os últimos 5 s são reenviados, e o começo da queda vira lacuna
npm run simulador -- --labirinto 8x4 --semente 42 --queda 120 --duracao-queda 10000 --buffer 5000
```

Saída da primeira (no backend: 514 mensagens gravadas, 120 duplicadas, nenhuma lacuna):

```
[simulador] cenário: queda depois da sequência 120, por 10000 ms
[simulador] conectado, hello enviado
[simulador] emitidas 100/514 · acks 100 · último ack 100 · buffer 100
[simulador] emitidas 200/514 · acks 120 · último ack 120 · buffer 200 · FORA DO AR
[simulador] emitidas 300/514 · acks 120 · último ack 120 · buffer 300 · FORA DO AR
[simulador] emitidas 400/514 · acks 520 · último ack 400 · buffer 400
[simulador] emitidas 500/514 · acks 620 · último ack 500 · buffer 500
[simulador] corrida r3cf739-1 enviada (resultado simulado: sucesso): 514 mensagens, 24 células percorridas (5 revisitas), 24.3 s no relógio do robô
[simulador] 1 interrupção(ões) do enlace; 320 mensagens reenviadas do buffer depois do hello
[simulador] confirmada pelo backend: último ack 514 de 514
```

Quando o reenvio está desligado, ou a queda passa da retenção do buffer, o simulador avisa que a lacuna é esperada e confere só até onde o `ack` pode chegar. Na segunda, o backend fica com 199 sequências faltantes (de 121 a 319); na terceira, com 93:

```
[simulador] lacuna esperada: a sequência 121 nunca chegou ao backend (reenvio desligado ou queda mais longa que o buffer). O ack deve parar em 120
[simulador] confirmada pelo backend: último ack 120 de 514
```

**A queda é uma queda de verdade:** o TCP é encerrado sem a mensagem de fechamento do WebSocket, e o backend vê o código `1006`, como quando o Bluetooth ou a rede caem. Antes de cortar, o simulador espera sair o que já tinha sido enviado, para que "queda depois da sequência N" signifique que o backend recebeu até a N.

Para o CT-BE-13 (120 s sem sinal e lote tardio), use `--queda` com uma sequência perto do fim e `--duracao-queda 125000`. A corrida termina fora do ar, e o lote com o `fim_corrida` chega depois de o backend já ter marcado a corrida como `INTERROMPIDA (SEM_SINAL)`. Com a corrida de 4x4 (cerca de 22 s), o buffer de 60 s guarda a corrida inteira:

```bash
npm run simulador -- --labirinto 4x4 --semente 42 --queda 300 --duracao-queda 125000
```

### Perda de sinal com a conexão aberta (CT-BE-03)

É o caso em que o Bluetooth cai, mas a ponte continua conectada ao backend: o TCP fica aberto, e o robô para de mandar mensagens **e** de responder ao ping. O backend declara a perda depois de 3 s sem mensagens. Na volta, o robô envia o `hello` (mesmo `boot`) e o buffer **na mesma conexão**, e o backend registra `SINAL_RETOMADO`.

```bash
npm run simulador -- --labirinto 8x4 --semente 42 --silencio 100 --duracao-silencio 5000
```

```
[simulador] cenário: silêncio (sem mensagens e sem pong) depois da sequência 100, por 5000 ms
[simulador] emitidas 100/514 · acks 100 · último ack 100 · buffer 100 · EM SILÊNCIO
[simulador] emitidas 200/514 · acks 100 · último ack 100 · buffer 200 · EM SILÊNCIO
[simulador] emitidas 300/514 · acks 400 · último ack 300 · buffer 300
...
[simulador] 1 interrupção(ões) do enlace; 200 mensagens reenviadas do buffer depois do hello
[simulador] confirmada pelo backend: último ack 514 de 514
```

### Reinício do robô (CT-BE-14)

O robô reinicia logo depois da sequência pedida: a conexão cai, a RAM (e com ela o buffer) se perde, o relógio do robô recomeça e, 1 s depois (`DURACAO_REINICIO_MS`, o tempo de o ESP32 ligar e o BLE voltar), ele se conecta com **outro** `boot`. A corrida antiga nunca recebe o `fim_corrida`.

A linha de comando sempre usa 1 s. Pela API, o roteiro aceita `duracaoReinicioMs` junto com `reinicioApos`; com `0`, o `hello` do boot novo chega enquanto o backend ainda processa as últimas mensagens do boot antigo, que é a reconexão imediata do procedimento do CT-BE-14 e o cenário corrigido no #366. O E2E roda os dois casos.

```bash
npm run simulador -- --labirinto 8x4 --semente 42 --reinicio 200
```

```
[simulador] cenário: reinício do robô depois da sequência 200
[simulador] emitidas 200/514 · acks 200 · último ack 200 · buffer 0 · FORA DO AR
[simulador] corrida rdb829f-1 cortada pelo reinício: 200 de 514 mensagens emitidas, sem fim_corrida
[simulador] robô reiniciado depois da sequência 200: novo boot 813e33. Esperado: rdb829f-1 INTERROMPIDA (REINICIO_ROBO)
```

### Mensagens problemáticas (CT-BE-05 a CT-BE-08, CT-BE-17)

`--anomalias` espalha as mensagens pedidas pelo meio da corrida (com a semente, sempre nos mesmos lugares). A corrida continua **completa**: cada mensagem inválida usa a `sequencia` de uma válida, que é enviada logo depois. Assim, o backend rejeita a inválida, aceita a válida e confirma a corrida inteira.

| Anomalia | O que é enviado | Esperado no backend |
|:--|:--|:--|
| `duplicada` | A mesma mensagem mais 2 vezes (3 envios, como no CT-BE-08) | `ack` para todas, gravada e distribuída uma vez. Duplicadas +2 |
| `fora-de-ordem` | Uma mensagem sai depois das 2 seguintes (CT-BE-17) | Gravada, mas distribuída ao painel só quando a lacuna fecha |
| `sem-campo` | `celula` sem `paredes` (CT-BE-05) | Rejeitada: `ESQUEMA_INVALIDO` |
| `nao-json` | Uma linha que não é JSON (CT-BE-05) | Rejeitada: `JSON_INVALIDO` |
| `tipo-desconhecido` | `tipo: "teleporte"` (CT-BE-05) | Rejeitada: `TIPO_DESCONHECIDO` |
| `labirinto-invalido` | `inicio_corrida` com `labirinto: "5x5"` (CT-BE-07) | Rejeitada: `ESQUEMA_INVALIDO` |
| `fora-do-labirinto` | `celula` com `x = 5` no 4x4 (CT-BE-06). No 12x4, `y = 5` | Rejeitada: `COORDENADA_FORA_DO_LABIRINTO` |
| `tensao-fora-da-faixa` | `energia` com 4,9 V e com 9,1 V (CT-BE-07) | Rejeitada duas vezes: `TENSAO_FORA_DA_FAIXA` |
| `tempo-regredindo` | `tempo_ms` 100 ms antes do da sequência anterior (CT-BE-07) | Rejeitada: `TEMPO_REGRESSIVO` |

```bash
npm run simulador -- --labirinto 4x4 --semente 42 --anomalias todas
npm run simulador -- --labirinto 4x4 --anomalias malformadas
npm run simulador -- --labirinto 4x4 --anomalias duplicada,fora-de-ordem
```

Saída da primeira (no backend: 8 rejeitadas, 2 duplicadas e a corrida concluída com as 470 mensagens):

```
[simulador] anomalia labirinto-invalido na sequência 1: esperado: rejeitada: ESQUEMA_INVALIDO
[simulador] anomalia tempo-regredindo na sequência 98: esperado: rejeitada: TEMPO_REGRESSIVO
[simulador] anomalia duplicada na sequência 109: esperado: confirmada com ack, mas gravada e distribuída uma única vez
[simulador] anomalia fora-do-labirinto na sequência 191: esperado: rejeitada: COORDENADA_FORA_DO_LABIRINTO
[simulador] anomalia nao-json na sequência 228: esperado: rejeitada: JSON_INVALIDO
[simulador] anomalia tipo-desconhecido na sequência 237: esperado: rejeitada: TIPO_DESCONHECIDO
[simulador] anomalia sem-campo na sequência 243: esperado: rejeitada: ESQUEMA_INVALIDO
[simulador] anomalia tensao-fora-da-faixa na sequência 259: esperado: rejeitada (duas vezes): TENSAO_FORA_DA_FAIXA
[simulador] anomalia fora-de-ordem na sequência 262: esperado: gravada, mas distribuída só depois de a lacuna fechar
[simulador] confirmada pelo backend: último ack 470 de 470
```

### Tensão baixa (CT-BE-18, CT-BE-19)

`--tensoes` troca a curva da bateria por uma sequência fixa. A corrida é dividida em degraus iguais, um por valor, na ordem dada e **sem ruído**: a primeira leitura tem o primeiro valor, e a última, o último.

```bash
# CT-BE-19: alerta com histerese (2 alertas: na primeira e na última leitura de 6,9 V)
npm run simulador -- --labirinto 4x4 --tensoes 7.2,6.9,6.8,7.05,6.9,7.2,6.9

# CT-BE-18: tensão inicial 8,20 V, final 7,60 V, ΔV 0,60 V, carga de 87,5 % para 50 %
npm run simulador -- --labirinto 4x4 --tensoes 8.2,8.0,7.8,7.6
```

Valores fora de 5 a 9 V são recusados aqui, porque o backend rejeitaria a mensagem. Para testar essa rejeição, use a anomalia `tensao-fora-da-faixa`.

### Atraso de rede (CT-BE-15)

Cada mensagem sai com um atraso sorteado na faixa, mas **nunca antes da anterior**, como num TCP com variação de latência. Trocar a ordem é papel da anomalia `fora-de-ordem`. O atraso tem o seu próprio gerador aleatório: ligá-lo não muda o labirinto nem a corrida da mesma semente.

```bash
npm run simulador -- --labirinto 8x4 --atraso 0-800
```

### Dois robôs ao mesmo tempo (CT-BE-21)

```bash
npm run simulador -- --labirinto 8x4 --dispositivo sim-01,sim-02
```

Cada dispositivo tem a sua conexão, o seu `boot` e a sua corrida. Com `--semente`, os dois usam o mesmo labirinto (como dois robôs no mesmo labirinto físico); sem ela, cada um sorteia o seu.

## Uso pela API (testes E2E e Playwright)

```ts
import { criarSimulador } from '../../simulador/simulador.js';

const sim = criarSimulador({ url, labirinto: '4x4', taxa: 0, semente: 1 });
await sim.conectar(); // abre a conexão e envia o hello
const corrida = await sim.iniciarCorrida(); // envia a corrida inteira
await sim.aguardarConfirmacao(corrida.mensagens); // espera o ack da última mensagem
await sim.encerrar(); // fecha com o código 1000

expect(sim.acks.at(-1)).toEqual({ tipo: 'ack', corrida: corrida.corrida, sequencia: corrida.mensagens });
```

> **Sempre chame `aguardarConfirmacao()` antes de `encerrar()`.** O backend só confirma depois de gravar o lote (até 10 ms, mais a gravação). Fechando logo depois do envio, os `ack` não chegam. Ela também é o jeito confiável de saber se o `hello` foi recusado: com `taxa: 0`, a corrida inteira pode ser enviada antes de a recusa chegar, e aí `iniciarCorrida()` termina sem erro.

### Opções de `criarSimulador()`

| Opção | Padrão | O que é |
|:--|:--|:--|
| `url`, `dispositivo`, `token` | `ws://localhost:8080/ws/telemetria`, `sim-01`, `T-VALIDO` | Backend e identificação |
| `labirinto`, `resultado`, `partida`, `semente` | `4x4`, `sucesso`, `oeste`, aleatória | A corrida |
| `taxa` | `20` | Mensagens por segundo; `0` = sem pausa |
| `boot` | aleatório | 6 dígitos hexadecimais, como no firmware |
| `buffer` | `{ retencaoMs: 60000, maxMensagens: 4000 }` | Buffer circular, como o `TelemetryBuffer` do firmware |
| `reenviar` | `true` | Reenviar o buffer depois de cada `hello` |
| `atrasoRede` | sem atraso | `{ minimoMs, maximoMs }`, ou um número `n` (de 0 a `n` ms) |
| `tensoes` | curva normal | Lista de tensões em degraus (5 a 9 V) |
| `criarSocket` | `ws` com o pong controlado | Troca o WebSocket (testes) |

### Membros

| Membro | O que é |
|:--|:--|
| `conectar()` | Abre a conexão e envia o `hello` e, se `reenviar`, o buffer. Falha com `ErroSimulador` se não conseguir conectar ou se já estiver conectado |
| `iniciarCorrida(roteiro?)` | Gera e envia uma corrida no ritmo de `taxa`, com as falhas do `roteiro` (abaixo). Aceita também só a função de progresso, como na Fase 1. Devolve o resumo |
| `aguardarConfirmacao(sequencia, prazoMs = 5000, corrida?)` | Espera o `ack` da `sequencia` (ou de uma maior) da última corrida, ou da `corrida` informada. Falha com `ErroSimulador` se a conexão fechar antes (o erro traz o `fechamento`, por exemplo `4001`) ou se o prazo acabar |
| `gerarCorrida()` | Só gera as mensagens da próxima corrida, sem enviar |
| `emitir(msg)` | Emite uma mensagem da corrida **como o robô**: ela entra no buffer e sai pelo socket se o enlace estiver no ar. Devolve `false` quando ficou só no buffer |
| `enviar(msg)` | Envia direto pelo socket, **sem** buffer: um objeto do protocolo ou qualquer texto, até inválido |
| `derrubar()` | Queda: corta o TCP sem o fechamento do WebSocket (o backend vê `1006`). O robô continua emitindo para o buffer |
| `reconectar()` | Derruba a conexão, se aberta, e conecta de novo com o mesmo `boot` (hello e buffer) |
| `silenciar()`, `retomar()` | Perda de sinal com a conexão aberta: sem mensagens e sem pong. `retomar()` envia `hello` e buffer na mesma conexão |
| `reiniciar({ boot?, duracaoMs? })` | Reinício do robô: derruba, troca o `boot`, apaga o buffer, zera o relógio e a numeração das corridas e conecta de novo depois de `duracaoMs` (padrão: 1000) |
| `contiguaEnviada(corrida?)` | Maior sequência que saiu pelo socket junto com todas as anteriores: o maior `ack` possível |
| `encerrar()` | Espera sair o que está no atraso de rede e fecha a conexão (código 1000) |
| `acks` | Os `ack` recebidos, na ordem de chegada (o `ack` é cumulativo: vale o maior) |
| `enviadas`, `recebidas` | Tudo o que saiu e chegou pelo socket, como texto, inclusive os `hello` e os reenvios |
| `buffer` | O que está no buffer de retransmissão agora |
| `fechamento`, `fechamentos` | Como terminou a conexão atual (ou `null`) e cada uma das anteriores |
| `conectado`, `silenciado` | Estado do enlace |
| `boot`, `semente`, `labirinto` | O `boot` atual (muda no reinício), a semente usada e o labirinto gerado |

Cada `iniciarCorrida()` no mesmo simulador é uma nova corrida do mesmo boot: `r<boot>-1`, `r<boot>-2`…, com a `sequencia` recomeçando em 1. Depois de um reinício, a numeração recomeça em `r<boot novo>-1`.

### Roteiro de falhas

```ts
const corrida = await sim.iniciarCorrida({
  quedas: [{ apos: 120, retorno: 401 }], // cai depois da 120 e volta antes da 401
  silencios: [{ apos: 500, duracaoMs: 4000 }], // 4 s sem mensagens e sem pong
  anomalias: [{ tipo: 'duplicada', sequencia: 30 }, { tipo: 'nao-json' }],
  // reinicioApos: 200, // reinicia o robô depois da 200 (a corrida fica sem fim)
  // duracaoReinicioMs: 0, // e reconecta sem esperar (padrão: 1000; só com reinicioApos)
});
```

Uma queda ou um silêncio começa logo depois de o robô emitir a sequência `apos` e termina antes da primeira mensagem em que valem as duas condições: já passou `duracaoMs` (se informado) e a próxima sequência é `≥ retorno` (se informado). Sem nenhuma das duas, volta já na mensagem seguinte. Se a corrida acabar antes, o simulador espera o resto da duração e volta no fim, enviando o que ficou no buffer. O `retorno` torna o cenário independente da `taxa`, e é o que os testes usam.

O resumo devolvido traz, além do da Fase 1: `total` (mensagens da corrida), `mensagens` (as que o robô emitiu; menor que `total` só num reinício), `contiguaEnviada`, `reenviadas`, `interrupcoes`, `reiniciou` e as `anomalias` aplicadas.

### Exemplos por caso de teste

```ts
// CT-BE-04, com os números do caso de teste: buffer de 300 mensagens guarda de 101 a 400
// (o 4x4 da semente 42 tem 470 mensagens, então a 401 existe)
const sim = criarSimulador({ url, labirinto: '4x4', semente: 42, taxa: 0, buffer: { maxMensagens: 300 } });
await sim.conectar();
const corrida = await sim.iniciarCorrida({ quedas: [{ apos: 120, retorno: 401 }] });
await sim.aguardarConfirmacao(corrida.mensagens); // sem lacunas; duplicadas +20

// CT-BE-04, variante sem reenvio: seqs_faltantes = 280 (121 a 400)
const semReenvio = criarSimulador({ url, labirinto: '4x4', semente: 42, taxa: 0, reenviar: false });
await semReenvio.conectar();
const c = await semReenvio.iniciarCorrida({ quedas: [{ apos: 120, retorno: 401 }] });
await semReenvio.aguardarConfirmacao(c.contiguaEnviada); // 120

// CT-BE-05: passo a passo, com as funções de anomalias.ts
import { semCampo, textoNaoJson, tipoDesconhecido } from '../../simulador/anomalias.js';
const gerada = sim.gerarCorrida();
for (const m of gerada.mensagens.slice(0, 10)) sim.emitir(m);
const celula = gerada.mensagens.find((m) => m.tipo === 'celula' && m.sequencia > 10)!;
sim.enviar(semCampo(celula)); // sem `paredes`
sim.enviar(textoNaoJson());
sim.enviar(tipoDesconhecido(celula)); // tipo "teleporte"

// CT-BE-13: a corrida termina fora do ar; o lote tardio chega depois da interrupção
await sim.derrubar();
for (const m of gerada.mensagens.slice(10)) sim.emitir(m); // só para o buffer
// ... esperar os 120 s (ou adiantar o relógio do backend) ...
await sim.reconectar(); // hello + buffer, com o fim_corrida

// CT-BE-03: silêncio com o TCP aberto
sim.silenciar();
// ... o painel deve receber `sinal PERDIDO` entre 3 e 4 s depois ...
sim.retomar();

// CT-BE-14: reinício
await sim.reiniciar({ boot: 'b2' });
```

As outras funções avulsas de [`anomalias.ts`](anomalias.ts) são `labirintoInvalido`, `foraDoLabirinto`, `comTensao` e `comTempo`.

## O que é gerado

O formato segue o firmware (`main.cpp`, `TelemetryEmitter` e `ProtocolV1`):

| Item | Como é |
|:--|:--|
| `hello` | `dispositivo`, `token` e `boot` de 6 dígitos hexadecimais, aleatório a cada execução. Enviado a cada conexão e a cada volta do sinal |
| Id da corrida | `r<boot>-<n>` |
| `tempo_ms` | Relógio do robô: milissegundos desde o "boot" |
| Início | `inicio_corrida` (sequência 1), `estado MAPEANDO` e a `celula` de partida |
| A cada 100 ms | `posicao` e `energia`, como o ciclo de telemetria do firmware (cerca de 20 mensagens/s) |
| A cada célula | `celula`, com as quatro paredes |
| Fim, com sucesso | `fim_corrida sucesso` ao chegar. Não há `estado CONCLUIDO`, porque no firmware a fase vira `Returning`, que também é `MAPEANDO` |
| Fim, com falha | O robô para entre 30 % e 70 % do caminho. Depois de 1,5 s: `estado ERRO` e `fim_corrida falha` com `detalhe` |
| Velocidade média | Não é enviada, como no firmware (`snapshot.speed.reset()`) |
| Bateria | Cai de cerca de 8,2 V para cerca de 7,4 V ao longo da corrida, com queda maior quando os motores estão ligados e um pequeno ruído. Sempre entre 5 e 9 V. A corrente varia entre parado (≈ 0,12 A), andando (≈ 0,38 A) e girando (≈ 0,45 A). Com `tensoes`, a tensão segue a lista |
| Tempos de movimento | 720 ms por célula (180 mm a cerca de 0,25 m/s), 400 ms por giro de 90° e 750 ms por meia-volta |
| Buffer | Toda mensagem da corrida, por 60 s no relógio do robô ou até 4 000 mensagens, como o `TelemetryBuffer(60000, 4000)` do firmware. Não é apagado entre corridas, só no reinício |

### Labirinto e percurso

- **Coordenadas** iguais às do protocolo e do firmware: `x` é a coluna (cresce para o leste), `y` é a linha (cresce para o sul). A partida e a chegada seguem o `DipDecoder`: a chegada é o canto diagonal oposto à partida, na linha 0.
- **Labirinto** gerado pelo algoritmo de Kruskal a partir da semente, com alguns caminhos alternativos. A partida é um canto sem saída, aberto só para o norte. As paredes são guardadas por aresta, como no `MazeMap` do firmware, então as paredes de células vizinhas são sempre consistentes.
- **Percurso** igual ao `Navigator` do firmware: o robô sai virado para o norte, conhece só o perímetro, lê frente, esquerda e direita em cada célula e segue o flood fill, tratando parede desconhecida como aberta. Por isso ele entra em becos e volta, e as revisitas aparecem como no robô real.

## Arquivos

| Arquivo | Responsabilidade |
|:--|:--|
| [`aleatorio.ts`](aleatorio.ts) | Números pseudoaleatórios com semente (mulberry32), `boot` e semente aleatórios |
| [`labirinto.ts`](labirinto.ts) | Coordenadas, direções, paredes por aresta e geração do labirinto |
| [`percurso.ts`](percurso.ts) | Exploração com flood fill, igual ao `Navigator` do firmware |
| [`corrida.ts`](corrida.ts) | Percurso → mensagens do protocolo, com tempos, ciclo de telemetria e bateria (ou tensões fixas). Função pura |
| [`buffer.ts`](buffer.ts) | Buffer circular de retransmissão, igual ao `TelemetryBuffer` do firmware |
| [`anomalias.ts`](anomalias.ts) | Mensagens problemáticas avulsas e o plano de envio com anomalias. Funções puras |
| [`enlace.ts`](enlace.ts) | Socket `ws` com o pong controlado e a queda sem fechamento, e a fila do atraso de rede |
| [`simulador.ts`](simulador.ts) | API programática: conexão, ritmo de envio, buffer, roteiro de falhas, registro dos `ack` e `aguardarConfirmacao()` |
| [`cli.ts`](cli.ts) | Linha de comando (`npm run simulador`) |

## Testes

| Onde | O que verifica |
|:--|:--|
| [`../testes/unit/simulador/`](../testes/unit/simulador/) `labirinto`, `percurso`, `corrida` | Labirinto (perímetro, consistência, conectividade), percurso (células vizinhas, sem atravessar parede, chegada) e mensagens (esquema v1, sequência contígua, tempo não decrescente, nenhum silêncio de 1 s, faixa de tensão, degraus de tensão) |
| `buffer`, `anomalias` | Retenção e limite do buffer. Cada anomalia rejeitada com o motivo certo pelo mesmo caminho da ingestão (JSON → esquema → regras de domínio), e o plano de envio com cada válida uma única vez |
| `simulador`, `falhas` | A API contra um servidor WebSocket local que registra cada conexão: `hello`, reenvio, queda com `1006`, silêncio sem pong, reinício, atraso FIFO e dois simuladores |
| `cenarios` | Cada cenário contra o backend de verdade (gateway, ingestão e corrida) com as portas em memória, com os resultados dos CT-BE-03, 04, 05 a 08, 13, 14, 15, 17, 18, 19 e 21 |
| [`../testes/e2e/`](../testes/e2e/) | Simulador → backend completo → PostgreSQL 16 real (Testcontainers): CT-BE-01, 04, 05 a 07, 14 e 21. Rodar com `npm run test:e2e` (requer Docker) |
