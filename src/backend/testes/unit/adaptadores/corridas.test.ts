import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type {
  CorridaResumo,
  DetalheCorrida,
  PosicaoLeaderboard,
} from '../../../protocolo/tipos.js';
import { criarValidadorProtocolo } from '../../../protocolo/validador.js';
import { ServicoConsulta, type FiltrosListagem } from '../../../src/aplicacao/index.js';
import { construirApp } from '../../../src/app.js';
import { AmbienteEmMemoria } from '../../apoio/ingestao-em-memoria.js';

const ID = '0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33';
const DETALHE = { id: ID, corrida_robo: 'r1', status: 'CONCLUIDA' } as DetalheCorrida;
const PRIMEIRA = { posicao: 1, id: ID, tempo_conclusao_ms: 60_000 } as PosicaoLeaderboard;

let app: FastifyInstance;
const consultados: string[] = [];
const rankings: [string, string | null][] = [];
const listagens: FiltrosListagem[] = [];
const RESUMO = { id: ID, status: 'CONCLUIDA' } as CorridaResumo;
afterEach(() => app.close());

async function montar() {
  const amb = new AmbienteEmMemoria();
  app = await construirApp({
    verificarBanco: async () => true,
    contadores: amb.contadores,
    ingestao: amb.servico,
    distribuicao: amb.distribuicao,
    validador: criarValidadorProtocolo(),
    consulta: new ServicoConsulta({
      detalheCorrida: async (id) => {
        consultados.push(id);
        return id === ID ? DETALHE : null;
      },
      listarCorridas: async (filtros) => {
        listagens.push(filtros);
        return { itens: [RESUMO], total: 45 };
      },
      leaderboard: async (labirinto, apresentacao) => {
        rankings.push([labirinto, apresentacao]);
        return labirinto === '4x4' ? [PRIMEIRA] : [];
      },
    }),
  });
}

describe('GET /api/corridas/:id', () => {
  it('devolve o detalhe da corrida', async () => {
    await montar();
    const resposta = await app.inject({ method: 'GET', url: `/api/corridas/${ID}` });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual(DETALHE);
  });

  it('404 quando a corrida não existe', async () => {
    await montar();
    const resposta = await app.inject({
      method: 'GET',
      url: '/api/corridas/aaaaaaaa-3a52-4c8e-9a51-1f0f5c1f2a33',
    });
    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({
      statusCode: 404,
      code: 'CORRIDA_NAO_ENCONTRADA',
      error: 'Not Found',
      message: 'corrida não encontrada',
    });
  });

  it('400 quando o id não é um UUID, sem consultar o banco', async () => {
    await montar();
    consultados.length = 0;
    const resposta = await app.inject({
      method: 'GET',
      url: "/api/corridas/1'; drop table corrida",
    });
    expect(resposta.statusCode).toBe(400);
    expect(consultados).toHaveLength(0);
  });
});

describe('GET /api/leaderboard', () => {
  it('devolve o ranking do labirinto, de todas as corridas', async () => {
    await montar();
    const resposta = await app.inject({ method: 'GET', url: '/api/leaderboard?labirinto=4x4' });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ labirinto: '4x4', apresentacao: null, itens: [PRIMEIRA] });
    expect(rankings.at(-1)).toEqual(['4x4', null]);
  });

  it('filtra pela apresentação', async () => {
    await montar();
    const resposta = await app.inject({
      method: 'GET',
      url: `/api/leaderboard?labirinto=8x4&apresentacao=${ID}`,
    });
    expect(resposta.json()).toEqual({ labirinto: '8x4', apresentacao: ID, itens: [] });
    expect(rankings.at(-1)).toEqual(['8x4', ID]);
  });

  it.each([
    ['sem labirinto', '/api/leaderboard'],
    ['labirinto inexistente', '/api/leaderboard?labirinto=5x5'],
    ['apresentação que não é UUID', '/api/leaderboard?labirinto=4x4&apresentacao=1'],
  ])('400 %s, sem consultar o banco', async (_, url) => {
    await montar();
    rankings.length = 0;
    const resposta = await app.inject({ method: 'GET', url });
    expect(resposta.statusCode).toBe(400);
    expect(rankings).toHaveLength(0);
  });
});

describe('GET /api/corridas', () => {
  const listar = async (url: string) => {
    await montar();
    listagens.length = 0;
    return app.inject({ method: 'GET', url });
  };

  it('sem filtros: primeira página de 20, da mais recente para a mais antiga', async () => {
    const resposta = await listar('/api/corridas');
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ itens: [RESUMO], total: 45, pagina: 1, tamanho: 20 });
    expect(listagens).toEqual([
      { tipo: null, status: null, de: null, antesDe: null, limite: 20, deslocamento: 0 },
    ]);
  });

  it('filtros combinados e a página pedida', async () => {
    await listar('/api/corridas?tipo=4x4&status=CONCLUIDA&pagina=3&tamanho=10');
    expect(listagens[0]).toMatchObject({
      tipo: '4x4',
      status: 'CONCLUIDA',
      limite: 10,
      deslocamento: 20,
    });
  });

  it('tamanho acima de 100 é limitado a 100, sem erro', async () => {
    const resposta = await listar('/api/corridas?tamanho=500');
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ tamanho: 100 });
    expect(listagens[0]!.limite).toBe(100);
  });

  it('só a data vale o dia inteiro em UTC; data e hora valem como vieram', async () => {
    await listar('/api/corridas?de=2026-10-14&ate=2026-10-14');
    expect(listagens[0]).toMatchObject({
      de: new Date('2026-10-14T00:00:00Z'),
      antesDe: new Date('2026-10-15T00:00:00Z'),
    });
    await listar('/api/corridas?de=2026-10-14T00:00:00-03:00&ate=2026-10-14T23:59:59-03:00');
    expect(listagens[0]).toMatchObject({
      de: new Date('2026-10-14T03:00:00Z'),
      antesDe: new Date('2026-10-15T02:59:59.001Z'),
    });
  });

  it.each([
    ['tipo inexistente', '/api/corridas?tipo=5x5', 'FST_ERR_VALIDATION'],
    ['status inexistente', '/api/corridas?status=PERDIDA', 'FST_ERR_VALIDATION'],
    ['página zero', '/api/corridas?pagina=0', 'FST_ERR_VALIDATION'],
    ['página acima de 100000', '/api/corridas?pagina=100001', 'FST_ERR_VALIDATION'],
    [
      'página gigante (estouraria o bigint)',
      '/api/corridas?pagina=100000000000000000000',
      'FST_ERR_VALIDATION',
    ],
    ['tamanho zero', '/api/corridas?tamanho=0', 'FST_ERR_VALIDATION'],
    ['data que não é ISO 8601', '/api/corridas?de=14/10/2026', 'FILTRO_INVALIDO'],
    ['data impossível', '/api/corridas?ate=2026-02-30T10:00:00Z', 'FILTRO_INVALIDO'],
    ['de depois de ate', '/api/corridas?de=2026-10-15&ate=2026-10-14', 'FILTRO_INVALIDO'],
  ])('400 com %s, sem consultar o banco', async (_, url, code) => {
    const resposta = await listar(url);
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({ code });
    expect(listagens).toHaveLength(0);
  });
});
