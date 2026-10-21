# API HTTP v1

Rotas HTTP do backend consumidas pelo painel. Os tipos TypeScript estão em [`../tipos.ts`](../tipos.ts) e chegam ao frontend pelo alias `@protocolo`.

Este documento descreve o **contrato**. A implementação de cada rota está indicada na própria seção.

## `GET /api/corridas` — listagem do histórico

Lista as corridas gravadas, **da mais recente para a mais antiga** (RF-93, HU-BE-22). É a rota usada pela tela de histórico do painel (RF-65, RF-66).

*Implementação: #328. Enquanto ela não entra, a rota ainda não existe no backend.*

### Parâmetros de consulta

Todos são opcionais e podem ser combinados. Tipo: `FiltrosListaCorridas`.

| Parâmetro | Valores | Padrão | Significado |
|:--|:--|:--|:--|
| `tipo` | `4x4`, `8x4`, `12x4` | todos | Só corridas desse tipo de labirinto |
| `status` | `EM_ANDAMENTO`, `CONCLUIDA`, `FALHOU`, `INTERROMPIDA` | todos | Só corridas nesse status |
| `de` | data e hora em ISO 8601 | sem limite | Corridas iniciadas a partir desse instante |
| `ate` | data e hora em ISO 8601 | sem limite | Corridas iniciadas até esse instante |
| `pagina` | inteiro ≥ 1 | `1` | Página pedida |
| `tamanho` | inteiro de 1 a 100 | `20` | Itens por página. Um valor acima de 100 é **limitado a 100**, sem erro |

Para listar todos os tipos, **omita** o parâmetro `tipo`. Não existe o valor "todos".

Um parâmetro com valor inválido (por exemplo, `tipo=5x5` ou `pagina=0`) devolve `400`.

### Resposta `200`

Tipo: `RespostaListaCorridas`.

```json
{
  "itens": [
    {
      "id": "0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33",
      "iniciada_em": "2026-10-13T18:00:00.000Z",
      "tipo_labirinto": "8x4",
      "numero_tentativa": 3,
      "status": "CONCLUIDA",
      "motivo_termino": "SUCESSO",
      "tempo_conclusao_ms": 83500,
      "anulada": false
    }
  ],
  "total": 45,
  "pagina": 1,
  "tamanho": 20
}
```

| Campo | Tipo | Observação |
|:--|:--|:--|
| `itens` | lista de `CorridaResumo` | Vazia quando nada atende aos filtros ou a página passa do fim |
| `total` | inteiro | Corridas que atendem aos filtros, somando todas as páginas |
| `pagina` | inteiro | Página devolvida |
| `tamanho` | inteiro | Tamanho aplicado, já limitado a 100 |

Campos de cada item (`CorridaResumo`):

| Campo | Tipo | Observação |
|:--|:--|:--|
| `id` | texto (UUID) | Id da corrida no backend. É o usado em `/historico/:id` e em `/api/corridas/{id}` |
| `iniciada_em` | texto, ISO 8601 em UTC | Instante em que o backend recebeu a corrida. A tela converte para o horário local |
| `tipo_labirinto` | `4x4`, `8x4`, `12x4` ou `null` | `null` só quando o `inicio_corrida` ainda não chegou |
| `numero_tentativa` | inteiro ou `null` | `null` para corridas fora de uma apresentação |
| `status` | `EM_ANDAMENTO`, `CONCLUIDA`, `FALHOU`, `INTERROMPIDA` | Em ASCII; a acentuação fica na tela |
| `motivo_termino` | `SUCESSO`, `FALHA_REPORTADA`, `SEM_SINAL`, `REINICIO_ROBO` ou `null` | `null` enquanto a corrida está em andamento |
| `tempo_conclusao_ms` | inteiro ou `null` | Tempo oficial, pelo relógio do robô. Só existe para corridas concluídas com sucesso |
| `anulada` | booleano | Corrida anulada por um operador (RF-96) |

As chaves seguem o padrão do protocolo: minúsculas, sem acento, com `_` entre as palavras e a unidade no sufixo (`_ms`).

### Exemplos

```
GET /api/corridas
GET /api/corridas?tipo=8x4
GET /api/corridas?tipo=4x4&status=CONCLUIDA&pagina=2&tamanho=20
GET /api/corridas?de=2026-10-13T00:00:00Z&ate=2026-10-13T23:59:59Z
```

## `GET /api/corridas/{id}` — detalhe da corrida

Tudo o que o painel precisa para reexibir uma corrida: métricas, trajeto, série de energia, status e anulação (RF-84, RF-85). É usada pela página de detalhe do histórico (RF-67) e também durante uma corrida em andamento, para o painel completar o *snapshot* ao entrar ou reconectar (arquitetura do frontend, §4.3).

Tipo da resposta: `DetalheCorrida`.

### Respostas

