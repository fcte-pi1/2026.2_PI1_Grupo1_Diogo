import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { historicoInicial, usePainel } from '../../src/estado';
import { PaginaHistorico } from '../../src/paginas/historico/PaginaHistorico';
import { reiniciarStore } from '../suporte/store';

function renderizar() {
  return render(
    <MemoryRouter>
      <PaginaHistorico />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  reiniciarStore();
  usePainel.setState({ historico: { ...historicoInicial, carregando: true } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HU-FE-09 / HU-FE-10 — página de histórico', () => {
  it('exibe o estado vazio quando a API não retorna corridas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ itens: [], total: 0, pagina: 1, tamanho: 20 }),
      }),
    );
    renderizar();
    expect(await screen.findByText('Nenhuma execução registrada.')).toBeInTheDocument();
  });

  it('exibe erro do servidor quando a API falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    renderizar();
    expect(await screen.findByRole('alert')).toHaveTextContent('servidor');
  });

  it('filtra por tipo e renderiza os campos do contrato snake_case', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ itens: [], total: 0, pagina: 1, tamanho: 20 }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          itens: [
            {
              id: '0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33',
              iniciada_em: '2026-10-13T18:00:00.000Z',
              tipo_labirinto: null,
              numero_tentativa: 3,
              status: 'CONCLUIDA',
              motivo_termino: 'SUCESSO',
              tempo_conclusao_ms: 83500,
              anulada: false,
            },
          ],
          total: 1,
          pagina: 1,
          tamanho: 20,
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    renderizar();
    await screen.findByText('Nenhuma execução registrada.');
    fireEvent.click(screen.getByRole('button', { name: '8x4' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/corridas?pagina=1&tamanho=20&tipo=8x4',
        expect.anything(),
      ),
    );
    await waitFor(() => expect(screen.getByText('01:23.5')).toBeInTheDocument());
    expect(screen.getByText('Concluída')).toBeInTheDocument();
  });
});
