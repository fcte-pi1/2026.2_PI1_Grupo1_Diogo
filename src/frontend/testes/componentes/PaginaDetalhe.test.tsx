import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePainel } from '../../src/estado';
import { PaginaDetalhe } from '../../src/paginas/detalhe/PaginaDetalhe';
import { amostrasEnergia, detalheHttp, ID_DETALHE } from '../suporte/detalhe';
import { reiniciarStore } from '../suporte/store';

const { baixarArquivo } = vi.hoisted(() => ({ baixarArquivo: vi.fn() }));
vi.mock('../../src/adaptadores/exportacao', () => ({
  baixarArquivo,
  ErroExportacao: class ErroExportacao extends Error {},
}));

const acoes = () => usePainel.getState().acoes;

const ID_A = 'a0000000-0000-4000-8000-00000000000a';
const ID_B = 'b0000000-0000-4000-8000-00000000000b';

function resposta(corpo: unknown, extra: { ok?: boolean; status?: number } = {}) {
  return { ok: true, status: 200, json: async () => corpo, ...extra };
}

function adiada<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promessa, resolver };
}

function renderizar(id: string = ID_DETALHE, extra: ReactNode = null) {
  return render(
    <MemoryRouter initialEntries={[`/historico/${id}`]}>
      {extra}
      <Routes>
        <Route path="/historico/:id" element={<PaginaDetalhe />} />
        <Route path="/historico" element={<p>lista do histórico</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  reiniciarStore();
  baixarArquivo.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PaginaDetalhe — abrir uma execução (HU-FE-11 / CT-FE-11)', () => {
  it('CA1: mostra a execução gravada na mesma visualização, identificada como histórico', async () => {
    const lenta = adiada<ReturnType<typeof resposta>>();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(lenta.promessa));

    renderizar();
    expect(screen.getByTestId('detalhe-carregando')).toBeInTheDocument();
    expect(screen.queryByTestId('painel-execucao')).not.toBeInTheDocument();

    await act(async () => {
      lenta.resolver(resposta(detalheHttp({ energia: amostrasEnergia(600) })));
    });
    expect(await screen.findByTestId('aviso-historico')).toHaveTextContent(
      /Execução gravada em \d{2}\/\d{2}\/2026/,
    );

    expect(screen.queryByTestId('detalhe-carregando')).not.toBeInTheDocument();
    expect(screen.getByTestId('etiqueta-modo')).toHaveTextContent('MODO HISTÓRICO');
    expect(screen.queryByText('AO VIVO')).not.toBeInTheDocument();
    expect(screen.getByTestId('labirinto')).toHaveAttribute('data-colunas', '8');
    expect(screen.getByTestId('labirinto')).toHaveAttribute('data-linhas', '4');
    expect(screen.getByTestId('tempo')).toHaveTextContent('01:34.5');
    expect(screen.getByTestId('celulas-percorridas')).toHaveTextContent('45');
    expect(screen.getByTestId('distancia-total')).toHaveTextContent('8,1 m');
    expect(screen.getByTestId('velocidade-media')).toHaveTextContent('0,09 m/s');
    expect(screen.getByTestId('carga-estimada')).toHaveTextContent('72%');
    expect(screen.getByTestId('variacao-tensao')).toHaveTextContent('0,4 V');
    expect(screen.getByTestId('desafio')).toHaveTextContent('Concluído');
    expect(screen.getByTestId('status-desafio')).toHaveTextContent('Concluída');
    expect(screen.getByTestId('trajetoria')).toHaveAttribute('d', 'M 41 287 L 41 205');
    expect(screen.getByTestId('grafico-consumo')).toHaveAttribute('data-amostras', '600');
    expect(screen.getByText('Sem falhas registradas')).toBeInTheDocument();
  });

  it('mostra a falha gravada com motivo e detalhe, e não o desafio cumprido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        resposta(
          detalheHttp({
            status: 'FALHOU',
            motivo_termino: 'FALHA_REPORTADA',
            detalhe_termino: 'Erro: sensor ToF 3',
          }),
        ),
      ),
    );
    renderizar();

    expect(await screen.findByTestId('alerta-falha')).toHaveTextContent('Execução falhou');
    expect(screen.getByTestId('alerta-falha-motivo')).toHaveTextContent(
      'Motivo: Falha reportada pelo robô (FALHA_REPORTADA)',
    );
    expect(screen.getByTestId('alerta-falha-detalhe')).toHaveTextContent('Erro: sensor ToF 3');
    expect(screen.queryByTestId('desafio-cumprido')).not.toBeInTheDocument();
    expect(screen.getByTestId('status-desafio')).toHaveTextContent('Falhou');
  });

  it('CA2: mensagens ao vivo não alteram a execução aberta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta(detalheHttp())));
    renderizar();
    await screen.findByTestId('aviso-historico');

    act(() => {
      acoes().reiniciarExecucao({ corrida: 'outra', tipoLabirinto: '4x4', status: 'EM_ANDAMENTO' });
      acoes().atualizarExecucao({ tempoMs: 5000 });
      acoes().adicionarPontoTrajeto({ seq: 1, x: 0, y: 3 });
      acoes().definirSinal('PERDIDO');
    });

    expect(screen.getByTestId('tempo')).toHaveTextContent('01:34.5');
    expect(screen.getByTestId('status-desafio')).toHaveTextContent('Concluída');
    expect(screen.getByTestId('labirinto')).toHaveAttribute('data-colunas', '8');
    expect(screen.getByTestId('trajetoria')).toHaveAttribute('d', 'M 41 287 L 41 205');
    expect(screen.queryByTestId('alerta-sem-sinal')).not.toBeInTheDocument();
  });
});

