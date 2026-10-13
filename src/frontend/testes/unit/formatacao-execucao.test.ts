import { describe, expect, it } from 'vitest';
import { formatarNumero, formatarTempo, rotuloDesafio, rotuloStatus } from '../../src/formatacao';

describe('rotuloDesafio (HU-FE-07)', () => {
  it('só CONCLUIDA é "Cumprido" (CA1 e CA3)', () => {
    expect(rotuloDesafio('CONCLUIDA')).toBe('Cumprido');
    expect(rotuloDesafio('EM_ANDAMENTO')).not.toBe('Cumprido');
    expect(rotuloDesafio('FALHOU')).not.toBe('Cumprido');
    expect(rotuloDesafio('INTERROMPIDA')).not.toBe('Cumprido');
    expect(rotuloDesafio(null)).toBe('—');
  });
});

describe('rotuloStatus', () => {
  it.each([
    ['EM_ANDAMENTO', 'Em andamento'],
    ['CONCLUIDA', 'Cumprida'],
    ['FALHOU', 'Falhou'],
    ['INTERROMPIDA', 'Interrompida'],
    [null, '—'],
  ] as const)('%s → %s', (status, esperado) => {
    expect(rotuloStatus(status)).toBe(esperado);
  });
});

describe('formatarTempo', () => {
  it('formata mm:ss.d e usa traço quando não há tempo', () => {
    expect(formatarTempo(null)).toBe('—');
    expect(formatarTempo(0)).toBe('00:00.0');
    expect(formatarTempo(95500)).toBe('01:35.5');
  });
});

describe('formatarNumero', () => {
  it('usa traço para null e vírgula decimal em pt-BR', () => {
    expect(formatarNumero(null, 'V')).toBe('—');
    expect(formatarNumero(8.12, 'V')).toBe('8,12 V');
  });
});