| Código | Quando |
|:--|:--|
| `200` | A corrida existe |
| `400` | O `id` não é um UUID. O banco não chega a ser consultado |
| `404` | Não existe corrida com esse `id` |

Os erros usam o corpo padrão do Fastify, com um `code` para o painel tratar sem depender do texto:

```json
{ "statusCode": 404, "code": "CORRIDA_NAO_ENCONTRADA", "error": "Not Found", "message": "corrida não encontrada" }
{ "statusCode": 400, "code": "FST_ERR_VALIDATION", "error": "Bad Request", "message": "params/id must match pattern ..." }
```

### Exemplo

```json
{
  "id": "0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33",
  "corrida_robo": "r9f3a1c-1",
  "iniciada_em": "2026-10-14T18:00:00.000Z",
  "encerrada_em": "2026-10-14T18:00:09.120Z",
  "tipo_labirinto": "8x4",
  "numero_tentativa": null,
  "status": "CONCLUIDA",
  "motivo_termino": "SUCESSO",
  "detalhe_termino": null,
  "tempo_conclusao_ms": 9000,
  "anulada": false,
  "ultima_sequencia_contigua": 7,
  "sequencias_faltantes": 0,
  "metricas": {
    "tempo_decorrido_ms": 9000,
    "tempo_conclusao_ms": 9000,
    "celulas_percorridas": 2,
    "distancia_m": 0.36,
    "revisitas": 1,
    "velocidade_media_mps": 0.04,
    "tensao_inicial_v": 8.2,
    "tensao_final_v": 7.6,
    "delta_v": 0.6,
    "carga_inicial_pct": 87.5,
    "carga_final_pct": 50
  },
  "trajeto": [
    { "sequencia": 2, "ordem": 1, "x": 0, "y": 3, "paredes": { "norte": false, "leste": true, "sul": true, "oeste": true }, "tempo_ms": 1000, "revisita": false },
    { "sequencia": 4, "ordem": 2, "x": 0, "y": 2, "paredes": { "norte": true, "leste": false, "sul": false, "oeste": true }, "tempo_ms": 2800, "revisita": false },
    { "sequencia": 5, "ordem": 3, "x": 0, "y": 3, "paredes": { "norte": false, "leste": true, "sul": true, "oeste": true }, "tempo_ms": 4600, "revisita": true }
  ],
  "energia": [
    { "sequencia": 3, "tempo_ms": 1000, "tensao_v": 8.2, "corrente_a": 0.4, "potencia_w": 3.2 },
    { "sequencia": 6, "tempo_ms": 4600, "tensao_v": 7.6, "corrente_a": 0.4, "potencia_w": 3.2 }
  ],
  "anulacao": null
}
```

### Campos

Além dos campos de `CorridaResumo` (listagem):

| Campo | Tipo | Observação |
|:--|:--|:--|
| `corrida_robo` | texto | Id da corrida gerado pelo robô |
| `encerrada_em` | texto, ISO 8601, ou `null` | `null` enquanto a corrida está em andamento |
| `detalhe_termino` | texto ou `null` | Texto que o robô enviou no `fim_corrida`, quando houver |
| `ultima_sequencia_contigua` | inteiro | Maior sequência recebida sem lacunas antes dela |
| `sequencias_faltantes` | inteiro | Sequências que faltam abaixo da maior recebida (RNF-50) |
| `metricas` | `MetricasCorrida` | Abaixo |
| `trajeto` | lista de `PassagemCorrida` | Em ordem de `sequencia`, mesmo que as mensagens tenham chegado fora de ordem |
| `energia` | lista de `LeituraEnergiaCorrida` | Em ordem de `sequencia` |
| `anulacao` | `{ motivo, anulada_em, operador }` ou `null` | `operador` é o login de quem anulou |

`metricas` (`MetricasCorrida`):

