import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DetalheCorrida, PosicaoLeaderboard } from '../../../protocolo/tipos.js';
import { criarValidadorProtocolo } from '../../../protocolo/validador.js';
import { ServicoConsulta } from '../../../src/aplicacao/index.js';
import { construirApp } from '../../../src/app.js';
import { AmbienteEmMemoria } from '../../apoio/ingestao-em-memoria.js';

const ID = '0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33';
const DETALHE = { id: ID, corrida_robo: 'r1', status: 'CONCLUIDA' } as DetalheCorrida;
const PRIMEIRA = { posicao: 1, id: ID, tempo_conclusao_ms: 60_000 } as PosicaoLeaderboard;

let app: FastifyInstance;
const consultados: string[] = [];
const rankings: [string, string | null][] = [];
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
    expect(resposta.json()).toMatchObject({ message: 'corrida não encontrada' });
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
