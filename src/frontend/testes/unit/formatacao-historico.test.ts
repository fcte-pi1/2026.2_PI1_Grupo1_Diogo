import { describe, expect, it } from 'vitest';
import {
  formatarDataHora,
  formatarTempoCorrida,
  mensagemErroHistorico,
  mensagemHistoricoVazio,
  rotuloFiltroLabirinto,
  rotuloStatusCorrida,
} from '../../src/formatacao';

describe('formatarTempoCorrida', () => {
  it.each([
    [83500, '01:23.5'],
    [59960, '01:00.0'],
    [null, '—'],
    [-1, '—'],
    [Number.NaN, '—'],
    [Number.POSITIVE_INFINITY, '—'],
  ] as const)('formata %s como %s', (entrada, esperado) => {
    expect(formatarTempoCorrida(entrada)).toBe(esperado);
  });
});

describe('formatarDataHora', () => {
  it('formata uma data válida no horário local', () => {
    expect(formatarDataHora('2026-10-13T18:00:00.000Z')).toMatch(
      /^\d{2}\/\d{2}\/2026 \d{2}:00:00$/,
    );
  });

  it('retorna traço para data inválida', () => {
    expect(formatarDataHora('isto não é uma data')).toBe('—');
  });
});

describe('rótulos e mensagens do histórico', () => {
  it.each([
    ['EM_ANDAMENTO', 'Em andamento'],
    ['CONCLUIDA', 'Concluída'],
    ['FALHOU', 'Falhou'],
    ['INTERROMPIDA', 'Interrompida'],
  ] as const)('status %s', (status, esperado) => {
    expect(rotuloStatusCorrida(status)).toBe(esperado);
  });

  it('rotula filtros', () => {
    expect(rotuloFiltroLabirinto('TODOS')).toBe('Todos');
    expect(rotuloFiltroLabirinto('8x4')).toBe('8x4');
  });

  it('apresenta mensagens de erro de rede e servidor', () => {
    expect(mensagemErroHistorico('REDE')).toContain('conectar');
    expect(mensagemErroHistorico('SERVIDOR')).toContain('servidor');
  });

  it('apresenta mensagem vazia conforme filtro', () => {
    expect(mensagemHistoricoVazio('TODOS')).toBe('Nenhuma execução registrada.');
    expect(mensagemHistoricoVazio('8x4')).toBe('Nenhuma execução registrada no labirinto 8x4.');
  });
});
