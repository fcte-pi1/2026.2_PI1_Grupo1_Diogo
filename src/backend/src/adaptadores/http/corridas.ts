import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import type { TipoLabirinto } from '../../../protocolo/tipos.js';
import type { ServicoConsulta, ServicoLinhaDoTempo } from '../../aplicacao/index.js';
import { TIPOS_LABIRINTO } from '../../dominio/index.js';

export interface DependenciasCorridasHttp {
  consulta: ServicoConsulta;
  linhaDoTempo: ServicoLinhaDoTempo;
}

const UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

/** Rotas de consulta das corridas e do ranking (arquitetura do backend, §2.5; contrato em `protocolo/v1/API.md`). */
export async function rotasCorridas(
  app: FastifyInstance,
  { consulta, linhaDoTempo }: DependenciasCorridasHttp,
): Promise<void> {
  // GET /api/corridas/{id}/linha-do-tempo — replay em NDJSON, em stream (RF-94, HU-BE-23).
  app.get<{ Params: { id: string } }>(
    '/api/corridas/:id/linha-do-tempo',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', pattern: UUID } },
          required: ['id'],
        },
      },
    },
    async (req, reply) => {
      const itens = await linhaDoTempo.linhaDoTempo(req.params.id);
      if (!itens) {
        return reply.code(404).send({
          statusCode: 404,
          code: 'CORRIDA_NAO_ENCONTRADA',
          error: 'Not Found',
          message: 'corrida não encontrada',
        });
      }
      return reply.type('application/x-ndjson; charset=utf-8').send(Readable.from(ndjson(itens)));
    },
  );

  // GET /api/corridas/{id} — detalhe com métricas, trajeto e energia (RF-84, RF-85).
  app.get<{ Params: { id: string } }>(
    '/api/corridas/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', pattern: UUID } },
          required: ['id'],
        },
      },
    },
    async (req, reply) => {
      const detalhe = await consulta.detalheCorrida(req.params.id);
      if (!detalhe) {
        return reply.code(404).send({
          statusCode: 404,
          code: 'CORRIDA_NAO_ENCONTRADA',
          error: 'Not Found',
          message: 'corrida não encontrada',
        });
      }
      return detalhe;
    },
  );

  // GET /api/leaderboard?labirinto&apresentacao — ranking por tipo de labirinto (RF-95).
  app.get<{ Querystring: { labirinto: TipoLabirinto; apresentacao?: string } }>(
    '/api/leaderboard',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            labirinto: { type: 'string', enum: [...TIPOS_LABIRINTO] },
            apresentacao: { type: 'string', pattern: UUID },
          },
          required: ['labirinto'],
        },
      },
    },
    (req) => consulta.leaderboard(req.query.labirinto, req.query.apresentacao ?? null),
  );
}

/** Um objeto JSON por linha (NDJSON), à medida que os lotes chegam do banco. */
async function* ndjson(itens: AsyncIterable<unknown>): AsyncGenerator<string> {
  for await (const item of itens) yield `${JSON.stringify(item)}\n`;
}
