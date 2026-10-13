import { describe, expect, it } from 'vitest';
import {
  dimensoesLabirinto,
  ehTipoLabirinto,
  estadoParede,
  type CelulaMapa,
  type TipoLabirinto,
} from '../../src/dominio';
import { celulaMapa } from '../suporte/mensagens';

describe('ehTipoLabirinto (HU-FE-06 CA3)', () => {
  it.each(['4x4', '8x4', '12x4'])('aceita %s', (tipo) => {
    expect(ehTipoLabirinto(tipo)).toBe(true);
  });

  it.each(['16x4', '4x8', '8X4', '', null, undefined, 8, {}])('rejeita %j', (tipo) => {
    expect(ehTipoLabirinto(tipo)).toBe(false);
  });
});

describe('dimensoesLabirinto (HU-FE-04 CA1, HU-FE-06 CA1)', () => {
  it.each([
    ['4x4', 4, 4],
    ['8x4', 8, 4],
    ['12x4', 12, 4],
  ] as const)('%s tem %i colunas e %i linhas', (tipo, colunas, linhas) => {
    expect(dimensoesLabirinto(tipo)).toEqual({ colunas, linhas });
  });
});

describe('estadoParede (HU-FE-04 CA2 e CA3)', () => {
  const tipo: TipoLabirinto = '4x4';

  it('o perímetro é presente mesmo sem nenhuma célula conhecida', () => {
    expect(estadoParede([], tipo, 0, 0, 'norte')).toBe('PRESENTE');
    expect(estadoParede([], tipo, 0, 0, 'oeste')).toBe('PRESENTE');
    expect(estadoParede([], tipo, 3, 3, 'sul')).toBe('PRESENTE');
    expect(estadoParede([], tipo, 3, 3, 'leste')).toBe('PRESENTE');
  });

  it('o perímetro acompanha o tipo: x = 7 é borda Leste em 8x4, mas interno em 12x4', () => {
    expect(estadoParede([], '8x4', 7, 0, 'leste')).toBe('PRESENTE');
    expect(estadoParede([], '12x4', 7, 0, 'leste')).toBe('DESCONHECIDA');
  });

  it('paredes internas sem leitura são desconhecidas', () => {
    expect(estadoParede([], tipo, 1, 1, 'norte')).toBe('DESCONHECIDA');
    expect(estadoParede([], tipo, 2, 2, 'leste')).toBe('DESCONHECIDA');
  });

  it('distingue presente e ausente a partir da célula lida', () => {
    const mapa: CelulaMapa[] = [celulaMapa(1, 1, { norte: true, leste: false })];
    expect(estadoParede(mapa, tipo, 1, 1, 'norte')).toBe('PRESENTE');
    expect(estadoParede(mapa, tipo, 1, 1, 'leste')).toBe('AUSENTE');
  });

  it('a aresta compartilhada vale para as duas células (norte = y − 1, leste = x + 1)', () => {
    const mapa: CelulaMapa[] = [celulaMapa(1, 1, { norte: true, oeste: false })];
    expect(estadoParede(mapa, tipo, 1, 0, 'sul')).toBe('PRESENTE');
    expect(estadoParede(mapa, tipo, 0, 1, 'leste')).toBe('AUSENTE');
  });

  it('ler uma célula não altera as arestas das células distantes', () => {
    const antes = estadoParede([], tipo, 3, 1, 'norte');
    const depois = estadoParede([celulaMapa(0, 2, { sul: true })], tipo, 3, 1, 'norte');
    expect(depois).toBe(antes);
  });
});
