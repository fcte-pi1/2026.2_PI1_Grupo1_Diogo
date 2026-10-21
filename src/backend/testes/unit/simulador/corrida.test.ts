import { describe, expect, it } from 'vitest';
import type { MensagemCorrida } from '../../../protocolo/tipos.js';
import { criarValidadorProtocolo } from '../../../protocolo/validador.js';
import { criarAleatorio } from '../../../simulador/aleatorio.js';
import {
  gerarCorrida,
  TENSAO_FINAL_V,
  TENSAO_INICIAL_V,
  type ResultadoCorrida,
} from '../../../simulador/corrida.js';
import {
  gerarLabirinto,
  mesmaCelula,
  TIPOS_LABIRINTO,
  vizinho,
} from '../../../simulador/labirinto.js';
import { explorar } from '../../../simulador/percurso.js';
import type { TipoLabirinto } from '../../../protocolo/tipos.js';

const validador = criarValidadorProtocolo();
const SEMENTES = [1, 2, 3, 17, 2026, 31337];

function corrida(tipo: TipoLabirinto, semente: number, resultado: ResultadoCorrida = 'sucesso') {
  const aleatorio = criarAleatorio(semente);
  const labirinto = gerarLabirinto(tipo, aleatorio);
  return {
    labirinto,
    ...gerarCorrida({
      labirinto,
      percurso: explorar(labirinto),
      boot: '9f3a1c',
      inicioMs: 12_000,
      resultado,
      aleatorio,
    }),
  };
}

const doTipo = <T extends MensagemCorrida['tipo']>(mensagens: MensagemCorrida[], tipo: T) =>
  mensagens.filter((m): m is Extract<MensagemCorrida, { tipo: T }> => m.tipo === tipo);

describe('corrida gerada', () => {
  for (const tipo of TIPOS_LABIRINTO) {
    for (const resultado of ['sucesso', 'falha'] as const) {
      it(`${tipo} (${resultado}): toda mensagem passa no esquema do protocolo v1`, () => {
        for (const semente of SEMENTES) {
          for (const mensagem of corrida(tipo, semente, resultado).mensagens) {
            const validada = validador.corrida(JSON.parse(JSON.stringify(mensagem)));
            expect(validada, JSON.stringify(mensagem)).toMatchObject({ ok: true });
            expect(Buffer.byteLength(JSON.stringify(mensagem))).toBeLessThanOrEqual(1024);
          }
        }
      });
    }
  }

  it('começa com inicio_corrida e estado MAPEANDO e termina com fim_corrida', () => {
    const { mensagens, id } = corrida('8x4', 1);
    expect(id).toBe('r9f3a1c-1');
    expect(mensagens[0]).toMatchObject({ tipo: 'inicio_corrida', sequencia: 1, labirinto: '8x4' });
    expect(mensagens[1]).toMatchObject({ tipo: 'estado', estado: 'MAPEANDO' });
    expect(mensagens.at(-1)).toMatchObject({ tipo: 'fim_corrida', resultado: 'sucesso' });
    expect(doTipo(mensagens, 'inicio_corrida')).toHaveLength(1);
    expect(doTipo(mensagens, 'fim_corrida')).toHaveLength(1);
    expect(mensagens.every((m) => m.corrida === id)).toBe(true);
  });

  it('sequencia contígua a partir de 1, tempo_ms não decrescente e sem silêncio de 1 s', () => {
    for (const tipo of TIPOS_LABIRINTO) {
      for (const semente of SEMENTES) {
        const { mensagens } = corrida(tipo, semente);
        mensagens.forEach((m, i) => {
          expect(m.sequencia).toBe(i + 1);
          if (i > 0) {
            const intervalo = m.tempo_ms - mensagens[i - 1]!.tempo_ms;
            expect(intervalo).toBeGreaterThanOrEqual(0);
            expect(intervalo).toBeLessThan(1000);
          }
        });
      }
    }
  });

  it('as células formam um percurso coerente, dentro do labirinto, da partida à chegada', () => {
    for (const semente of SEMENTES) {
      const { mensagens, labirinto } = corrida('12x4', semente);
      const celulas = doTipo(mensagens, 'celula');
      expect(celulas[0]).toMatchObject(labirinto.partida);
      expect(mesmaCelula(celulas.at(-1)!, labirinto.chegada)).toBe(true);
      for (let i = 1; i < celulas.length; i++) {
        const [a, b] = [celulas[i - 1]!, celulas[i]!];
        const vizinhas = (['NORTE', 'LESTE', 'SUL', 'OESTE'] as const).some((d) =>
          mesmaCelula(vizinho(a, d), b),
        );
        expect(vizinhas).toBe(true);
      }
      for (const c of celulas) expect(c.paredes).toEqual(labirinto.paredes(c));
      for (const p of doTipo(mensagens, 'posicao')) expect(labirinto.contem(p)).toBe(true);
    }
  });

  it('o contador de células da posicao nunca diminui e não envia velocidade (como o firmware)', () => {
    const { mensagens, passos } = corrida('8x4', 3);
    const posicoes = doTipo(mensagens, 'posicao');
    for (let i = 1; i < posicoes.length; i++) {
      expect(posicoes[i]!.celulas).toBeGreaterThanOrEqual(posicoes[i - 1]!.celulas);
    }
    expect(posicoes.at(-1)!.celulas).toBeLessThanOrEqual(passos);
    expect(posicoes.every((p) => !('velocidade_media_mps' in p))).toBe(true);
  });

  it('a tensão cai de cerca de 8,2 V para cerca de 7,4 V, sempre entre 5 e 9 V', () => {
    for (const tipo of TIPOS_LABIRINTO) {
      const energias = doTipo(corrida(tipo, 2026).mensagens, 'energia');
      const tensoes = energias.map((e) => e.tensao_v);
      expect(tensoes.every((v) => v >= 5 && v <= 9)).toBe(true);
      expect(tensoes[0]!).toBeGreaterThan(TENSAO_INICIAL_V - 0.15);
      expect(tensoes.at(-1)!).toBeLessThan(TENSAO_FINAL_V + 0.05);
      expect(tensoes.at(-1)!).toBeGreaterThan(TENSAO_FINAL_V - 0.15);
      for (const e of energias) {
        expect(e.potencia_w).toBeCloseTo(e.tensao_v * e.corrente_a, 2);
      }
    }
  });

  it('em falha, para no caminho e envia estado ERRO e fim_corrida falha com detalhe', () => {
    for (const semente of SEMENTES) {
      const { mensagens, labirinto, resultado } = corrida('12x4', semente, 'falha');
      expect(resultado).toBe('falha');
      const [penultima, ultima] = mensagens.slice(-2);
      expect(penultima).toMatchObject({ tipo: 'estado', estado: 'ERRO' });
      expect(ultima).toMatchObject({ tipo: 'fim_corrida', resultado: 'falha' });
      expect((ultima as { detalhe?: string }).detalhe).toMatch(/falha simulada/);
      const ultimaCelula = doTipo(mensagens, 'celula').at(-1)!;
      expect(mesmaCelula(ultimaCelula, labirinto.chegada)).toBe(false);
    }
  });

  it('é reproduzível: mesma semente, mesmas mensagens', () => {
    expect(corrida('4x4', 17).mensagens).toEqual(corrida('4x4', 17).mensagens);
  });
});

