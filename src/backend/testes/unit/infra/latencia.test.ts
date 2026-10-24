import { describe, expect, it } from 'vitest';
import { HistogramasLatencia } from '../../../src/infra/latencia.js';

describe('HistogramasLatencia (RNF-48, CT-BE-32)', () => {
  it('sem amostras: zero amostras e percentis nulos', () => {
    expect(new HistogramasLatencia().resumo().eventos).toEqual({
      amostras: 0,
      p50: null,
      p95: null,
      p99: null,
      max: null,
    });
  });

  it('percentis em ms, separados por tipo', () => {
    const h = new HistogramasLatencia();
    for (let i = 1; i <= 100; i++) h.registrar('evento', i); // 1 a 100 ms
    h.registrar('continuo', 80.5);
    const { eventos, continuos } = h.resumo();
    expect(eventos.amostras).toBe(100);
    expect(eventos.p50).toBeCloseTo(50, 0);
    expect(eventos.p95).toBeCloseTo(95, 0);
    expect(eventos.max).toBeCloseTo(100, 0);
    expect(continuos).toMatchObject({ amostras: 1 });
    expect(continuos.max).toBeCloseTo(80.5, 1);
  });

  it('latência abaixo de 1 µs conta como 1 µs, e não é perdida', () => {
    const h = new HistogramasLatencia();
    h.registrar('evento', 0);
    expect(h.resumo().eventos.amostras).toBe(1);
  });
});
