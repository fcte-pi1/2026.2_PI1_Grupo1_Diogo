import type { FastifyInstance } from 'fastify';
import type { TipoLabirinto } from '../../../protocolo/tipos.js';
import type { ServicoConsulta } from '../../aplicacao/index.js';
import { TIPOS_LABIRINTO } from '../../dominio/index.js';

export interface DependenciasCorridasHttp {
  consulta: ServicoConsulta;
}

const UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

/** Rotas de consulta das corridas e do ranking (arquitetura do backend, §2.5; contrato em `protocolo/v1/API.md`). */
export async function rotasCorridas(
  app: FastifyInstance,
  { consulta }: DependenciasCorridasHttp,
): Promise<void> {
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
