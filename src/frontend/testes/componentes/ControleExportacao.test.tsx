import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ControleExportacao } from '../../src/componentes';
import type { DadosExecucao } from '../../src/dominio';
import { execucaoInicial } from '../../src/dominio';

const { baixarArquivo } = vi.hoisted(() => ({ baixarArquivo: vi.fn() }));
vi.mock('../../src/adaptadores/exportacao', () => ({
  baixarArquivo,
  ErroExportacao: class ErroExportacao extends Error {},
}));

const DADOS: DadosExecucao = {
  ...execucaoInicial,
  corrida: 'abc-123',
  tipoLabirinto: '8x4',
  status: 'CONCLUIDA',
  motivoTermino: 'SUCESSO',
  tempoMs: 94500,
  trajeto: [{ seq: 1, x: 0, y: 3 }],
};

const INICIO = '2026-10-17T14:30:05.000Z';

beforeEach(() => baixarArquivo.mockReset());
afterEach(cleanup);

describe('ControleExportacao (HU-FE-15 / CT-FE-15)', () => {
  it('CA1: oferece os formatos CSV e JSON', () => {
    render(<ControleExportacao dados={DADOS} iniciadaEm={INICIO} />);
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar JSON' })).toBeInTheDocument();
  });

  it('CA3: JSON baixa um arquivo .json com o tipo de conteúdo certo e conteúdo válido', () => {
    render(<ControleExportacao dados={DADOS} iniciadaEm={INICIO} />);
    fireEvent.click(screen.getByTestId('exportar-json'));

    expect(baixarArquivo).toHaveBeenCalledTimes(1);
    const [nome, conteudo, tipo] = baixarArquivo.mock.calls[0]!;
    expect(nome).toBe('execucao-abc-123.json');
    expect(tipo).toBe('application/json;charset=utf-8');
    expect(JSON.parse(conteudo as string)).toMatchObject({
      id: 'abc-123',
      iniciada_em: INICIO,
      tipo_labirinto: '8x4',
      status: 'CONCLUIDA',
      trajeto: [{ sequencia: 1, x: 0, y: 3 }],
    });
  });

  it('CA3: CSV baixa um arquivo .csv com o tipo de conteúdo certo', () => {
    render(<ControleExportacao dados={DADOS} iniciadaEm={INICIO} />);
    fireEvent.click(screen.getByTestId('exportar-csv'));

    const [nome, conteudo, tipo] = baixarArquivo.mock.calls[0]!;
    expect(nome).toBe('execucao-abc-123.csv');
    expect(tipo).toBe('text/csv;charset=utf-8');
    expect((conteudo as string).startsWith('\uFEFFsecao,id_execucao,')).toBe(true);
  });

  it('CA4: falha no download mostra o erro do formato e some quando a próxima tentativa funciona', () => {
    baixarArquivo.mockImplementationOnce(() => {
      throw new Error('download bloqueado');
    });
    render(<ControleExportacao dados={DADOS} iniciadaEm={INICIO} />);

    fireEvent.click(screen.getByTestId('exportar-csv'));
    expect(screen.getByTestId('exportacao-erro')).toHaveTextContent(
      'Não foi possível exportar a execução em CSV. Os dados exibidos foram mantidos.',
    );

    fireEvent.click(screen.getByTestId('exportar-json'));
    expect(screen.queryByTestId('exportacao-erro')).not.toBeInTheDocument();
  });
});
