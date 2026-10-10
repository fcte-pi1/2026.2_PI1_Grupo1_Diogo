# Protocolo de telemetria v1

Esquemas oficiais (JSON Schema 2020-12) das mensagens que **chegam** ao backend. Eles são publicados no repositório conforme o RNF-57 e usados pelo validador Ajv do backend ([`../validador.ts`](../validador.ts), RF-75). Os tipos TypeScript equivalentes, incluindo as mensagens que o backend envia ao painel, estão em [`../tipos.ts`](../tipos.ts).

| Esquema | Quem envia | Quando |
|:--|:--|:--|
| [`hello`](hello.schema.json) | Robô | Primeira mensagem de cada conexão Bluetooth (autenticação, RF-72) |
| [`inicio_corrida`](inicio_corrida.schema.json) | Robô | Início da tentativa |
| [`celula`](celula.schema.json) | Robô | Ao entrar numa célula, com as paredes detectadas (evento discreto) |
| [`posicao`](posicao.schema.json) | Robô | Periódica (dado contínuo) |
| [`energia`](energia.schema.json) | Robô | Periódica, leitura do INA219 (dado contínuo) |
| [`estado`](estado.schema.json) | Robô | A cada transição de estado de navegação (evento discreto) |
| [`fim_corrida`](fim_corrida.schema.json) | Robô | Fim da tentativa |
| [`painel-entrada`](painel-entrada.schema.json) | Painel | Inscrever-se ou cancelar inscrição |
| [`comum`](comum.schema.json) | — | Definições compartilhadas (envelope, paredes, coordenadas) |

## Transporte

```
 Robô (ESP32) ──Bluetooth Clássico (SPP)──► Ponte (notebook) ──WebSocket──► Backend ──WebSocket──► Painéis
                uma mensagem JSON por linha    src/backend/ponte     /ws/telemetria          /ws/painel
```

**Do robô até o notebook: Bluetooth Clássico, perfil de porta serial (SPP).**
- Cada mensagem é um objeto JSON em **uma única linha**, em UTF-8, terminada por `\n` (um `\r` antes é tolerado). O JSON não pode conter quebras de linha.
- Cada linha tem no máximo **1024 bytes**. Linhas maiores são descartadas pela ponte.
- O robô é um **emissor unidirecional** (RF-027 do firmware): ele só escreve na serial. Nada do que o backend envia chega ao robô.
- A cada conexão Bluetooth aceita (evento de cliente conectado do `BluetoothSerial`), a **primeira linha** enviada pelo robô é o `hello`.

**Do notebook até o backend: a ponte.**
- A [ponte](../../ponte/README.md) é um programa que roda no notebook do operador, **fora do Docker**, porque o container não enxerga o Bluetooth do computador. Ela lê a porta serial e repassa cada linha, sem alterar, como uma mensagem WebSocket em `/ws/telemetria`.
- Para o backend, a ponte é igual a um robô conectado direto. O **simulador** fala WebSocket direto com `/ws/telemetria`, sem ponte, usando as mesmas mensagens.
- O backend responde com `ack {corrida, sequencia}`, que é **informativo**: a ponte apenas o conta. O backend fecha a conexão com o código `4001` (dispositivo ou token inválido) ou `4002` (versão não suportada), e a ponte mostra o erro no terminal.

**Perda de sinal.** O backend considera o sinal perdido quando passa **3 s sem receber nenhuma mensagem** durante uma corrida, ou quando a conexão fecha. Por isso, durante a corrida, o robô deve enviar **pelo menos uma mensagem por segundo** (as mensagens periódicas `posicao` e `energia` já garantem isso).

## Envelope

Todas as mensagens do robô, exceto `hello`, levam:

| Campo | Tipo | Regra |
|:--|:--|:--|
| `versao` | inteiro | Versão do protocolo: `1` |
| `tipo` | texto | Um dos tipos da tabela acima |
| `corrida` | texto | Id da corrida gerado pelo robô: 1 a 64 caracteres em `[A-Za-z0-9_-]`, único por dispositivo |
| `sequencia` | inteiro | ≥ 1, contígua e crescente **por corrida** (o `inicio_corrida` é a `sequencia` 1) |
| `tempo_ms` | inteiro | Milissegundos no relógio do robô (ex.: `millis()`), não decrescente dentro da corrida. É o **relógio oficial** da corrida (RF-82) |

Campos não previstos no esquema são **rejeitados**. Isso pega erros de digitação no firmware. Campos novos entram numa nova versão do protocolo.

