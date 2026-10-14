import { beforeEach, describe, expect, it } from 'vitest';
import { usePainel } from '../../src/estado';
import { celulaMapa } from '../suporte/mensagens';
import { reiniciarStore } from '../suporte/store';

const acoes = () => usePainel.getState().acoes;
const aoVivo = () => usePainel.getState().aoVivo;

beforeEach(reiniciarStore);

describe('trajeto (HU-FE-05)', () => {
  it('CA4: mantém a ordem por sequência mesmo com chegada fora de ordem (1, 3, 2)', () => {
    acoes().adicionarPontoTrajeto({ seq: 1, x: 0, y: 3 });
    acoes().adicionarPontoTrajeto({ seq: 3, x: 0, y: 1 });
    acoes().adicionarPontoTrajeto({ seq: 2, x: 0, y: 2 });
    expect(aoVivo().trajeto.map((p) => p.seq)).toEqual([1, 2, 3]);
  });

  it('CA3: a revisita não apaga a passagem anterior', () => {
    acoes().adicionarPontoTrajeto({ seq: 1, x: 0, y: 3 });
    acoes().adicionarPontoTrajeto({ seq: 2, x: 0, y: 2 });
    acoes().adicionarPontoTrajeto({ seq: 5, x: 0, y: 3 });
    expect(aoVivo().trajeto).toEqual([
      { seq: 1, x: 0, y: 3 },
      { seq: 2, x: 0, y: 2 },
      { seq: 5, x: 0, y: 3 },
    ]);
  });

  it('sequência já aplicada não duplica o ponto (CT-FE-05, passo 4)', () => {
    acoes().adicionarPontoTrajeto({ seq: 1, x: 0, y: 3 });
    acoes().adicionarPontoTrajeto({ seq: 1, x: 0, y: 3 });
    expect(aoVivo().trajeto).toHaveLength(1);
  });
});

describe('mapa (HU-FE-04 CA3)', () => {
  it('atualizar uma célula preserva as demais, sem alterá-las', () => {
    acoes().atualizarCelulaMapa(celulaMapa(0, 3, { sul: true }));
    acoes().atualizarCelulaMapa(celulaMapa(1, 3, { norte: true }));
    const [primeira] = aoVivo().mapa;

    acoes().atualizarCelulaMapa(celulaMapa(1, 3, { norte: false, leste: true }));

    expect(aoVivo().mapa).toHaveLength(2);
    expect(aoVivo().mapa.find((c) => c.x === 0 && c.y === 3)).toBe(primeira);
    expect(aoVivo().mapa.find((c) => c.x === 1 && c.y === 3)?.paredes).toEqual({
      norte: false,
      leste: true,
      sul: false,
      oeste: false,
    });
  });
});

describe('tipo de labirinto (HU-FE-06)', () => {
  it('CA2: ao mudar o tipo, a grade anterior (mapa e trajeto) é descartada', () => {
    acoes().atualizarExecucao({ tipoLabirinto: '4x4' });
    acoes().atualizarCelulaMapa(celulaMapa(0, 3));
    acoes().adicionarPontoTrajeto({ seq: 1, x: 0, y: 3 });

    acoes().atualizarExecucao({ tipoLabirinto: '8x4' });

    expect(aoVivo().tipoLabirinto).toBe('8x4');
    expect(aoVivo().mapa).toEqual([]);
    expect(aoVivo().trajeto).toEqual([]);
  });

  it('CA3: tipo inválido descarta a grade e marca a configuração como inválida', () => {
    acoes().atualizarExecucao({ tipoLabirinto: '4x4' });
    acoes().atualizarCelulaMapa(celulaMapa(0, 3));

    acoes().definirTipoInvalido();

    expect(aoVivo().tipoLabirinto).toBeNull();
    expect(aoVivo().tipoInvalido).toBe(true);
    expect(aoVivo().mapa).toEqual([]);
  });

  it('um tipo válido depois do inválido limpa a marca de inválido', () => {
    acoes().definirTipoInvalido();
    acoes().atualizarExecucao({ tipoLabirinto: '12x4' });
    expect(aoVivo().tipoInvalido).toBe(false);
  });
});

describe('reiniciar e snapshot', () => {
  it('reiniciarExecucao volta ao estado inicial (nova corrida)', () => {
    acoes().atualizarExecucao({ tipoLabirinto: '4x4', status: 'CONCLUIDA', tempoMs: 95500 });
    acoes().reiniciarExecucao({ corrida: 'nova' });
    expect(aoVivo().status).toBeNull();
    expect(aoVivo().tempoMs).toBeNull();
    expect(aoVivo().tipoLabirinto).toBeNull();
    expect(aoVivo().corrida).toBe('nova');
  });

  it('snapshot substitui o mapa em vez de mesclar', () => {
    acoes().atualizarExecucao({ corrida: 'c1', tipoLabirinto: '4x4' });
    acoes().atualizarCelulaMapa(celulaMapa(0, 3));
    acoes().atualizarCelulaMapa(celulaMapa(0, 2));

    acoes().substituirSnapshot({ corrida: 'c1', tipoLabirinto: '4x4', mapa: [celulaMapa(1, 1)] });

    expect(aoVivo().mapa).toEqual([celulaMapa(1, 1)]);
  });

  it('snapshot da mesma corrida mantém o trajeto; de outra corrida, descarta', () => {
    acoes().atualizarExecucao({ corrida: 'c1' });
    acoes().adicionarPontoTrajeto({ seq: 1, x: 0, y: 3 });

    acoes().substituirSnapshot({ corrida: 'c1' });
    expect(aoVivo().trajeto).toHaveLength(1);

    acoes().substituirSnapshot({ corrida: 'c2' });
    expect(aoVivo().trajeto).toEqual([]);
  });
});