describe('PaginaDetalhe — falhas ao abrir (CT-FE-11c)', () => {
  it('CA3: execução inexistente informa o erro, sem nova tentativa, e oferece voltar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta({}, { ok: false, status: 404 })));
    renderizar('00000000-0000-0000-0000-000000000000');

    expect(await screen.findByTestId('detalhe-erro')).toHaveTextContent(
      'Esta execução não existe ou foi removida do histórico.',
    );
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Voltar ao histórico/ }).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('painel-execucao')).not.toBeInTheDocument();
  });

  it('servidor fora do ar informa o erro e permite tentar de novo', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(resposta(detalheHttp()));
    vi.stubGlobal('fetch', fetchMock);
    renderizar();

    expect(await screen.findByTestId('detalhe-erro')).toHaveTextContent(
      'Não foi possível conectar ao servidor para carregar a execução.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByTestId('aviso-historico')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('erro HTTP do servidor tem mensagem própria', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta({}, { ok: false, status: 500 })));
    renderizar();
    expect(await screen.findByTestId('detalhe-erro')).toHaveTextContent(
      'O servidor não conseguiu retornar os dados desta execução.',
    );
  });

  it('resposta atrasada de uma execução anterior não sobrescreve a atual', async () => {
    const lentaA = adiada<ReturnType<typeof resposta>>();
    const fetchMock = vi.fn((url: string) =>
      url.endsWith(ID_A)
        ? lentaA.promessa
        : Promise.resolve(resposta(detalheHttp({ id: ID_B, tipo_labirinto: '12x4' }))),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderizar(ID_A, <Link to={`/historico/${ID_B}`}>ir para B</Link>);

    fireEvent.click(screen.getByText('ir para B'));
    await waitFor(() =>
      expect(screen.getByTestId('labirinto')).toHaveAttribute('data-colunas', '12'),
    );

    await act(async () => {
      lentaA.resolver(resposta(detalheHttp({ id: ID_A, tipo_labirinto: '4x4' })));
    });

    expect(screen.getByTestId('labirinto')).toHaveAttribute('data-colunas', '12');
  });
});

describe('PaginaDetalhe — exportar (HU-FE-15 / CT-FE-15)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(resposta(detalheHttp({ energia: amostrasEnergia(600) }))),
    );
  });

  it('exporta a execução aberta em CSV e em JSON', async () => {
    renderizar();
    await screen.findByTestId('aviso-historico');

    fireEvent.click(screen.getByRole('button', { name: 'Exportar JSON' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    expect(baixarArquivo).toHaveBeenCalledTimes(2);
    const [nomeJson, conteudoJson] = baixarArquivo.mock.calls[0]!;
    expect(nomeJson).toBe(`execucao-${ID_DETALHE}.json`);
    const corpo = JSON.parse(conteudoJson as string);
    expect(corpo).toMatchObject({
      id: ID_DETALHE,
      iniciada_em: '2026-10-17T14:30:05.000Z',
      tipo_labirinto: '8x4',
      status: 'CONCLUIDA',
    });
    expect(corpo.trajeto).toHaveLength(2);
    expect(corpo.energia).toHaveLength(600);
    expect(baixarArquivo.mock.calls[1]![0]).toBe(`execucao-${ID_DETALHE}.csv`);
  });

  it('CA4: falha ao exportar informa o erro e preserva os dados exibidos', async () => {
    baixarArquivo.mockImplementationOnce(() => {
      throw new Error('download bloqueado');
    });
    renderizar();
    await screen.findByTestId('aviso-historico');

    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    expect(screen.getByTestId('exportacao-erro')).toHaveTextContent(
      'Não foi possível exportar a execução em CSV. Os dados exibidos foram mantidos.',
    );
    expect(screen.getByTestId('tempo')).toHaveTextContent('01:34.5');
    expect(screen.getByTestId('grafico-consumo')).toHaveAttribute('data-amostras', '600');
    expect(screen.getByTestId('trajetoria')).toHaveAttribute('d', 'M 41 287 L 41 205');
  });
});
