import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { criarValidadorProtocolo } from '../../../protocolo/validador.js';
import { ServicoConsulta, ServicoLinhaDoTempo } from '../../../src/aplicacao/index.js';
import { construirApp } from '../../../src/app.js';
import { AmbienteEmMemoria } from '../../apoio/ingestao-em-memoria.js';

const ID = '0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33';

describe('GET /api/corridas/{id}/linha-do-tempo (RF-94)', () => {
  let app: FastifyInstance;
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
        detalheCorrida: async () => null,
        leaderboard: async () => [],
      }),
      linhaDoTempo: new ServicoLinhaDoTempo(
        {
          corridaExiste: async (id) => id === ID,
          mensagensDepoisDe: async (_id, depoisDe, limite) =>
            [1, 2, 3]
              .filter((s) => s > depoisDe)
              .slice(0, limite)
              .map((s) => ({
                sequencia: s,
                tempo_ms: s * 100,
                tipo: 'estado' as const,
                recebida_em: new Date(0).toISOString(),
                mensagem: {
                  versao: 1 as const,
                  tipo: 'estado' as const,
                  corrida: 'c1',
                  sequencia: s,
                  tempo_ms: s * 100,
                  estado: 'MAPEANDO',
                },
              })),
        },
        2,
      ),
    });
  }

  it('responde em NDJSON: uma mensagem por linha, em ordem', async () => {
    await montar();
    const resposta = await app.inject({ method: 'GET', url: `/api/corridas/${ID}/linha-do-tempo` });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toContain('application/x-ndjson');
    const linhas = resposta.body
      .trimEnd()
      .split('\n')
      .map((l) => JSON.parse(l) as { sequencia: number });
    expect(linhas.map((l) => l.sequencia)).toEqual([1, 2, 3]);
    expect(resposta.body.endsWith('\n')).toBe(true);
  });

  it('404 para corrida inexistente e 400 para id que não é UUID', async () => {
    await montar();
    const inexistente = await app.inject({
      method: 'GET',
      url: '/api/corridas/aaaaaaaa-3a52-4c8e-9a51-1f0f5c1f2a33/linha-do-tempo',
    });
    expect(inexistente.statusCode).toBe(404);
    expect(inexistente.json()).toMatchObject({ code: 'CORRIDA_NAO_ENCONTRADA' });
    expect(
      (await app.inject({ method: 'GET', url: '/api/corridas/123/linha-do-tempo' })).statusCode,
    ).toBe(400);
  });
});
