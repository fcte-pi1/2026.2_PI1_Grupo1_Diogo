import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IndicadorConexao } from '../../src/componentes';
import { usePainel } from '../../src/estado';

describe('IndicadorConexao', () => {
  it('acompanha o estado da conexão na store', () => {
    render(<IndicadorConexao />);
    expect(screen.getByRole('status')).toHaveTextContent('Conectando…');

    act(() => usePainel.getState().acoes.definirEstadoConexao('CONECTADO'));
    expect(screen.getByRole('status')).toHaveTextContent('Conectado');

    act(() => usePainel.getState().acoes.definirSinal('PERDIDO'));
    expect(screen.getByRole('status')).toHaveTextContent('Sem sinal do robô');
  });
});
