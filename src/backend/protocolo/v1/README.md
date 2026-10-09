# Protocolo de telemetria v1

Esquemas oficiais (JSON Schema 2020-12) das mensagens que **chegam** ao backend. Eles são publicados no repositório conforme o RNF-57 e usados pelo validador Ajv do backend ([`../validador.ts`](../validador.ts), RF-75). Os tipos TypeScript equivalentes, incluindo as mensagens que o backend envia ao painel, estão em [`../tipos.ts`](../tipos.ts).

| Esquema | Quem envia | Quando |
|:--|:--|:--|
| [`hello`](hello.schema.json) | Robô | Primeira mensagem de cada conexão (autenticação, RF-72) |
| [`inicio_corrida`](inicio_corrida.schema.json) | Robô | Início da tentativa |
| [`celula`](celula.schema.json) | Robô | Ao entrar numa célula, com as paredes detectadas (evento discreto) |
| [`posicao`](posicao.schema.json) | Robô | Periódica (dado contínuo) |
| [`energia`](energia.schema.json) | Robô | Periódica, leitura do INA219 (dado contínuo) |
| [`estado`](estado.schema.json) | Robô | A cada transição de estado de navegação (evento discreto) |
| [`fim_corrida`](fim_corrida.schema.json) | Robô | Fim da tentativa |
| [`painel-entrada`](painel-entrada.schema.json) | Painel | Inscrever-se ou cancelar inscrição |
| [`comum`](comum.schema.json) | — | Definições compartilhadas (envelope, paredes, coordenadas) |

## Transporte

- WebSocket, com uma mensagem JSON (UTF-8) por *frame* de texto.
- O robô conecta em `ws://<notebook-do-operador>:8080/ws/telemetria`, e o painel em `/ws/painel`.
- O robô é um **emissor unidirecional** (RF-027 do firmware). O backend responde com `ack {corrida, seq}`, que é **informativo**, e responde ao *ping* com um *frame* de controle tratado pela pilha WebSocket do ESP32. Nenhuma resposta de aplicação é exigida do robô.
- O backend fecha a conexão com o código `4001` (token inválido) ou `4002` (versão não suportada).

## Envelope

Todas as mensagens do robô, exceto `hello`, levam:

| Campo | Tipo | Regra |
|:--|:--|:--|
| `v` | inteiro | Versão do protocolo: `1` |
| `tipo` | texto | Um dos tipos da tabela acima |
| `corrida` | texto | Id da corrida gerado pelo robô: 1 a 64 caracteres em `[A-Za-z0-9_-]`, único por dispositivo |
| `seq` | inteiro | ≥ 1, contíguo e crescente **por corrida** (o `inicio_corrida` é o `seq` 1) |
| `t` | inteiro | Milissegundos no relógio do robô (ex.: `millis()`), não decrescente dentro da corrida. É o **relógio oficial** da corrida (RF-82) |

Campos não previstos no esquema são **rejeitados**. Isso pega erros de digitação no firmware. Campos novos entram numa nova versão do protocolo.

## Convenções

### Coordenadas

```
            Norte (y = 0)
      x=0   x=1   x=2  ...  x=C−1
 y=0  ┌─────┬─────┬─────┬───┐
 y=1  ├─────┼─────┼─────┼───┤
 y=2  ├─────┼─────┼─────┼───┤
 y=3  └─────┴─────┴─────┴───┘
            Sul (y = L−1)
  Oeste ◄                 ► Leste
```

- **`x` é a coluna** e cresce para o **Leste**. **`y` é a linha** e cresce para o **Sul**: a linha `0` é a borda **Norte**. Essa é a mesma convenção do `MazeMap` do firmware (`Position{row = y, column = x}`, em que `North` faz `row − 1`).
- **Tipo `CxL`:** `C` colunas (comprimento: 4, 8 ou 12) × `L` linhas (largura: sempre 4). Por exemplo, `8x4` tem `x ∈ [0, 7]` e `y ∈ [0, 3]`.
- As coordenadas são **absolutas no labirinto**. O canto de partida (RF-99) é só a primeira célula informada.
- O esquema aceita `x` e `y` entre 0 e 11. O limite exato para cada tipo é uma **regra de domínio** (RF-76), verificada pelo backend.

