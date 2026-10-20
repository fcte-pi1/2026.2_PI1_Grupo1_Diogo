/**
 * Buffer de retransmissão: mesmo comportamento do `TelemetryBuffer` do firmware.
 */
import { describe, expect, it } from 'vitest';
import {
  BufferRetransmissao,
  MAX_MENSAGENS_PADRAO,
  RETENCAO_PADRAO_MS,
} from '../../../simulador/buffer.js';

describe('buffer de retransmissão', () => {
  it('usa os valores do firmware: 60 s e 4 000 mensagens', () => {
    const buffer = new BufferRetransmissao();
    expect(buffer.retencaoMs).toBe(RETENCAO_PADRAO_MS);
    expect(RETENCAO_PADRAO_MS).toBe(60_000);
    expect(buffer.maxMensagens).toBe(MAX_MENSAGENS_PADRAO);
    expect(MAX_MENSAGENS_PADRAO).toBe(4000);
  });

  it('guarda na ordem de entrada e descarta o que ficou mais de 60 s antes da mais nova', () => {
    const buffer = new BufferRetransmissao();
    buffer.adicionar(1000, 'a');
    buffer.adicionar(30_000, 'b');
    buffer.adicionar(61_000, 'c');
    // 61 000 − 60 000 = 1 000: `a` está no limite e fica (a regra é "< corte").
    expect(buffer.mensagens()).toEqual(['a', 'b', 'c']);

    buffer.adicionar(61_001, 'd');
    expect(buffer.mensagens()).toEqual(['b', 'c', 'd']);
  });

  it('a idade é medida no relógio do robô, não no da máquina', () => {
    const buffer = new BufferRetransmissao({ retencaoMs: 100 });
    // Tudo entra no mesmo instante da máquina, mas com 300 ms de diferença no robô.
    buffer.adicionar(0, 'velha');
    buffer.adicionar(300, 'nova');
    expect(buffer.mensagens()).toEqual(['nova']);
  });

  it('respeita o limite de mensagens, descartando as mais antigas', () => {
    const buffer = new BufferRetransmissao({ maxMensagens: 300 });
    for (let s = 1; s <= 400; s++) buffer.adicionar(s * 50, `seq ${s}`);
    // Como no CT-BE-04: depois de 400 mensagens, sobram de 101 a 400.
    expect(buffer.tamanho).toBe(300);
    expect(buffer.mensagens()[0]).toBe('seq 101');
    expect(buffer.mensagens().at(-1)).toBe('seq 400');
  });

  it('guarda a marca (corrida e sequência) de cada mensagem', () => {
    const buffer = new BufferRetransmissao();
    buffer.adicionar(10, 'x', { corrida: 'r1-1', sequencia: 7 });
    buffer.adicionar(20, 'y');
    expect(buffer.conteudo()).toEqual([
      { tempoMs: 10, texto: 'x', marca: { corrida: 'r1-1', sequencia: 7 } },
      { tempoMs: 20, texto: 'y' },
    ]);
  });

  it('limpar() esvazia (reinício do robô)', () => {
    const buffer = new BufferRetransmissao();
    buffer.adicionar(1, 'a');
    buffer.limpar();
    expect(buffer.tamanho).toBe(0);
    expect(buffer.mensagens()).toEqual([]);
  });

  it('valida as opções', () => {
    expect(() => new BufferRetransmissao({ retencaoMs: -1 })).toThrow(/retenção/);
    expect(() => new BufferRetransmissao({ maxMensagens: 1.5 })).toThrow(/tamanho/);
  });
});
