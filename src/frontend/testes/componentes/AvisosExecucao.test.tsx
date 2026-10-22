import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AvisosExecucao } from '../../src/componentes';
import { usePainel } from '../../src/estado';
import { PaginaAoVivo } from '../../src/paginas/ao-vivo/PaginaAoVivo';
import { CORRIDA } from '../suporte/mensagens';
import { reiniciarStore } from '../suporte/store';

const acoes = () => usePainel.getState().acoes;

const FALHA = {
  titulo: 'Execução falhou',
  motivo: 'Falha reportada pelo robô (FALHA_REPORTADA)',
  detalhe: 'Erro: sensor ToF 3',
};

beforeEach(reiniciarStore);
afterEach(cleanup);

describe('AvisosExecucao (HU-FE-13 / CT-FE-13)', () => {
  it('CA2: falha mostra título, motivo e detalhe recebidos', () => {
    render(<AvisosExecucao status="FALHOU" falha={FALHA} />);
    expect(screen.getByTestId('alerta-falha')).toHaveTextContent('Execução falhou');
    expect(screen.getByTestId('alerta-falha-motivo')).toHaveTextContent(
      'Motivo: Falha reportada pelo robô (FALHA_REPORTADA)',
    );
    expect(screen.getByTestId('alerta-falha-detalhe')).toHaveTextContent('Erro: sensor ToF 3');
    expect(screen.queryByTestId('desafio-cumprido')).not.toBeInTheDocument();
  });

  it('falha sem detalhe não mostra a linha de detalhe', () => {
    render(<AvisosExecucao status="FALHOU" falha={{ ...FALHA, detalhe: null }} />);
    expect(screen.queryByTestId('alerta-falha-detalhe')).not.toBeInTheDocument();
  });

  it('CA1: sem sinal tem aviso próprio, diferente da falha', () => {
    render(<AvisosExecucao status="EM_ANDAMENTO" falha={null} semSinal />);
    expect(screen.getByTestId('alerta-sem-sinal')).toHaveTextContent('Sem sinal do robô');
    expect(screen.queryByTestId('alerta-falha')).not.toBeInTheDocument();
  });

  it('CA3: comunicação retomada não se confunde com execução concluída', () => {
    render(<AvisosExecucao status="EM_ANDAMENTO" falha={null} sinalRetomado />);
    expect(screen.getByTestId('sinal-retomado')).toHaveTextContent('Comunicação retomada');
    expect(screen.getByTestId('sinal-retomado')).toHaveTextContent(
      'Isto não indica que a execução terminou',
    );
    expect(screen.queryByTestId('desafio-cumprido')).not.toBeInTheDocument();
  });

  it('execução concluída mostra o desafio cumprido e nenhum aviso de falha', () => {
    render(<AvisosExecucao status="CONCLUIDA" falha={null} />);
    expect(screen.getByTestId('desafio-cumprido')).toHaveTextContent('Desafio cumprido');
    expect(screen.queryByTestId('alerta-falha')).not.toBeInTheDocument();
  });

  it('sem nada a avisar, não renderiza nenhum aviso', () => {
    render(<AvisosExecucao status="EM_ANDAMENTO" falha={null} />);
    for (const id of ['alerta-falha', 'alerta-sem-sinal', 'sinal-retomado', 'desafio-cumprido']) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    }
  });
});

describe('avisos na tela ao vivo (CT-FE-13 / CT-FE-13b / CT-FE-13c)', () => {
  function renderizar() {
    const tela = render(
      <MemoryRouter>
        <PaginaAoVivo />
      </MemoryRouter>,
    );
    act(() => acoes().reiniciarExecucao({ corrida: CORRIDA, status: 'EM_ANDAMENTO' }));
    return tela;
  }

  it('os avisos aparecem no mesmo render do evento, sem espera (meta de 500 ms)', () => {
    renderizar();

    act(() => acoes().definirSinal('PERDIDO'));
    // Sem `await`: o aviso já está na tela quando a atualização da store termina.
    expect(screen.getByTestId('alerta-sem-sinal')).toBeInTheDocument();

    act(() =>
      acoes().atualizarExecucao({
        status: 'FALHOU',
        motivoTermino: 'FALHA_REPORTADA',
        detalheFalha: 'Erro: sensor ToF 3',
      }),
    );
    expect(screen.getByTestId('alerta-falha-motivo')).toHaveTextContent(
      'Motivo: Falha reportada pelo robô (FALHA_REPORTADA)',
    );
  });

  it('CT-FE-13b: perda, retomada e nova perda trocam os avisos sem encerrar a execução', () => {
    renderizar();

    act(() => acoes().definirSinal('PERDIDO'));
    expect(screen.getByTestId('alerta-sem-sinal')).toBeInTheDocument();
    expect(screen.getByTestId('status-desafio')).toHaveTextContent('Em andamento');

    act(() => acoes().definirSinal('OK'));
    expect(screen.queryByTestId('alerta-sem-sinal')).not.toBeInTheDocument();
    expect(screen.getByTestId('sinal-retomado')).toBeInTheDocument();
    expect(screen.queryByTestId('desafio-cumprido')).not.toBeInTheDocument();
    expect(screen.getByTestId('status-desafio')).toHaveTextContent('Em andamento');

    act(() => acoes().definirSinal('PERDIDO'));
    expect(screen.queryByTestId('sinal-retomado')).not.toBeInTheDocument();
    expect(screen.getByTestId('alerta-sem-sinal')).toBeInTheDocument();
  });

  it('CT-FE-13c: interrupção e depois conclusão tardia com o tempo do robô', () => {
    renderizar();

    act(() => acoes().atualizarExecucao({ status: 'INTERROMPIDA', motivoTermino: 'SEM_SINAL' }));
    expect(screen.getByTestId('alerta-falha')).toHaveTextContent('Execução interrompida');
    expect(screen.getByTestId('status-desafio')).toHaveTextContent('Interrompida');

    act(() =>
      acoes().atualizarExecucao({
        status: 'CONCLUIDA',
        motivoTermino: 'SUCESSO',
        detalheFalha: null,
        tempoMs: 94500,
      }),
    );
    expect(screen.queryByTestId('alerta-falha')).not.toBeInTheDocument();
    expect(screen.getByTestId('desafio-cumprido')).toBeInTheDocument();
    expect(screen.getByTestId('status-desafio')).toHaveTextContent('Concluída');
    expect(screen.getByTestId('tempo')).toHaveTextContent('01:34.5');
  });
});