### Paredes e orientação

- `paredes: {n, l, s, o}`, em que `true` significa parede **presente** no lado **Norte, Leste, Sul ou Oeste** da célula.
- `orientacao` assume `N`, `L`, `S` ou `O`, que é para onde a frente do robô aponta.
- **Uma `celula` só é enviada depois que os quatro lados foram lidos.** No banco, as paredes são gravadas como bits: `N=1`, `L=2`, `S=4`, `O=8`.

### Valores enumerados

Os valores enumerados ficam em **ASCII e maiúsculas**, sem acento (`CONCLUIDO`, não `Concluído`), para não depender de codificação no firmware. A acentuação existe apenas na tela do painel.

| Campo | Valores |
|:--|:--|
| `inicio_corrida.labirinto` | `4x4`, `8x4`, `12x4` |
| `estado.estado` | `INICIALIZANDO`, `AGUARDANDO`, `MAPEANDO`, `RESOLVENDO`, `CONCLUIDO`, `ERRO` |
| `fim_corrida.resultado` | `sucesso`, `falha` (com `detalhe` opcional de até 200 caracteres) |

### O que é forma e o que é domínio

O esquema valida **a forma** da mensagem. As regras abaixo são **de domínio** (RF-76) e são verificadas depois, pelo backend:

- coordenada dentro do labirinto da corrida;
- tensão entre 5,0 e 9,0 V;
- `t` não decrescente dentro da corrida;
- célula vizinha da anterior.

## Exemplo de corrida

```json
{"tipo":"hello","v":1,"dispositivo":"rato-01","token":"<token>","boot":"9f3a1c"}
{"v":1,"tipo":"inicio_corrida","corrida":"r9f3a1c-1","seq":1,"t":12000,"labirinto":"4x4"}
{"v":1,"tipo":"estado","corrida":"r9f3a1c-1","seq":2,"t":12001,"estado":"MAPEANDO"}
{"v":1,"tipo":"celula","corrida":"r9f3a1c-1","seq":3,"t":12010,"x":0,"y":3,"paredes":{"n":false,"l":true,"s":true,"o":true}}
{"v":1,"tipo":"posicao","corrida":"r9f3a1c-1","seq":4,"t":12100,"x":0,"y":3,"orientacao":"N","celulas":0,"velocidade_media_mps":0}
{"v":1,"tipo":"energia","corrida":"r9f3a1c-1","seq":5,"t":12100,"tensao_v":8.12,"corrente_a":0.41,"potencia_w":3.33}
{"v":1,"tipo":"celula","corrida":"r9f3a1c-1","seq":6,"t":13450,"x":0,"y":2,"paredes":{"n":false,"l":false,"s":false,"o":true}}
...
{"v":1,"tipo":"fim_corrida","corrida":"r9f3a1c-1","seq":812,"t":95500,"resultado":"sucesso"}
```

## Requisitos para o firmware

- **Carga útil do RF-026:** os sete campos são cobertos por `posicao` (posição, contador de células, velocidade média), `energia` (tensão, corrente, potência) e `estado` (estado de navegação, enviado a cada transição).
- **Reenvio após queda (RF-74):** para não haver lacunas após uma queda de até 60 s, o robô deve manter um **buffer circular com pelo menos 60 s** de mensagens e, ao reconectar com o **mesmo `boot`**, enviar `hello` e reenviar o buffer inteiro. Isso é só emissão: duplicatas são descartadas pelo backend (RF-77).
- **Novo `boot` a cada reinício:** um `boot` novo durante uma corrida faz o backend marcá-la como `INTERROMPIDA (REINICIO_ROBO)`.
