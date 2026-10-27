import { describe, expect, it, vi } from 'vitest';
import { BarramentoEventos } from '../../../src/infra/barramento-eventos.js';

describe('BarramentoEventos', () => {
  it('um ouvinte que lança não chega a quem publicou nem impede os outros', () => {
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const barramento = new BarramentoEventos(log);
    const recebidos: string[] = [];
    barramento.assinar('alerta-tensao', () => {
      throw new Error('painel com defeito');
    });
    barramento.assinar('alerta-tensao', (d) => recebidos.push(d.corridaId));

    expect(() =>
      barramento.publicar('alerta-tensao', { corridaId: 'c1', tensaoV: 6.9 }),
    ).not.toThrow();
    expect(recebidos).toEqual(['c1']);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'alerta-tensao' }),
      'falha num ouvinte do barramento',
    );
  });
});
