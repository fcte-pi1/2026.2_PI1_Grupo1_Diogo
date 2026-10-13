import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usePainel } from '../../src/estado';
import { PaginaAoVivo } from '../../src/paginas/ao-vivo/PaginaAoVivo';
import { celulaMapa } from '../suporte/mensagens';
import { reiniciarStore } from '../suporte/store';

const acoes = () => usePainel.getState().acoes;

function renderizar() {
  return render(
    <MemoryRouter>
      <PaginaAoVivo />
    </MemoryRouter>,
  );
}

function parede(container: HTMLElement, id: string) {
  const linha = container.querySelector(`[data-parede="${id}"]`);
  if (!linha) throw new Error(`aresta ${id} não encontrada`);
  return { estado: linha.getAttribute('data-estado'), classe: linha.getAttribute('class') };
}

beforeEach(reiniciarStore);
afterEach(cleanup);

describe('HU-FE-04 / CT-FE-04 — labirinto atualizado', () => {
  it.each([
    ['4x4', 4, 4],
    ['8x4', 8, 4],
    ['12x4', 12, 4],
  ] as const)('CA1: %s desenha exatamente %i × %i células', (tipo, colunas, linhas) => {
    const { container } = renderizar();
    act(() => acoes().reiniciarExecucao({ tipoLabirinto: tipo }));

    expect(container.querySelectorAll('[data-celula]')).toHaveLength(colunas * linhas);
    const svg = screen.getByTestId('labirinto');
    expect(svg).toHaveAttribute('data-colunas', String(colunas));
    expect(svg).toHaveAttribute('data-linhas', String(linhas));
  });

  it('o modelo inicial tem o perímetro presente e as paredes internas desconhecidas', () => {
    const { container } = renderizar();
    act(() => acoes().reiniciarExecucao({ tipoLabirinto: '8x4' }));

    expect(parede(container, '0:0:norte').estado).toBe('PRESENTE');
    expect(parede(container, '0:0:oeste').estado).toBe('PRESENTE');
    expect(parede(container, '7:3:sul').estado).toBe('PRESENTE');
    expect(parede(container, '7:3:leste').estado).toBe('PRESENTE');
    expect(parede(container, '3:1:norte').estado).toBe('DESCONHECIDA');
    expect(parede(container, '3:1:leste').estado).toBe('DESCONHECIDA');
  });

  it('CA2: desconhecida, presente e ausente têm representações visuais distintas', () => {
    const { container } = renderizar();
    act(() => {
      acoes().reiniciarExecucao({ tipoLabirinto: '4x4' });
      acoes().atualizarCelulaMapa(celulaMapa(1, 1, { norte: true, leste: false }));
    });

    const presente = parede(container, '1:1:norte');
    const ausente = parede(container, '1:1:leste');
    const desconhecida = parede(container, '2:2:sul');

    expect([presente.estado, ausente.estado, desconhecida.estado]).toEqual([
      'PRESENTE',
      'AUSENTE',
      'DESCONHECIDA',
    ]);
    expect(new Set([presente.classe, ausente.classe, desconhecida.classe]).size).toBe(3);
  });

  it('CA2: o mesmo estado usa sempre a mesma representação', () => {
    const { container } = renderizar();
    act(() => {
      acoes().reiniciarExecucao({ tipoLabirinto: '4x4' });
      acoes().atualizarCelulaMapa(celulaMapa(1, 1, { norte: true, sul: true }));
    });
    expect(parede(container, '1:1:norte').classe).toBe(parede(container, '1:1:sul').classe);
    expect(parede(container, '0:0:norte').classe).toBe(parede(container, '1:1:norte').classe);
  });

  it('CA3: uma atualização de parede muda só a aresta afetada e preserva as demais', () => {
    const { container } = renderizar();
    act(() => {
      acoes().reiniciarExecucao({ tipoLabirinto: '4x4' });
      acoes().atualizarCelulaMapa(
        celulaMapa(0, 3, { norte: false, leste: true, sul: true, oeste: true }),
      );
    });
    const antes = Array.from(container.querySelectorAll('[data-parede]')).map((l) => [
      l.getAttribute('data-parede'),
      l.getAttribute('data-estado'),
    ]);

    act(() => acoes().atualizarCelulaMapa(celulaMapa(2, 1, { leste: true })));

    const mudaram = Array.from(container.querySelectorAll('[data-parede]'))
      .map((l) => [l.getAttribute('data-parede'), l.getAttribute('data-estado')])
      .filter(([id, estado], i) => antes[i]![0] !== id || antes[i]![1] !== estado)
      .map(([id]) => id);

    // As 4 arestas da célula (2,1) e as 2 duplicatas compartilhadas com as vizinhas (3,1) e (2,0)/(2,2)/(1,1).
    expect(mudaram.every((id) => /^(2:1|3:1|2:0|2:2|1:1):/.test(id!))).toBe(true);
    expect(parede(container, '0:3:leste').estado).toBe('PRESENTE');
    expect(parede(container, '0:3:norte').estado).toBe('AUSENTE');
    expect(parede(container, '0:3:sul').estado).toBe('PRESENTE');
  });

  it('CA4: o SVG escala pelo viewBox (sem largura fixa que force rolagem horizontal)', () => {
    renderizar();
    act(() => acoes().reiniciarExecucao({ tipoLabirinto: '12x4' }));
    const svg = screen.getByTestId('labirinto');
    expect(svg).toHaveAttribute('viewBox', '0 0 984 328');
    expect(svg).not.toHaveAttribute('width');
  });
});

