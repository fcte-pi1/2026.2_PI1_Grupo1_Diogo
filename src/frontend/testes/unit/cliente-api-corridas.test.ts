import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErroConsultaCorridas, listarCorridas } from '../../src/adaptadores/http';

afterEach(() => vi.unstubAllGlobals());

describe('listarCorridas', () => {
  it('usa os nomes de parâmetros do contrato e omite tipo para todos', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ itens: [], total: 0, pagina: 1, tamanho: 20 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await listarCorridas({ labirinto: 'TODOS', pagina: 1, tamanhoPagina: 20 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/corridas?pagina=1&tamanho=20');
  });

  it('envia tipo quando um labirinto específico é selecionado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ itens: [], total: 0, pagina: 2, tamanho: 20 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await listarCorridas({ labirinto: '8x4', pagina: 2, tamanhoPagina: 20 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/corridas?pagina=2&tamanho=20&tipo=8x4');
  });

  it('classifica resposta incompatível como erro do servidor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ itens: [], total: 0, pagina: 1, tamanhoPagina: 20 }),
      }),
    );
    await expect(
      listarCorridas({ labirinto: 'TODOS', pagina: 1, tamanhoPagina: 20 }),
    ).rejects.toBeInstanceOf(ErroConsultaCorridas);
  });
});
