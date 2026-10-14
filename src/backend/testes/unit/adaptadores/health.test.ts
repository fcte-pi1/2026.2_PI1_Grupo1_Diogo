import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { criarValidadorProtocolo } from '../../../protocolo/validador.js';
import { ServicoConsulta } from '../../../src/aplicacao/index.js';
import { construirApp } from '../../../src/app.js';
import { AmbienteEmMemoria } from '../../apoio/ingestao-em-memoria.js';

describe('GET /health', () => {
  let app: FastifyInstance;
  const amb = new AmbienteEmMemoria();
  const deps = {
    contadores: amb.contadores,
    ingestao: amb.servico,
    consulta: new ServicoConsulta({ detalheCorrida: async () => null }),
    distribuicao: amb.distribuicao,
    validador: criarValidadorProtocolo(),
  };
  afterEach(() => app.close());

  it('responde 200 quando o banco está disponível', async () => {
    app = await construirApp({ ...deps, verificarBanco: async () => true });
    const resposta = await app.inject({ method: 'GET', url: '/health' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ status: 'ok', banco: 'ok' });
    expect(resposta.json().event_loop_atraso_ms).toHaveProperty('p99');
    expect(resposta.json().ingestao).toEqual({
      mensagens_aceitas: 0,
      mensagens_duplicadas: 0,
      mensagens_rejeitadas: 0,
      conexoes_recusadas: 0,
    });
  });

  it('responde 503 quando o banco está indisponível', async () => {
    app = await construirApp({ ...deps, verificarBanco: async () => false });
    const resposta = await app.inject({ method: 'GET', url: '/health' });

    expect(resposta.statusCode).toBe(503);
    expect(resposta.json()).toMatchObject({ status: 'degradado', banco: 'indisponivel' });
  });
});
