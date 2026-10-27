import { describe, expect, it } from 'vitest';
import {
  SequenciaCorrida,
  celulaDentroDoLabirinto,
  dimensoesLabirinto,
  verificarRegras,
} from '../../../src/dominio/index.js';

const base = { tipo: 'celula', sequencia: 2, tempo_ms: 200 };

describe('dimensoesLabirinto', () => {
  it.each([
    ['4x4', 4],
    ['8x4', 8],
    ['12x4', 12],
  ] as const)('%s tem %i colunas e 4 linhas', (tipo, colunas) => {
    expect(dimensoesLabirinto(tipo)).toEqual({ colunas, linhas: 4 });
  });
});

describe('celulaDentroDoLabirinto', () => {
  it('confere a coluna pelo tipo e a linha sempre', () => {
    expect(celulaDentroDoLabirinto('4x4', 3, 3)).toBe(true);
    expect(celulaDentroDoLabirinto('4x4', 4, 0)).toBe(false);
    expect(celulaDentroDoLabirinto('8x4', 7, 3)).toBe(true);
    expect(celulaDentroDoLabirinto('12x4', 11, 4)).toBe(false);
    expect(celulaDentroDoLabirinto('4x4', -1, 0)).toBe(false);
    expect(celulaDentroDoLabirinto('4x4', 1.5, 0)).toBe(false);
  });

  it('com o tipo desconhecido, só recusa a linha inexistente', () => {
    expect(celulaDentroDoLabirinto(null, 11, 3)).toBe(true);
    expect(celulaDentroDoLabirinto(null, 0, 4)).toBe(false);
  });
});

describe('verificarRegras', () => {
  it('aceita uma mensagem coerente', () => {
    expect(verificarRegras({ ...base, x: 3, y: 3 }, '4x4', new SequenciaCorrida())).toBeNull();
  });

  it('recusa célula fora do labirinto (CT-BE-06)', () => {
    const violacao = verificarRegras({ ...base, x: 5, y: 2 }, '4x4', new SequenciaCorrida());
    expect(violacao?.codigo).toBe('COORDENADA_FORA_DO_LABIRINTO');
  });

  it.each([4.9, 9.1])('recusa tensão de %f V (CT-BE-07, passo 2)', (tensao_v) => {
    const violacao = verificarRegras(
      { ...base, tipo: 'energia', tensao_v },
      '4x4',
      new SequenciaCorrida(),
    );
    expect(violacao?.codigo).toBe('TENSAO_FORA_DA_FAIXA');
  });

  it.each([5.0, 9.0])('aceita a tensão no limite de %f V', (tensao_v) => {
    expect(
      verificarRegras({ ...base, tipo: 'energia', tensao_v }, '4x4', new SequenciaCorrida()),
    ).toBeNull();
  });

  it('recusa tempo do robô andando para trás (CT-BE-07, passo 3)', () => {
    const sequencias = new SequenciaCorrida();
    sequencias.aceitar(20, 5000);
    const violacao = verificarRegras(
      { tipo: 'posicao', sequencia: 21, tempo_ms: 4900 },
      '4x4',
      sequencias,
    );
    expect(violacao?.codigo).toBe('TEMPO_REGRESSIVO');
  });
});
