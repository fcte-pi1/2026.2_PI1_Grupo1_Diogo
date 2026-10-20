import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  DetalheCorrida,
  ItemLinhaDoTempo,
  MensagemCorrida,
} from '../../../protocolo/tipos.js';
import { criarValidadorProtocolo } from '../../../protocolo/validador.js';
import { COLUNAS_CSV, linhaCsv } from '../../../src/adaptadores/http/exportacao-csv.js';
import { ServicoConsulta, ServicoLinhaDoTempo } from '../../../src/aplicacao/index.js';
import { construirApp } from '../../../src/app.js';
import { AmbienteEmMemoria } from '../../apoio/ingestao-em-memoria.js';

const ID = '0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33';

function item(mensagem: MensagemCorrida): ItemLinhaDoTempo {
  return {
    sequencia: mensagem.sequencia,
    tempo_ms: mensagem.tempo_ms,
    tipo: mensagem.tipo,
    recebida_em: '2026-10-20T14:00:00.000Z',
    mensagem,
  };
}

const env = { versao: 1 as const, corrida: 'c1', tempo_ms: 100 };
const MENSAGENS: MensagemCorrida[] = [
  { ...env, tipo: 'inicio_corrida', sequencia: 1, labirinto: '4x4' },
  {
    ...env,
    tipo: 'celula',
    sequencia: 2,
    x: 0,
    y: 1,
    paredes: { norte: true, leste: false, sul: false, oeste: true },
  },
  {
    ...env,
    tipo: 'posicao',
    sequencia: 3,
    x: 0,
    y: 1,
    orientacao: 'NORTE',
    celulas: 1,
    velocidade_media_mps: 0.25,
  },
  { ...env, tipo: 'energia', sequencia: 4, tensao_v: 8.1, corrente_a: -0.5, potencia_w: 4 },
  { ...env, tipo: 'estado', sequencia: 5, estado: 'MAPEANDO' },
  {
    ...env,
    tipo: 'fim_corrida',
    sequencia: 6,
    resultado: 'falha',
    detalhe: 'ToF 3, "sem leitura"',
  },
];

