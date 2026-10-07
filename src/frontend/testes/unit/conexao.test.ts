import { describe, expect, it } from 'vitest';
import { atrasoBackoffMs } from '../../src/dominio';
import { rotuloConexao } from '../../src/formatacao';

describe('atrasoBackoffMs', () => {
  it('segue 0,25 → 0,5 → 1 → 2 s e fica no teto de 2 s (RNF-39)', () => {
    expect([0, 1, 2, 3, 4, 50].map(atrasoBackoffMs)).toEqual([250, 500, 1000, 2000, 2000, 2000]);
  });

  it('trata tentativas negativas como a primeira', () => {
    expect(atrasoBackoffMs(-1)).toBe(250);
  });
});

describe('rotuloConexao', () => {
  it.each([
    ['CONECTANDO', 'DESCONHECIDO', 'Conectando…'],
    ['CONECTADO', 'OK', 'Conectado'],
    ['CONECTADO', 'DESCONHECIDO', 'Conectado'],
    ['CONECTADO', 'PERDIDO', 'Sem sinal do robô'],
    ['RECONECTANDO', 'PERDIDO', 'Reconectando'],
    ['DESCONECTADO', 'OK', 'Desconectado'],
  ] as const)('%s + %s → %s', (conexao, sinal, esperado) => {
    expect(rotuloConexao(conexao, sinal)).toBe(esperado);
  });
});
