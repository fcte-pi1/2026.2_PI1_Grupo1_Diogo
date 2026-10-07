import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../../src/app.js';

describe('GET /health', () => {
  let app: FastifyInstance;
  afterEach(() => app.close());

  it('responde 200 quando o banco está disponível', async () => {
    app = await construirApp({ verificarBanco: async () => true });
    const resposta = await app.inject({ method: 'GET', url: '/health' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ status: 'ok', banco: 'ok' });
    expect(resposta.json().event_loop_atraso_ms).toHaveProperty('p99');
  });

  it('responde 503 quando o banco está indisponível', async () => {
    app = await construirApp({ verificarBanco: async () => false });
    const resposta = await app.inject({ method: 'GET', url: '/health' });

    expect(resposta.statusCode).toBe(503);
    expect(resposta.json()).toMatchObject({ status: 'degradado', banco: 'indisponivel' });
  });
});
