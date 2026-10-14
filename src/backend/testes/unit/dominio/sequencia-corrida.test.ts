import { describe, expect, it } from 'vitest';
import { SequenciaCorrida } from '../../../src/dominio/index.js';

function gravar(s: SequenciaCorrida, sequencias: number[]): void {
  for (const n of sequencias) {
    s.aceitar(n, n * 100);
    s.confirmar(n);
  }
}

describe('SequenciaCorrida', () => {
  it('confirma cumulativamente só o trecho sem lacunas (HU-BE-03, CA2 e CA3)', () => {
    const s = new SequenciaCorrida();
    gravar(s, [1, 2, 3, 4]);
    gravar(s, [6, 7, 8]);
    expect(s.ultimaContigua).toBe(4);
    expect(s.faltantes).toBe(1);

    gravar(s, [5]);
    expect(s.ultimaContigua).toBe(8);
    expect(s.faltantes).toBe(0);
  });

  it('só conta para o ack depois de confirmar a gravação', () => {
    const s = new SequenciaCorrida();
    s.aceitar(1, 100);
    expect(s.ultimaContigua).toBe(0);
    s.confirmar(1);
    expect(s.ultimaContigua).toBe(1);
  });

  it('reconhece duplicatas, inclusive das que ainda estão na fila de gravação', () => {
    const s = new SequenciaCorrida();
    s.aceitar(30, 3000);
    expect(s.conhece(30)).toBe(true);
    expect(s.conhece(31)).toBe(false);
  });

  it('conta as lacunas quando o robô não reenvia (CT-BE-04, variante)', () => {
    const s = new SequenciaCorrida();
    gravar(s, range(1, 120));
    gravar(s, range(401, 410));
    expect(s.ultimaContigua).toBe(120);
    expect(s.faltantes).toBe(280);
  });

  it('volta a aceitar a sequência cuja gravação falhou', () => {
    const s = new SequenciaCorrida();
    s.aceitar(1, 100);
    s.descartar(1);
    expect(s.conhece(1)).toBe(false);
    s.aceitar(1, 100);
    s.confirmar(1);
    expect(s.ultimaContigua).toBe(1);
  });

  describe('tempoCoerente', () => {
    it('recusa tempo menor que o da sequência anterior (CT-BE-07, passo 3)', () => {
      const s = new SequenciaCorrida();
      s.aceitar(20, 5000);
      expect(s.tempoCoerente(21, 4900)).toBe(false);
      expect(s.tempoCoerente(21, 5000)).toBe(true);
    });

    it('aceita sequência antiga chegando depois, como num reenvio (CT-BE-17)', () => {
      const s = new SequenciaCorrida();
      for (const n of [1, 2, 4, 5]) s.aceitar(n, n * 100);
      expect(s.tempoCoerente(3, 300)).toBe(true);
      expect(s.tempoCoerente(3, 150)).toBe(false);
      expect(s.tempoCoerente(3, 450)).toBe(false);
    });
  });
});

function range(de: number, ate: number): number[] {
  return Array.from({ length: ate - de + 1 }, (_, i) => de + i);
}
