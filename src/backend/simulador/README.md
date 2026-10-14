# Simulador de robô

Simulador em Node/TypeScript que fala o mesmo protocolo do robô (RNF-53). Com ele dá para desenvolver e testar o backend e o painel **sem hardware**. É a ferramenta dos testes E2E do backend (CT-BE), dos testes do painel (#330) e das demonstrações.

Ele se conecta direto em `/ws/telemetria`, sem a ponte BLE, e envia as mesmas mensagens que o robô envia: o `hello` e depois uma corrida completa, de `inicio_corrida` a `fim_corrida`. Os tipos vêm de [`../protocolo/tipos.ts`](../protocolo/tipos.ts), e os testes verificam cada mensagem gerada com o validador do protocolo v1 ([`../protocolo/validador.ts`](../protocolo/validador.ts)).

> **Regra de ouro:** como o robô real, o simulador é um **emissor unidirecional**. Nenhum passo depende do que o backend responde. Os `ack` recebidos são apenas guardados, para os testes poderem verificá-los.

## Uso pela linha de comando

Com o ambiente no ar (`docker compose up`) e o seed aplicado (`docker compose exec backend npm run seed`):

```bash
docker compose exec backend npm run simulador -- --labirinto 4x4
```

No computador, fora do Docker, depois de `npm install` em `src/backend`, o comando é o mesmo, sem o `docker compose exec backend`.

| Opção | Padrão | O que faz |
|:--|:--|:--|
| `--url <url>` | `ws://localhost:8080/ws/telemetria` | Endereço do backend |
| `--dispositivo <id>` | `sim-01` | Identificador cadastrado no backend (o seed cria o `sim-01`) |
| `--token <token>` | `T-VALIDO` | Token do dispositivo |
| `--labirinto <tipo>` | `4x4` | `4x4`, `8x4` ou `12x4` |
| `--taxa <n>` | `20` | Mensagens por segundo. `20` é o ritmo do robô; `0` envia sem pausas |
| `--resultado <r>` | `sucesso` | `sucesso` ou `falha` |
| `--semente <n>` | aleatória | Inteiro de 0 a 4294967295. A mesma semente repete o mesmo labirinto e o mesmo percurso |
| `--partida <canto>` | `oeste` | Canto de partida, como o DIP 3 do robô: `oeste` = (0, 3) e `leste` = (C−1, 3) |
| `--ajuda`, `-h` | | Mostra a ajuda |

### Cenários

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
02:52:26.252 [simulador] sim-01 · boot 55aac8 · labirinto 4x4 · semente 2039099253 (repita com --semente 2039099253)
02:52:26.253 [simulador] conectando em ws://localhost:8080/ws/telemetria
02:52:26.313 [simulador] conectado, hello enviado
02:52:31.314 [simulador] enviadas 100/168 · acks 97 · último ack 100
02:52:35.670 [simulador] corrida r55aac8-1 (sucesso): 168 mensagens, 8 células percorridas (1 revisitas), 7.7 s no relógio do robô
02:52:35.670 [simulador] acks recebidos: 165 · último ack 168 de 168
```

O comando termina com código `0` quando a corrida é enviada inteira e com `1` em caso de erro: backend fora do ar, `hello` recusado (`4001`, `4002`, `4003`) ou opção inválida.

## Uso pela API (testes E2E e Playwright)

```ts
import { criarSimulador } from '../../simulador/simulador.js';

const sim = criarSimulador({ url, labirinto: '4x4', taxa: 0, semente: 1 });
await sim.conectar(); // abre a conexão e envia o hello
const corrida = await sim.iniciarCorrida(); // envia a corrida inteira
await sim.encerrar(); // fecha com o código 1000

expect(sim.acks.at(-1)).toEqual({ tipo: 'ack', corrida: corrida.corrida, sequencia: corrida.mensagens });
```

| Membro | O que é |
|:--|:--|
| `conectar()` | Abre a conexão e envia o `hello`. Falha com `ErroSimulador` se não conseguir conectar |
| `iniciarCorrida(aoProgredir?)` | Gera e envia uma corrida completa no ritmo de `taxa`. Devolve o resumo (`corrida`, `mensagens`, `passos`, `revisitas`, `duracaoMs`). Falha com `ErroSimulador` se o backend fechar a conexão no meio |
| `gerarCorrida()` | Só gera as mensagens da próxima corrida, sem enviar |
| `enviar(msg)` | Envia uma mensagem do protocolo ou **qualquer texto**, até inválido (para os casos de mensagem malformada) |
| `encerrar()` | Fecha a conexão e espera o fechamento |
| `acks` | Os `ack` recebidos, na ordem de chegada |
| `enviadas`, `recebidas` | Tudo o que foi enviado e recebido, como texto |
| `fechamento` | `{ codigo, motivo }` de como a conexão terminou, ou `null` |
| `boot`, `semente`, `labirinto` | O `boot` desta execução, a semente usada e o labirinto gerado |

Cada `iniciarCorrida()` no mesmo simulador é uma nova corrida do mesmo boot: `r<boot>-1`, `r<boot>-2`…, com a `sequencia` recomeçando em 1.

## O que é gerado

O formato segue o firmware (`main.cpp`, `TelemetryEmitter` e `ProtocolV1`):

| Item | Como é |
|:--|:--|
| `hello` | `dispositivo`, `token` e `boot` de 6 dígitos hexadecimais, aleatório a cada execução |
| Id da corrida | `r<boot>-<n>` |
| `tempo_ms` | Relógio do robô: milissegundos desde o "boot" |
| Início | `inicio_corrida` (sequência 1), `estado MAPEANDO` e a `celula` de partida |
| A cada 100 ms | `posicao` e `energia`, como o ciclo de telemetria do firmware (cerca de 20 mensagens/s) |
| A cada célula | `celula`, com as quatro paredes |
| Fim, com sucesso | `fim_corrida sucesso` ao chegar. Não há `estado CONCLUIDO`, porque no firmware a fase vira `Returning`, que também é `MAPEANDO` |
| Fim, com falha | O robô para entre 30 % e 70 % do caminho. Depois de 1,5 s: `estado ERRO` e `fim_corrida falha` com `detalhe` |
| Velocidade média | Não é enviada, como no firmware (`snapshot.speed.reset()`) |
| Bateria | Cai de cerca de 8,2 V para cerca de 7,4 V ao longo da corrida, com queda maior quando os motores estão ligados e um pequeno ruído. Sempre entre 5 e 9 V. A corrente varia entre parado (≈ 0,12 A), andando (≈ 0,38 A) e girando (≈ 0,45 A) |
| Tempos de movimento | 720 ms por célula (180 mm a cerca de 0,25 m/s), 400 ms por giro de 90° e 750 ms por meia-volta |

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
| [`corrida.ts`](corrida.ts) | Percurso → mensagens do protocolo, com tempos, ciclo de telemetria e bateria. Função pura |
| [`simulador.ts`](simulador.ts) | API programática: conexão WebSocket, ritmo de envio e registro dos `ack` |
| [`cli.ts`](cli.ts) | Linha de comando (`npm run simulador`) |

Os testes ficam em [`../testes/unit/simulador/`](../testes/unit/simulador/). Eles verificam o labirinto (perímetro, consistência, conectividade), o percurso (células vizinhas, sem atravessar parede, chegada) e as mensagens (esquema v1, sequência contígua, tempo não decrescente, nenhum silêncio de 1 s, faixa de tensão). Também testam a API contra um servidor WebSocket local.

## Próximos passos (Fase 2 da #322)

Os cenários de falha ainda não estão implementados: buffer de 60 s com reenvio ao reconectar, queda e reconexão, reinício com novo `boot`, silenciar o pong, mensagens duplicadas, fora de ordem, malformadas ou fisicamente impossíveis, sequência de tensões configurável, atraso de rede e dois simuladores simultâneos. Silenciar o pong vai exigir a biblioteca `ws`, porque o `WebSocket` nativo do Node não dá acesso ao ping/pong.
