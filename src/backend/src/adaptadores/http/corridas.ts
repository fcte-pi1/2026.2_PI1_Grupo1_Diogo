import type { FastifyInstance } from 'fastify';
import type { FiltrosListaCorridas, TipoLabirinto } from '../../../protocolo/tipos.js';
import { FiltroInvalido, type ServicoConsulta } from '../../aplicacao/index.js';
import { TIPOS_LABIRINTO } from '../../dominio/index.js';

export interface DependenciasCorridasHttp {
  consulta: ServicoConsulta;
}

/** Valores de `status_corrida` no banco (`StatusCorrida` em `@protocolo`). */
const STATUS_CORRIDA = ['EM_ANDAMENTO', 'CONCLUIDA', 'FALHOU', 'INTERROMPIDA'] as const;

const UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

/** Rotas de consulta das corridas e do ranking (arquitetura do backend, §2.5; contrato em `protocolo/v1/API.md`). */
export async function rotasCorridas(
  app: FastifyInstance,
  { consulta }: DependenciasCorridasHttp,
): Promise<void> {
  // GET /api/corridas — histórico com filtros e paginação (RF-93, HU-BE-22).
  app.get<{ Querystring: FiltrosListaCorridas }>(
    '/api/corridas',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            tipo: { type: 'string', enum: [...TIPOS_LABIRINTO] },
            status: { type: 'string', enum: [...STATUS_CORRIDA] },
            de: { type: 'string', maxLength: 40 },
            ate: { type: 'string', maxLength: 40 },
            pagina: { type: 'integer', minimum: 1 },
            // Acima de 100 não é erro: o serviço limita a 100 (contrato em API.md).
            tamanho: { type: 'integer', minimum: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        return await consulta.listarCorridas(req.query);
      } catch (erro) {
        if (!(erro instanceof FiltroInvalido)) throw erro;
        return reply.code(400).send({
          statusCode: 400,
          code: 'FILTRO_INVALIDO',
          error: 'Bad Request',
          message: erro.message,
        });
      }
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
