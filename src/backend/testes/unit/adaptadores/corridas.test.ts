import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DetalheCorrida } from '../../../protocolo/tipos.js';
import { criarValidadorProtocolo } from '../../../protocolo/validador.js';
import { ServicoConsulta } from '../../../src/aplicacao/index.js';
import { construirApp } from '../../../src/app.js';
import { AmbienteEmMemoria } from '../../apoio/ingestao-em-memoria.js';

const ID = '0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33';
const DETALHE = { id: ID, corrida_robo: 'r1', status: 'CONCLUIDA' } as DetalheCorrida;

describe('GET /api/corridas/:id', () => {
  let app: FastifyInstance;
  const consultados: string[] = [];
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
      }),
    });
  }

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
