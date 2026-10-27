import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MensagemParaGravar } from '../../../src/aplicacao/index.js';
import { GravadorLote } from '../../../src/infra/gravador-lote.js';

const msg = (sequencia: number): MensagemParaGravar => ({
  corridaId: 'c',
  sequencia,
  tipo: 'posicao',
  tempoRoboMs: sequencia,
  versaoProtocolo: 1,
  payload: {},
});

describe('GravadorLote', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('junta o que chega em até 10 ms em um único lote', async () => {
    const lotes: number[][] = [];
    const gravador = new GravadorLote(async (lote) => {
      lotes.push(lote.map((m) => m.sequencia));
      return lote.map(() => true);
    });

    const pendentes = [gravador.gravar(msg(1)), gravador.gravar(msg(2)), gravador.gravar(msg(3))];
    expect(lotes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(10);

    expect(lotes).toEqual([[1, 2, 3]]);
    await expect(Promise.all(pendentes)).resolves.toEqual([true, true, true]);
  });

  it('grava na hora ao chegar a 50 mensagens, sem esperar o tempo', async () => {
    const tamanhos: number[] = [];
    const gravador = new GravadorLote(async (lote) => {
      tamanhos.push(lote.length);
      return lote.map(() => true);
    });

    const pendentes = Array.from({ length: 120 }, (_, i) => gravador.gravar(msg(i + 1)));
    await vi.advanceTimersByTimeAsync(0);
    expect(tamanhos).toEqual([50, 50]);

    await vi.advanceTimersByTimeAsync(10);
    expect(tamanhos).toEqual([50, 50, 20]);
    await Promise.all(pendentes);
  });

  it('informa a cada mensagem se ela foi inserida ou já existia', async () => {
    const gravador = new GravadorLote(async (lote) => lote.map((m) => m.sequencia !== 2));
    const pendentes = [gravador.gravar(msg(1)), gravador.gravar(msg(2))];
    await vi.advanceTimersByTimeAsync(10);
    await expect(Promise.all(pendentes)).resolves.toEqual([true, false]);
  });

  it('só resolve depois que a gravação do lote termina', async () => {
    let concluir!: () => void;
    const gravador = new GravadorLote(
      (lote) => new Promise((resolver) => (concluir = () => resolver(lote.map(() => true)))),
    );
    let resolvida = false;
    void gravador.gravar(msg(1)).then(() => (resolvida = true));

    await vi.advanceTimersByTimeAsync(10);
    expect(resolvida).toBe(false);
    concluir();
    await vi.advanceTimersByTimeAsync(0);
    expect(resolvida).toBe(true);
  });

  it('rejeita o lote inteiro quando a gravação falha e segue com o próximo', async () => {
    let falhar = true;
    const gravador = new GravadorLote(async (lote) => {
      if (falhar) throw new Error('banco fora do ar');
      return lote.map(() => true);
    });

    const primeira = gravador.gravar(msg(1));
    const esperada = expect(primeira).rejects.toThrow('banco fora do ar');
    await vi.advanceTimersByTimeAsync(10);
    await esperada;

    falhar = false;
    const segunda = gravador.gravar(msg(2));
    await vi.advanceTimersByTimeAsync(10);
    await expect(segunda).resolves.toBe(true);
  });

  it('esvaziar grava o que resta na fila sem esperar o tempo', async () => {
    const lotes: number[] = [];
    const gravador = new GravadorLote(async (lote) => {
      lotes.push(lote.length);
      return lote.map(() => true);
    });
    void gravador.gravar(msg(1));
    await gravador.esvaziar();
    expect(lotes).toEqual([1]);
  });
});