describe('linhaCsv (RF-98, HU-BE-27 CA2)', () => {
  const colunas = (m: MensagemCorrida) => {
    const valores = linhaCsv(item(m)).match(/("([^"]|"")*"|[^,]*)(,|$)/g)!;
    return Object.fromEntries(
      COLUNAS_CSV.map((c, i) => [c, valores[i]!.replace(/,$/, '')]),
    ) as Record<(typeof COLUNAS_CSV)[number], string>;
  };

  it('achata o payload de cada tipo nas colunas dele e deixa as outras vazias', () => {
    const [inicio, cel, pos, ener, est] = MENSAGENS.map(colunas);
    expect(inicio).toMatchObject({
      seq: '1',
      t_robo_ms: '100',
      tipo: 'inicio_corrida',
      labirinto: '4x4',
      x: '',
    });
    expect(cel).toMatchObject({
      x: '0',
      y: '1',
      parede_norte: 'true',
      parede_leste: 'false',
      parede_oeste: 'true',
    });
    expect(pos).toMatchObject({
      orientacao: 'NORTE',
      celulas: '1',
      velocidade_media_mps: '0.25',
      parede_norte: '',
    });
    expect(ener).toMatchObject({
      tensao_v: '8.1',
      corrente_a: '-0.5',
      potencia_w: '4',
      estado: '',
    });
    expect(est).toMatchObject({ estado: 'MAPEANDO', recebida_em: '2026-10-20T14:00:00.000Z' });
  });

  it('põe entre aspas o texto com vírgula ou aspas (RFC 4180)', () => {
    expect(linhaCsv(item(MENSAGENS[5]!)).endsWith(',falha,"ToF 3, ""sem leitura"""')).toBe(true);
  });

  it('neutraliza texto que a planilha executaria como fórmula', () => {
    for (const perigoso of ['=HYPERLINK("x")', '+1', '-1', '@SOMA(A1)']) {
      const linha = linhaCsv(
        item({ ...env, tipo: 'fim_corrida', sequencia: 7, resultado: 'falha', detalhe: perigoso }),
      );
      const detalhe = linha.slice(linha.indexOf(',falha,') + ',falha,'.length);
      expect(detalhe.replace(/^"/, '').startsWith(`'${perigoso[0]}`)).toBe(true);
    }
  });

  it('tem uma coluna para cada campo de payload do protocolo v1', () => {
    const envelope = ['versao', 'corrida', 'sequencia', 'tempo_ms', 'tipo'];
    const campos = ['inicio_corrida', 'celula', 'posicao', 'energia', 'estado', 'fim_corrida']
      .flatMap((tipo) => {
        const esquema = JSON.parse(
          readFileSync(
            new URL(`../../../protocolo/v1/${tipo}.schema.json`, import.meta.url),
            'utf8',
          ),
        ) as { properties: Record<string, unknown> };
        return Object.keys(esquema.properties);
      })
      .filter((c) => !envelope.includes(c))
      .flatMap((c) =>
        c === 'paredes' ? ['parede_norte', 'parede_leste', 'parede_sul', 'parede_oeste'] : [c],
      );
    expect(COLUNAS_CSV).toEqual(expect.arrayContaining([...new Set(campos)]));
  });
});

describe('GET /api/corridas/{id}/exportacao (RF-98)', () => {
  let app: FastifyInstance;
  afterEach(() => app.close());

  const DETALHE = {
    id: ID,
    corrida_robo: 'c1',
    trajeto: [],
    energia: [],
  } as unknown as DetalheCorrida;

  async function montar() {
    const amb = new AmbienteEmMemoria();
    app = await construirApp({
      verificarBanco: async () => true,
      contadores: amb.contadores,
      ingestao: amb.servico,
      distribuicao: amb.distribuicao,
      validador: criarValidadorProtocolo(),
      consulta: new ServicoConsulta({
        detalheCorrida: async (id) => (id === ID ? DETALHE : null),
        leaderboard: async () => [],
      }),
      linhaDoTempo: new ServicoLinhaDoTempo(
        {
          corridaExiste: async (id) => id === ID,
          mensagensDepoisDe: async (_id, depoisDe, limite) =>
            MENSAGENS.filter((m) => m.sequencia > depoisDe)
              .slice(0, limite)
              .map(item),
        },
        4,
      ),
    });
  }

  it('JSON: o detalhe da corrida, como anexo', async () => {
    await montar();
    const r = await app.inject({ url: `/api/corridas/${ID}/exportacao?formato=json` });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('application/json');
    expect(r.headers['content-disposition']).toBe(`attachment; filename="corrida-${ID}.json"`);
    expect(r.json()).toEqual(DETALHE);
  });

  it('CSV: BOM, cabeçalho e uma linha por mensagem em ordem, atravessando os lotes', async () => {
    await montar();
    const r = await app.inject({ url: `/api/corridas/${ID}/exportacao?formato=csv` });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.headers['content-disposition']).toBe(`attachment; filename="corrida-${ID}.csv"`);
    expect(r.body.startsWith('﻿seq,t_robo_ms,tipo,')).toBe(true);
    const linhas = r.body.slice(1).trimEnd().split('\r\n');
    expect(linhas).toHaveLength(1 + MENSAGENS.length);
    expect(linhas.slice(1).map((l) => Number(l.split(',')[0]))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('404 para corrida inexistente nos dois formatos; 400 sem formato ou com formato inválido', async () => {
    await montar();
    const outro = 'aaaaaaaa-3a52-4c8e-9a51-1f0f5c1f2a33';
    for (const formato of ['json', 'csv']) {
      const r = await app.inject({ url: `/api/corridas/${outro}/exportacao?formato=${formato}` });
      expect(r.statusCode).toBe(404);
      expect(r.json()).toMatchObject({ code: 'CORRIDA_NAO_ENCONTRADA' });
    }
    for (const url of [
      `/api/corridas/${ID}/exportacao`,
      `/api/corridas/${ID}/exportacao?formato=xlsx`,
      '/api/corridas/123/exportacao?formato=csv',
    ])
      expect((await app.inject({ url })).statusCode).toBe(400);
  });
});
