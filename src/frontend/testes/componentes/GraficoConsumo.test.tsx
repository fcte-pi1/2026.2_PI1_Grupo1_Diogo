import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GraficoConsumo } from '../../src/componentes';
import type { AmostraEnergia } from '../../src/dominio';

afterEach(cleanup);

/** `quantidade` amostras a 10 Hz a partir de 1 s, com a tensão caindo de 8,4 V a 7,6 V. */
function amostras(quantidade: number): AmostraEnergia[] {
  return Array.from({ length: quantidade }, (_, i) => ({
    seq: null,
    tempoMs: 1000 + i * 100,
    tensaoV: 8.4 - (0.8 * i) / Math.max(quantidade - 1, 1),
    correnteA: 0.5,
    potenciaW: 4,
    cargaPct: 100,
  }));
}

describe('GraficoConsumo (HU-FE-12 / CT-FE-12)', () => {
  it('sem amostras, avisa que está aguardando e não desenha linhas', () => {
    const { container } = render(<GraficoConsumo amostras={[]} />);
    expect(screen.getByTestId('grafico-consumo')).toHaveAttribute('data-amostras', '0');
    expect(screen.getByText('Aguardando amostras')).toBeInTheDocument();
    expect(container.querySelectorAll('polyline')).toHaveLength(0);
  });

  it('CA1: desenha tensão, corrente e potência, com as unidades na legenda', () => {
    const { container } = render(<GraficoConsumo amostras={amostras(10)} />);
    expect(container.querySelectorAll('polyline')).toHaveLength(3);
    const legenda = screen.getByTestId('legenda-consumo');
    expect(legenda).toHaveTextContent(/V: 7,6 V/);
    expect(legenda).toHaveTextContent(/I: 0,5 A/);
    expect(legenda).toHaveTextContent(/P: 4 W/);
  });

  it('CA3 e CA4: 6.000 amostras são desenhadas inteiras, do primeiro ao último ponto', () => {
    const { container } = render(<GraficoConsumo amostras={amostras(6000)} />);

    expect(screen.getByTestId('grafico-consumo')).toHaveAttribute('data-amostras', '6000');
    const linhas = Array.from(container.querySelectorAll('polyline'));
    expect(linhas).toHaveLength(3);
    for (const linha of linhas) {
      const pontos = (linha.getAttribute('points') ?? '').split(' ');
      expect(pontos).toHaveLength(6000);
      // A primeira amostra (0 s) fica no início do eixo e a última (599,9 s), no fim.
      expect(pontos[0]!.startsWith('30.0,')).toBe(true);
      expect(pontos.at(-1)!.startsWith('312.0,')).toBe(true);
    }
    expect(screen.getByText('0 s')).toBeInTheDocument();
    expect(screen.getByText('599,9 s')).toBeInTheDocument();
  });

  it('CA3: novas amostras acrescentam pontos sem apagar os anteriores', () => {
    const { container, rerender } = render(<GraficoConsumo amostras={amostras(4)} />);
    rerender(<GraficoConsumo amostras={amostras(5)} />);

    expect(screen.getByTestId('grafico-consumo')).toHaveAttribute('data-amostras', '5');
    const pontos = container.querySelector('polyline')!.getAttribute('points')!.split(' ');
    expect(pontos).toHaveLength(5);
    expect(pontos[0]!.startsWith('30.0,')).toBe(true);
  });

  it('usa a posição na série (100 ms por amostra) quando falta o tempo da amostra', () => {
    const semTempo = amostras(11).map((a) => ({ ...a, tempoMs: null }));
    render(<GraficoConsumo amostras={semTempo} />);
    expect(screen.getByText('1 s')).toBeInTheDocument();
  });
});
