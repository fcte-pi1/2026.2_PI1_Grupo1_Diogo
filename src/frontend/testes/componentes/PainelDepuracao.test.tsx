import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PainelDepuracao } from '../../src/componentes';
import type { LeituraDepuracao } from '../../src/dominio';
import { usePainel } from '../../src/estado';
import { PaginaAoVivo } from '../../src/paginas/ao-vivo/PaginaAoVivo';
import { reiniciarStore } from '../suporte/store';

const acoes = () => usePainel.getState().acoes;
const texto = (id: string) => screen.getByTestId(`depuracao-${id}`).textContent;

const LEITURA: LeituraDepuracao = {
  tof: [120, 85, 300, 45, 210, 60, 150],
  anguloMpuGraus: 12.5,
  encoderEsquerdo: 1500,
  encoderDireito: 1498,
  tempoMs: 12100,
};

beforeEach(reiniciarStore);
afterEach(cleanup);

describe('PainelDepuracao (HU-FE-14 / CT-FE-14)', () => {
  it('sem leitura, avisa que está aguardando e mostra "—" em todos os campos', () => {
    render(<PainelDepuracao />);
    expect(screen.getByTestId('depuracao-aguardando')).toBeInTheDocument();
    for (let i = 1; i <= 7; i++) expect(texto(`tof-${i}`)).toBe('—');
    expect(texto('mpu-angulo')).toBe('—');
    expect(texto('encoder-esquerdo')).toBe('—');
    expect(texto('encoder-direito')).toBe('—');
  });

  it('CA1: mostra os sete ToF, o ângulo do MPU-6050 e os dois encoders', () => {
    render(<PainelDepuracao />);
    act(() => acoes().atualizarDepuracao(LEITURA));

    expect(screen.queryByTestId('depuracao-aguardando')).not.toBeInTheDocument();
    expect([1, 2, 3, 4, 5, 6, 7].map((i) => texto(`tof-${i}`))).toEqual([
      '120 mm',
      '85 mm',
      '300 mm',
      '45 mm',
      '210 mm',
      '60 mm',
      '150 mm',
    ]);
    expect(texto('mpu-angulo')).toBe('12,5°');
    expect(texto('encoder-esquerdo')).toBe('1.500');
    expect(texto('encoder-direito')).toBe('1.498');
  });

  it('uma nova leitura atualiza os valores na tela', () => {
    render(<PainelDepuracao />);
    act(() => acoes().atualizarDepuracao(LEITURA));
    act(() => acoes().atualizarDepuracao({ ...LEITURA, tof: [1, 2, 3, 4, 5, 6, 7] }));
    expect(texto('tof-1')).toBe('1 mm');
    expect(texto('tof-7')).toBe('7 mm');
  });

  it('CA4: valor ausente aparece como "—", e zero continua sendo zero', () => {
    render(<PainelDepuracao />);
    act(() =>
      acoes().atualizarDepuracao({
        ...LEITURA,
        tof: [0, null, 300, 45, 210, 60, 150],
        anguloMpuGraus: null,
      }),
    );
    expect(texto('tof-1')).toBe('0 mm');
    expect(texto('tof-2')).toBe('—');
    expect(texto('mpu-angulo')).toBe('—');
  });
});

describe('aba Depuração na tela ao vivo (CT-FE-14 passos 1, 3 e 5)', () => {
  function renderizar() {
    return render(
      <MemoryRouter>
        <PaginaAoVivo />
      </MemoryRouter>,
    );
  }

  it('o painel só existe na aba Depuração e os dados obrigatórios continuam visíveis', () => {
    renderizar();
    act(() => acoes().reiniciarExecucao({ tipoLabirinto: '4x4' }));
    expect(screen.queryByTestId('painel-depuracao')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Depuração' }));
    expect(screen.getByTestId('painel-depuracao')).toBeInTheDocument();
    expect(screen.getByTestId('painel-execucao')).toBeInTheDocument();
    expect(screen.getByTestId('tempo')).toBeInTheDocument();
    expect(screen.getByTestId('labirinto')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ao vivo' }));
    expect(screen.queryByTestId('painel-depuracao')).not.toBeInTheDocument();
    expect(screen.getByTestId('painel-execucao')).toBeInTheDocument();
  });

  it('atualizar a leitura não apaga a série de energia da tentativa', () => {
    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Depuração' }));
    act(() =>
      acoes().adicionarAmostraEnergia({
        seq: null,
        tempoMs: 1000,
        tensaoV: 8,
        correnteA: 1,
        potenciaW: 8,
        cargaPct: 90,
      }),
    );

    act(() => acoes().atualizarDepuracao(LEITURA));
    act(() => acoes().atualizarDepuracao({ ...LEITURA, tof: [1, 2, 3, 4, 5, 6, 7] }));

    expect(texto('tof-1')).toBe('1 mm');
    expect(screen.getByTestId('grafico-consumo')).toHaveAttribute('data-amostras', '1');
  });
});