**As chaves são escritas por extenso, sem abreviações** (`versao`, `sequencia`, `tempo_ms`, `norte`), em minúsculas, sem acento e com `_` entre as palavras. O sufixo indica a unidade no símbolo do SI: `_ms` (milissegundos), `_v` (volts), `_a` (ampères), `_w` (watts), `_mps` (metros por segundo). As coordenadas `x` e `y` mantêm o nome matemático.

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
- **Tipo `CxL`:** `C` colunas (comprimento: 4, 8 ou 12) × `L` linhas (largura: sempre 4). Por exemplo, `8x4` tem `x ∈ [0, 7]` e `y ∈ [0, 3]`, como no `DipDecoder` do firmware (`Medium8x4` = 4 linhas × 8 colunas).
- As coordenadas são **absolutas no labirinto**. O canto de partida (RF-99) é só a primeira célula informada. Pelo `DipDecoder`, é `(0, 3)` ou `(C−1, 3)`.
- O esquema aceita `x` e `y` entre 0 e 11. O limite exato para cada tipo é uma **regra de domínio** (RF-76), verificada pelo backend.

### Paredes e orientação

- `paredes: {norte, leste, sul, oeste}`, em que `true` significa parede **presente** naquele lado da célula.
- `orientacao` assume `NORTE`, `LESTE`, `SUL` ou `OESTE`, que é para onde a frente do robô aponta.
- **Uma `celula` só é enviada depois que os quatro lados foram lidos.** No banco, as paredes são gravadas como bits: norte = 1, leste = 2, sul = 4, oeste = 8.

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
- `tempo_ms` não decrescente dentro da corrida;
- célula vizinha da anterior.

## Exemplo de corrida

Cada linha abaixo é uma linha enviada pelo robô na serial Bluetooth:

```json
{"tipo":"hello","versao":1,"dispositivo":"rato-01","token":"<token>","boot":"9f3a1c"}
{"versao":1,"tipo":"inicio_corrida","corrida":"r9f3a1c-1","sequencia":1,"tempo_ms":12000,"labirinto":"4x4"}
{"versao":1,"tipo":"estado","corrida":"r9f3a1c-1","sequencia":2,"tempo_ms":12001,"estado":"MAPEANDO"}
{"versao":1,"tipo":"celula","corrida":"r9f3a1c-1","sequencia":3,"tempo_ms":12010,"x":0,"y":3,"paredes":{"norte":false,"leste":true,"sul":true,"oeste":true}}
{"versao":1,"tipo":"posicao","corrida":"r9f3a1c-1","sequencia":4,"tempo_ms":12100,"x":0,"y":3,"orientacao":"NORTE","celulas":0,"velocidade_media_mps":0}
{"versao":1,"tipo":"energia","corrida":"r9f3a1c-1","sequencia":5,"tempo_ms":12100,"tensao_v":8.12,"corrente_a":0.41,"potencia_w":3.33}
{"versao":1,"tipo":"celula","corrida":"r9f3a1c-1","sequencia":6,"tempo_ms":13450,"x":0,"y":2,"paredes":{"norte":false,"leste":false,"sul":false,"oeste":true}}
...
{"versao":1,"tipo":"fim_corrida","corrida":"r9f3a1c-1","sequencia":812,"tempo_ms":95500,"resultado":"sucesso"}
```

A maior mensagem (`celula`) tem cerca de 160 bytes. A 20 mensagens por segundo, são cerca de 3 kB/s, bem abaixo do que o Bluetooth Clássico suporta.

## Requisitos para o firmware

- **Uma mensagem por linha:** `serializeJson(...)` seguido de `\n`, sem JSON formatado em várias linhas.
- **`hello` primeiro:** enviado sempre que um cliente Bluetooth conecta, antes de qualquer outra mensagem.
- **Carga útil do RF-026:** os sete campos são cobertos por `posicao` (posição, contador de células, velocidade média), `energia` (tensão, corrente, potência) e `estado` (estado de navegação, enviado a cada transição).
- **Pelo menos uma mensagem por segundo durante a corrida**, para o backend não declarar perda de sinal.
- **Reenvio após queda (RF-74):** para não haver lacunas após uma queda de até 60 s, o robô deve manter um **buffer circular com pelo menos 60 s** de mensagens. Quando o Bluetooth reconectar, ele envia o `hello` com o **mesmo `boot`** e reenvia o buffer inteiro. Isso é só emissão: as duplicatas são descartadas pelo backend (RF-77).
- **Novo `boot` a cada reinício:** um `boot` novo durante uma corrida faz o backend marcá-la como `INTERROMPIDA (REINICIO_ROBO)`.
