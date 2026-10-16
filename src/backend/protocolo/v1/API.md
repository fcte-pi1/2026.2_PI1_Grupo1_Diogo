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