describe('HU-FE-05 / CT-FE-05 — trajeto percorrido', () => {
  const preparar = () => {
    const tela = renderizar();
    act(() => acoes().reiniciarExecucao({ tipoLabirinto: '4x4' }));
    return tela;
  };

  it('CA1 e CA4: desenha as passagens na ordem da sequência, mesmo fora de ordem', () => {
    preparar();
    act(() => {
      acoes().adicionarPontoTrajeto({ seq: 1, x: 0, y: 3 });
      acoes().adicionarPontoTrajeto({ seq: 3, x: 0, y: 1 });
      acoes().adicionarPontoTrajeto({ seq: 2, x: 0, y: 2 });
    });

    expect(screen.getByTestId('visita-0-3')).toHaveTextContent('1');
    expect(screen.getByTestId('visita-0-2')).toHaveTextContent('2');
    // A célula 3 é a última e hospeda o robô; o trajeto liga 1 → 2 → 3 nessa ordem.
    expect(screen.getByTestId('trajetoria')).toHaveAttribute('d', 'M 41 287 L 41 205 L 41 123');
  });

  it('CA3: a revisita acumula as passagens e não apaga a ordem anterior', () => {
    preparar();
    act(() => {
      acoes().adicionarPontoTrajeto({ seq: 1, x: 0, y: 3 });
      acoes().adicionarPontoTrajeto({ seq: 2, x: 0, y: 2 });
      acoes().adicionarPontoTrajeto({ seq: 5, x: 0, y: 3 });
      acoes().adicionarPontoTrajeto({ seq: 6, x: 1, y: 3 });
    });
    expect(screen.getByTestId('visita-0-3')).toHaveTextContent('1/5');
    expect(screen.getByTestId('visita-0-2')).toHaveTextContent('2');
  });

  it('sequência repetida não duplica a passagem', () => {
    preparar();
    act(() => {
      acoes().adicionarPontoTrajeto({ seq: 1, x: 0, y: 3 });
      acoes().adicionarPontoTrajeto({ seq: 2, x: 0, y: 2 });
      acoes().adicionarPontoTrajeto({ seq: 2, x: 0, y: 2 });
      acoes().adicionarPontoTrajeto({ seq: 3, x: 1, y: 2 });
    });
    expect(screen.getByTestId('visita-0-2')).toHaveTextContent(/^2$/);
  });

  it('CA2: o robô é visualmente distinto das células visitadas', () => {
    const { container } = preparar();
    act(() => {
      acoes().adicionarPontoTrajeto({ seq: 1, x: 0, y: 3 });
      acoes().adicionarPontoTrajeto({ seq: 2, x: 0, y: 2 });
    });
    const robo = screen.getByTestId('robo');
    const visitada = container.querySelector('[data-celula="0:3"]');
    expect(robo.tagName).toBe('circle');
    expect(robo.getAttribute('class')).not.toBe(visitada?.getAttribute('class'));
    expect(container.querySelectorAll('[data-testid="robo"]')).toHaveLength(1);
  });

  it('a posição do contínuo/snapshot manda no robô; y = 0 é a borda Norte (topo)', () => {
    preparar();
    act(() => acoes().atualizarExecucao({ posicao: { x: 0, y: 0, orientacao: 'NORTE' } }));
    expect(screen.getByTestId('robo')).toHaveAttribute('cy', '41');

    act(() => acoes().atualizarExecucao({ posicao: { x: 3, y: 3, orientacao: 'SUL' } }));
    expect(screen.getByTestId('robo')).toHaveAttribute('cx', '287');
    expect(screen.getByTestId('robo')).toHaveAttribute('cy', '287');
  });

  it('o trajeto e as paredes usam o mesmo eixo: norte da célula (x, 1) é a aresta de cima', () => {
    const { container } = preparar();
    act(() => acoes().atualizarCelulaMapa(celulaMapa(0, 1, { norte: true })));
    const linha = container.querySelector('[data-parede="0:1:norte"]');
    expect(linha).toHaveAttribute('y1', '82');
    expect(linha).toHaveAttribute('y2', '82');
  });

  it('"Células percorridas" vem das métricas do backend, não do tamanho do trajeto', () => {
    preparar();
    expect(screen.getByTestId('celulas-percorridas')).toHaveTextContent('—');
    act(() => {
      acoes().adicionarPontoTrajeto({ seq: 1, x: 0, y: 3 });
      acoes().atualizarExecucao({ celulasPercorridas: 7 });
    });
    expect(screen.getByTestId('celulas-percorridas')).toHaveTextContent('7');
  });
});