| Campo | Observação |
|:--|:--|
| `tempo_decorrido_ms` | Do `inicio_corrida` ao `fim_corrida`; numa corrida em andamento, até a última mensagem gravada |
| `tempo_conclusao_ms` | Tempo oficial (RF-82). Só existe para corridas concluídas com sucesso |
| `celulas_percorridas` | Movimentos entre células: a soma da distância de Manhattan entre passagens seguidas. Entre células vizinhas, é 1 por passagem (as passagens menos a de partida). Se mensagens `celula` se perderam no caminho, o salto entre as passagens que chegaram conta o mínimo de células percorridas, e não 1 (#382). Compare com `sequencias_faltantes` |
| `distancia_m` | `celulas_percorridas` × 0,18 m |
| `revisitas` | Passagens por células já visitadas |
| `velocidade_media_mps` | Distância ÷ tempo, no relógio do robô (RF-83) |
| `tensao_inicial_v`, `tensao_final_v`, `delta_v` | Primeira e última leitura de tensão, e a diferença entre elas |
| `carga_inicial_pct`, `carga_final_pct` | Carga estimada pela curva tensão → carga (RF-85) |

Cada passagem do `trajeto` (`PassagemCorrida`) traz `sequencia`, `ordem` (posição no trajeto em ordem de `sequencia`, a partir de 1, sem repetições), `x`, `y`, `paredes` (`{ norte, leste, sul, oeste }`, com `true` para parede presente), `tempo_ms` (relógio do robô) e `revisita`. Para redesenhar o mapa, vale a última passagem de cada célula.

### Corrida em andamento

Os dados vêm do banco e acompanham a corrida com até cerca de 1 s de atraso: o trajeto e a energia são gravados assim que cada mensagem é aplicada, e as métricas no máximo uma vez por segundo. Para o tempo real, o painel usa o WebSocket (#327); este detalhe completa o que o painel não recebeu.

Por isso, numa corrida em andamento, **as `metricas` podem estar até 1 s atrás do `trajeto` e da `energia` da mesma resposta**: `celulas_percorridas` pode ser menor que `trajeto.length - 1`, por exemplo. O painel não deve cruzar esses valores; as métricas atuais chegam pelo WebSocket. Numa corrida encerrada, tudo está gravado e os valores batem.

## `GET /api/leaderboard` — ranking por tipo de labirinto

Corridas válidas de um tipo de labirinto, da melhor para a pior (RF-95, HU-BE-24). Só entram corridas `CONCLUIDA` e **não anuladas**: `FALHOU`, `INTERROMPIDA`, `EM_ANDAMENTO` e anuladas nunca aparecem.

Tipo da resposta: `RespostaLeaderboard`.

### Parâmetros de consulta

Tipo: `FiltrosLeaderboard`.

| Parâmetro | Valores | Obrigatório | Significado |
|:--|:--|:--|:--|
| `labirinto` | `4x4`, `8x4`, `12x4` | Sim | O ranking é sempre de um tipo de labirinto |
| `apresentacao` | UUID | Não | Só as corridas dessa apresentação. Sem ele, todas |

Sem `labirinto`, ou com um valor inválido (`labirinto=5x5`, `apresentacao=1`), a resposta é `400`. Parâmetros desconhecidos são ignorados.

### Ordenação

1. **Tempo de conclusão** (`tempo_conclusao_ms`, pelo relógio do robô), do menor para o maior.
2. **Desempate pela menor distância** (`distancia_m`, transições × 0,18 m).

Corridas com o mesmo tempo e a mesma distância dividem a posição (`1, 1, 3`), como no `RANK()` do SQL. Entre elas, a que terminou primeiro vem antes na lista.

### Resposta `200`

```json
{
  "labirinto": "4x4",
  "apresentacao": null,
  "itens": [
    {
      "posicao": 1,
      "id": "5fe08e59-3fc7-437b-8e74-1e801d94d4c4",
      "corrida_robo": "r92f031-1",
      "numero_tentativa": 2,
      "tempo_conclusao_ms": 22300,
      "distancia_m": 3.6,
      "velocidade_media_mps": 0.161,
      "encerrada_em": "2026-10-15T22:52:21.050Z"
    }
  ]
}
```

| Campo | Tipo | Observação |
|:--|:--|:--|
| `labirinto` | `4x4`, `8x4`, `12x4` | O pedido |
| `apresentacao` | UUID ou `null` | A apresentação filtrada; `null` quando o ranking é de todas as corridas |
| `itens` | lista de `PosicaoLeaderboard` | Em ordem de posição. Vazia quando nenhuma corrida válida foi concluída |

Campos de cada item (`PosicaoLeaderboard`):

| Campo | Tipo | Observação |
|:--|:--|:--|
| `posicao` | inteiro ≥ 1 | Repete nos empates |
| `id` | texto (UUID) | O mesmo de `/api/corridas/{id}` |
| `corrida_robo` | texto | Id da corrida gerado pelo robô |
| `numero_tentativa` | inteiro ou `null` | `null` para corridas fora de uma apresentação |
| `tempo_conclusao_ms` | inteiro | Tempo oficial (RF-82) |
| `distancia_m` | número | Critério de desempate |
| `velocidade_media_mps` | número ou `null` | Distância ÷ tempo (RF-83) |
| `encerrada_em` | texto, ISO 8601 em UTC | Quando o backend gravou o fim |

### Atualização

Quando uma corrida termina `CONCLUIDA`, os painéis inscritos no canal `ao_vivo` recebem a mensagem `leaderboard` com o labirinto (ver [`PAINEL.md`](PAINEL.md)). Ela sai **depois** de a corrida estar gravada: a consulta feita ao receber o aviso já inclui a corrida, em até 1 s após o `fim_corrida` (critério do RF-95).

A anulação (RF-96) também tira a corrida do ranking, porque a consulta exclui as anuladas. O aviso aos painéis quando uma corrida é anulada entra junto com a rota de anulação.

### Exemplos

```
GET /api/leaderboard?labirinto=4x4
GET /api/leaderboard?labirinto=8x4&apresentacao=0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33
```
