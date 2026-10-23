import { Readable } from 'node:stream';
import type { FastifyBaseLogger, FastifyInstance, FastifyReply } from 'fastify';
import type { FiltrosListaCorridas, TipoLabirinto } from '../../../protocolo/tipos.js';
import {
  FiltroInvalido,
  type ServicoConsulta,
  type ServicoLinhaDoTempo,
} from '../../aplicacao/index.js';
import { STATUS_CORRIDA, TIPOS_LABIRINTO } from '../../dominio/index.js';
import { CABECALHO_CSV, linhaCsv } from './exportacao-csv.js';

export interface DependenciasCorridasHttp {
  consulta: ServicoConsulta;
  linhaDoTempo: ServicoLinhaDoTempo;
}

/** Maior `pagina` aceita na listagem. */
const PAGINA_MAXIMA = 100_000;

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

  // GET /api/corridas/{id}/exportacao?formato=json|csv — download da corrida (RF-98, HU-BE-27).
  app.get<{ Params: { id: string }; Querystring: { formato: 'json' | 'csv' } }>(
    '/api/corridas/:id/exportacao',
    {
      schema: {
        params: {
          type: 'object',
          properties: { id: { type: 'string', pattern: UUID } },
          required: ['id'],
        },
        querystring: {
          type: 'object',
          properties: { formato: { type: 'string', enum: ['json', 'csv'] } },
          required: ['formato'],
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params;
      const arquivo = `attachment; filename="corrida-${id}.${req.query.formato}"`;
      if (req.query.formato === 'json') {
        // O mesmo conteúdo do detalhe: resumo, métricas, trajeto e energia (CA1).
        const detalhe = await consulta.detalheCorrida(id);
        if (!detalhe) return corridaNaoEncontrada(reply);
        return reply
          .header('content-disposition', arquivo)
          .type('application/json; charset=utf-8')
          .send(detalhe);
      }
      // Uma linha por mensagem, em stream pelos mesmos lotes do replay (CA2, CA3).
      const itens = await linhaDoTempo.linhaDoTempo(id);
      if (!itens) return corridaNaoEncontrada(reply);
      const linhas = emLinhas(itens, (item) => `${linhaCsv(item)}\r\n`, req.log, {
        corrida: id,
        rota: 'exportacao',
      });
      return reply
        .header('content-disposition', arquivo)
        .type('text/csv; charset=utf-8')
        .send(Readable.from(comCabecalho(CABECALHO_CSV, linhas)));
    },
  );

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
            // Com tamanho ≤ 100, limita o deslocamento a 10⁷: sem o máximo, uma página enorme
            // passaria pela validação e estouraria o bigint no banco (500).
            pagina: { type: 'integer', minimum: 1, maximum: PAGINA_MAXIMA },
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

function corridaNaoEncontrada(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({
    statusCode: 404,
    code: 'CORRIDA_NAO_ENCONTRADA',
    error: 'Not Found',
    message: 'corrida não encontrada',
  });
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

/** O cabeçalho primeiro, depois as linhas. */
async function* comCabecalho(
  cabecalho: string,
  linhas: AsyncIterable<string>,
): AsyncGenerator<string> {
  yield cabecalho;
  yield* linhas;
}
