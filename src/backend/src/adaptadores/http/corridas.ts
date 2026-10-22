import { Readable } from 'node:stream';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
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
      const linhas = emLinhas(itens, (item) => `${JSON.stringify(item)}\n`, req.log, {
        corrida: req.params.id,
        rota: 'linha-do-tempo',
      });
      return reply.type('application/x-ndjson; charset=utf-8').send(Readable.from(linhas));
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

/**
 * Uma linha por item, à medida que os lotes chegam do banco. O `Readable.from` só pede o
 * próximo item quando o cliente consome o anterior (backpressure).
 *
 * Se a leitura falhar no meio, o `200` e parte do corpo já saíram: não há como mudar o
 * status. O erro é registrado com o contexto e relançado, e o Fastify aborta a conexão. O
 * cliente vê a transferência interrompida (o `fetch` rejeita), e não um arquivo truncado
 * que pareceria completo, o que aconteceria se o stream terminasse normalmente.
 */
async function* emLinhas<T>(
  itens: AsyncIterable<T>,
  formatar: (item: T) => string,
  log: FastifyBaseLogger,
  contexto: Record<string, string>,
): AsyncGenerator<string> {
  let enviadas = 0;
  try {
    for await (const item of itens) {
      yield formatar(item);
      enviadas++;
    }
  } catch (erro) {
    log.error({ err: erro, ...contexto, enviadas }, 'leitura interrompida no meio do stream');
    throw erro;
  }
}