describe('sequência de tensões configurável (CT-BE-18 e CT-BE-19)', () => {
  function comTensoes(tensoes: number[], tipo: TipoLabirinto = '4x4', semente = 42) {
    const aleatorio = criarAleatorio(semente);
    const labirinto = gerarLabirinto(tipo, aleatorio);
    return gerarCorrida({
      labirinto,
      percurso: explorar(labirinto),
      boot: '9f3a1c',
      inicioMs: 12_000,
      resultado: 'sucesso',
      aleatorio,
      tensoes,
    });
  }

  it('usa exatamente as tensões dadas, em degraus, na ordem, da primeira à última leitura', () => {
    const pedidas = [7.2, 6.9, 6.8, 7.05, 6.9, 7.2, 6.9];
    const energias = doTipo(comTensoes(pedidas).mensagens, 'energia');
    const lidas = energias.map((e) => e.tensao_v);

    expect(lidas[0]).toBe(7.2);
    expect(lidas.at(-1)).toBe(6.9);
    // Sem as repetições de cada degrau, a sequência é a pedida.
    const degraus = lidas.filter((v, i) => i === 0 || v !== lidas[i - 1]);
    expect(degraus).toEqual(pedidas);
    // Degraus iguais: nenhum tem mais que uma leitura a mais que outro.
    const tamanhos = degraus.map(() => 0);
    let degrau = 0;
    for (let i = 0; i < lidas.length; i++) {
      if (i > 0 && lidas[i] !== lidas[i - 1]) degrau++;
      tamanhos[degrau]!++;
    }
    expect(Math.max(...tamanhos) - Math.min(...tamanhos)).toBeLessThanOrEqual(1);
    for (const e of energias) expect(e.potencia_w).toBeCloseTo(e.tensao_v * e.corrente_a, 2);
  });

  it('CT-BE-18: 8,2 → 7,6 V dá a tensão inicial e a final do caso de teste', () => {
    const energias = doTipo(comTensoes([8.2, 8.0, 7.8, 7.6]).mensagens, 'energia');
    expect(energias[0]!.tensao_v).toBe(8.2);
    expect(energias.at(-1)!.tensao_v).toBe(7.6);
  });

  it('não muda o resto da corrida: a mesma semente dá o mesmo percurso e as mesmas correntes', () => {
    const normal = corrida('8x4', 3).mensagens;
    const fixa = comTensoes([7.5], '8x4', 3).mensagens;
    expect(fixa.length).toBe(normal.length);
    expect(doTipo(fixa, 'celula')).toEqual(doTipo(normal, 'celula'));
    expect(doTipo(fixa, 'energia').map((e) => e.corrente_a)).toEqual(
      doTipo(normal, 'energia').map((e) => e.corrente_a),
    );
  });

  it('recusa mais tensões do que leituras de energia', () => {
    expect(() => comTensoes(Array.from({ length: 5000 }, () => 7.4))).toThrow(
      /leituras de energia/,
    );
  });
});
