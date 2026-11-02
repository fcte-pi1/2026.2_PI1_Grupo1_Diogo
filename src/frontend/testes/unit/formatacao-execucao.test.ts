import { describe, expect, it } from 'vitest';
import {
  formatarNumero,
  formatarPercentual,
  formatarTempo,
  rotuloDesafio,
  rotuloStatus,
} from '../../src/formatacao';

describe('rotuloDesafio (HU-FE-07)', () => {
  it('só CONCLUIDA é "Cumprido" (CA1 e CA3)', () => {
    expect(rotuloDesafio('CONCLUIDA')).toBe('Concluído');
    expect(rotuloDesafio('EM_ANDAMENTO')).not.toBe('Concluído');
    expect(rotuloDesafio('FALHOU')).not.toBe('Concluído');
    expect(rotuloDesafio('INTERROMPIDA')).not.toBe('Concluído');
    expect(rotuloDesafio(null)).toBe('—');
  });
});

describe('rotuloStatus', () => {
  it.each([
    ['EM_ANDAMENTO', 'Em andamento'],
    ['CONCLUIDA', 'Concluída'],
    ['FALHOU', 'Falhou'],
    ['INTERROMPIDA', 'Interrompida'],
    [null, '—'],
  ] as const)('%s → %s', (status, esperado) => {
    expect(rotuloStatus(status)).toBe(esperado);
  });
});

describe('formatarPercentual (carga estimada, pt-BR)', () => {
  it('usa vírgula e sempre uma casa decimal', () => {
    expect(formatarPercentual(87.5)).toBe('87,5%');
    expect(formatarPercentual(35.27)).toBe('35,3%');
    expect(formatarPercentual(72)).toBe('72,0%');
    expect(formatarPercentual(100)).toBe('100,0%');
    expect(formatarPercentual(0)).toBe('0,0%');
  });

  it('traço quando não há valor', () => {
    expect(formatarPercentual(null)).toBe('—');
  });
});

describe('formatarTempo', () => {
  it('usa o formatador compartilhado mm:ss,d e traço quando não há tempo', () => {
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