describe('HU-FE-06 / CT-FE-06 — grade pelo tipo de labirinto', () => {
  it('CA1: cria a grade de cada tipo válido automaticamente', () => {
    const { container } = renderizar();
    for (const [tipo, total] of [
      ['4x4', 16],
      ['8x4', 32],
      ['12x4', 48],
    ] as const) {
      act(() => acoes().reiniciarExecucao({ tipoLabirinto: tipo }));
      expect(container.querySelectorAll('[data-celula]')).toHaveLength(total);
    }
  });

  it('CA2: ao trocar o tipo entre execuções, a grade anterior some e a nova dimensão vale', () => {
    const { container } = renderizar();
    act(() => {
      acoes().reiniciarExecucao({ corrida: 'c1', tipoLabirinto: '4x4' });
      acoes().atualizarCelulaMapa(celulaMapa(0, 3, { sul: true }));
      acoes().adicionarPontoTrajeto({ seq: 1, x: 0, y: 3 });
    });

    act(() => acoes().reiniciarExecucao({ corrida: 'c2', tipoLabirinto: '8x4' }));

    expect(container.querySelectorAll('[data-celula]')).toHaveLength(32);
    expect(container.querySelector('[data-testid^="visita-"]')).toBeNull();
    expect(screen.queryByTestId('trajetoria')).toBeNull();
    expect(parede(container, '0:3:norte').estado).toBe('DESCONHECIDA');
  });

  it('CA3: sem tipo informado, não desenha grade e mostra configuração pendente', () => {
    const { container } = renderizar();
    expect(container.querySelectorAll('[data-celula]')).toHaveLength(0);
    expect(screen.getByTestId('labirinto-pendente')).toHaveTextContent(
      'Aguardando tipo de labirinto',
    );
  });

  it('CA3: tipo inválido não desenha grade e mostra configuração inválida', () => {
    const { container } = renderizar();
    act(() => {
      acoes().reiniciarExecucao({ tipoLabirinto: '4x4' });
      acoes().definirTipoInvalido();
    });
    expect(container.querySelectorAll('[data-celula]')).toHaveLength(0);
    expect(screen.getByTestId('labirinto-pendente')).toHaveTextContent(
      'Tipo de labirinto inválido',
    );
  });
});

describe('HU-FE-07 / CT-FE-07 — desafio cumprido', () => {
  it('CA3: enquanto o objetivo não foi alcançado, não aparece como concluído', () => {
    renderizar();
    act(() => acoes().reiniciarExecucao({ corrida: 'c1', status: 'EM_ANDAMENTO' }));
    expect(screen.queryByTestId('desafio-cumprido')).toBeNull();
    expect(screen.getByTestId('desafio')).not.toHaveTextContent('Cumprido');
  });

  it.each(['FALHOU', 'INTERROMPIDA'] as const)('%s também não é "Cumprido"', (status) => {
    renderizar();
    act(() => acoes().reiniciarExecucao({ corrida: 'c1', status }));
    expect(screen.queryByTestId('desafio-cumprido')).toBeNull();
    expect(screen.getByTestId('desafio')).not.toHaveTextContent('Cumprido');
  });

  it('CA1 e CA2: ao concluir, exibe "Desafio cumprido" e o status concluído', () => {
    renderizar();
    act(() => acoes().reiniciarExecucao({ corrida: 'c1', status: 'EM_ANDAMENTO' }));
    act(() => acoes().atualizarExecucao({ status: 'CONCLUIDA', tempoMs: 95500 }));

    expect(screen.getByTestId('desafio-cumprido')).toHaveTextContent('Desafio cumprido');
    expect(screen.getByTestId('desafio')).toHaveTextContent('Cumprido');
    expect(screen.getByTestId('status-desafio')).toHaveTextContent('Cumprida');
    expect(screen.getByTestId('tempo')).toHaveTextContent('01:35.5');
  });

  it('CA2: a indicação permanece ao sair da tela e voltar (troca de aba)', () => {
    const primeira = renderizar();
    act(() => acoes().reiniciarExecucao({ corrida: 'c1', status: 'CONCLUIDA' }));
    expect(screen.getByTestId('desafio-cumprido')).toBeInTheDocument();

    primeira.unmount();
    renderizar();

    expect(screen.getByTestId('desafio-cumprido')).toHaveTextContent('Desafio cumprido');
  });

  it('CA2: continua visível com telemetria e perda de sinal posteriores', () => {
    renderizar();
    act(() => acoes().reiniciarExecucao({ corrida: 'c1', status: 'CONCLUIDA' }));
    act(() => {
      acoes().definirSinal('PERDIDO');
      acoes().atualizarExecucao({ tempoMs: 96000 });
    });
    expect(screen.getByTestId('desafio-cumprido')).toBeInTheDocument();
  });

  it('CA2: some ao iniciar uma nova execução', () => {
    renderizar();
    act(() => acoes().reiniciarExecucao({ corrida: 'c1', status: 'CONCLUIDA' }));
    act(() => acoes().reiniciarExecucao({ corrida: 'c2', status: 'EM_ANDAMENTO' }));
    expect(screen.queryByTestId('desafio-cumprido')).toBeNull();
    expect(screen.getByTestId('desafio')).toHaveTextContent('Em andamento');
  });
});
