import { describe, expect, it } from 'vitest';
import type { ItemLinhaDoTempo } from '../../../protocolo/tipos.js';
import { ServicoLinhaDoTempo } from '../../../src/aplicacao/index.js';

const item = (sequencia: number): ItemLinhaDoTempo => ({
  sequencia,
  tempo_ms: sequencia * 100,
  tipo: 'posicao',
  recebida_em: new Date(0).toISOString(),
  mensagem: {
    versao: 1,
    tipo: 'posicao',
    corrida: 'c1',
    sequencia,
    tempo_ms: sequencia * 100,
    x: 0,
    y: 0,
    orientacao: 'NORTE',
    celulas: 0,
  },
});

/** Repositório em memória que registra cada lote pedido. */
function repositorio(sequencias: number[]) {
  const pedidos: [number, number][] = [];
  return {
    pedidos,
    repo: {
      corridaExiste: async (id: string) => id === 'c1',
      mensagensDepoisDe: async (_id: string, depoisDe: number, limite: number) => {
        pedidos.push([depoisDe, limite]);
        return sequencias
          .filter((s) => s > depoisDe)
          .slice(0, limite)
          .map(item);
      },
    },
  };
}

async function todos(itens: AsyncIterable<ItemLinhaDoTempo>) {
  const lista: number[] = [];
  for await (const i of itens) lista.push(i.sequencia);
  return lista;
}

describe('ServicoLinhaDoTempo (RF-94)', () => {
  it('entrega todas as mensagens em ordem, em lotes que continuam depois da última sequência', async () => {
    // Com lacunas na sequência: o próximo lote começa depois da última que veio, e não por contagem.
    const { repo, pedidos } = repositorio([1, 2, 4, 5, 7]);
    const servico = new ServicoLinhaDoTempo(repo, 2);
    expect(await todos((await servico.linhaDoTempo('c1'))!)).toEqual([1, 2, 4, 5, 7]);
    expect(pedidos).toEqual([
      [0, 2],
      [2, 2],
      [5, 2],
    ]);
  });

  it('um lote exato no fim pede mais um, vazio, e para', async () => {
    const { repo, pedidos } = repositorio([1, 2, 3, 4]);
    expect(await todos((await new ServicoLinhaDoTempo(repo, 2).linhaDoTempo('c1'))!)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(pedidos.map(([d]) => d)).toEqual([0, 2, 4]);
  });

  it('corrida inexistente: null; corrida sem mensagens: vazia', async () => {
    const { repo } = repositorio([]);
    const servico = new ServicoLinhaDoTempo(repo);
    expect(await servico.linhaDoTempo('outra')).toBeNull();
    expect(await todos((await servico.linhaDoTempo('c1'))!)).toEqual([]);
  });
});
