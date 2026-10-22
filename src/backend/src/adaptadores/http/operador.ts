import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  RequisicaoAbrirApresentacao,
  RequisicaoAnulacao,
  RequisicaoLogin,
  RespostaLogin,
} from '../../../protocolo/tipos.js';
import {
  AnulacaoRecusada,
  type MotivoRecusaAnulacao,
  type OperadorAutenticado,
  type ServicoAnulacao,
  type ServicoApresentacoes,
  type ServicoAutenticacao,
} from '../../aplicacao/index.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; login: string; nome: string };
    user: { sub: string; login: string; nome: string };
  }
}

export interface DependenciasOperadorHttp {
  autenticacao: ServicoAutenticacao;
  anulacao: ServicoAnulacao;
  apresentacoes: ServicoApresentacoes;
  jwtSegredo: string;
}

/** Validade do token do operador: um dia de apresentação. */
export const VALIDADE_TOKEN_S = 8 * 60 * 60;

const UUID = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const PARAMETRO_ID = {
  type: 'object',
  properties: { id: { type: 'string', pattern: UUID } },
  required: ['id'],
} as const;

const RESPOSTA_RECUSA: Record<MotivoRecusaAnulacao, { status: number; mensagem: string }> = {
  MOTIVO_VAZIO: { status: 400, mensagem: 'informe o motivo da anulação' },
  CORRIDA_NAO_ENCONTRADA: { status: 404, mensagem: 'corrida não encontrada' },
  CORRIDA_EM_ANDAMENTO: { status: 409, mensagem: 'só uma corrida terminada pode ser anulada' },
  CORRIDA_JA_ANULADA: { status: 409, mensagem: 'a corrida já foi anulada' },
};
const NOME_ERRO: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  404: 'Not Found',
  409: 'Conflict',
};

function erro(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.code(statusCode).send({ statusCode, code, error: NOME_ERRO[statusCode], message });
}

/**
 * Rotas do operador (RF-96, RF-97, RNF-55): o login e as únicas escritas que não vêm do
 * robô. O painel continua só lendo; as escritas exigem `Authorization: Bearer <token>`.
 */
export async function rotasOperador(
  app: FastifyInstance,
  { autenticacao, anulacao, apresentacoes, jwtSegredo }: DependenciasOperadorHttp,
): Promise<void> {
  await app.register(fastifyJwt, {
    secret: jwtSegredo,
    sign: { expiresIn: VALIDADE_TOKEN_S },
  });

  // No onRequest, antes da validação do corpo: sem login, a resposta é sempre 401.
  const exigirOperador = async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return erro(reply, 401, 'NAO_AUTENTICADO', 'faça login como operador');
    }
  };
  const operadorDe = (req: FastifyRequest): OperadorAutenticado => ({
    id: req.user.sub,
    login: req.user.login,
    nome: req.user.nome,
  });

  // POST /api/auth/login — login do operador (RNF-55).
  app.post<{ Body: RequisicaoLogin }>(
    '/api/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            login: { type: 'string', minLength: 1, maxLength: 100 },
            senha: { type: 'string', minLength: 1, maxLength: 200 },
          },
          required: ['login', 'senha'],
        },
      },
    },
    async (req, reply) => {
      const operador = await autenticacao.entrar(req.body.login, req.body.senha);
      if (!operador) {
        // A mesma resposta para login inexistente e senha errada.
        return erro(reply, 401, 'CREDENCIAIS_INVALIDAS', 'login ou senha inválidos');
      }
      const token = await reply.jwtSign({
        sub: operador.id,
        login: operador.login,
        nome: operador.nome,
      });
      const resposta: RespostaLogin = {
        token,
        expira_em: new Date(Date.now() + VALIDADE_TOKEN_S * 1000).toISOString(),
        operador: { login: operador.login, nome: operador.nome },
      };
      return resposta;
    },
  );

  // POST /api/corridas/{id}/anulacao — anular com justificativa (RF-96, HU-BE-25).
  app.post<{ Params: { id: string }; Body: RequisicaoAnulacao }>(
    '/api/corridas/:id/anulacao',
    {
      onRequest: exigirOperador,
      schema: {
        params: PARAMETRO_ID,
        body: {
          type: 'object',
          properties: { motivo: { type: 'string', maxLength: 500 } },
          required: ['motivo'],
        },
      },
    },
    async (req, reply) => {
      try {
        const resultado = await anulacao.anular(req.params.id, operadorDe(req), req.body.motivo);
        return reply.code(201).send(resultado);
      } catch (e) {
        if (!(e instanceof AnulacaoRecusada)) throw e;
        const { status, mensagem } = RESPOSTA_RECUSA[e.codigo];
        return erro(reply, status, e.codigo, mensagem);
      }
    },
  );

  // GET /api/apresentacoes — leitura, sem login.
  app.get('/api/apresentacoes', () => apresentacoes.listar());

  // POST /api/apresentacoes — abrir (e encerrar a ativa) (RF-97).
  app.post<{ Body: RequisicaoAbrirApresentacao }>(
    '/api/apresentacoes',
    {
      onRequest: exigirOperador,
      schema: {
        body: {
          type: 'object',
          properties: { nome: { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' } },
          required: ['nome'],
        },
      },
    },
    async (req, reply) => reply.code(201).send(await apresentacoes.abrir(req.body.nome)),
  );

  // PATCH /api/apresentacoes/{id} — encerrar (RF-97).
  app.patch<{ Params: { id: string } }>(
    '/api/apresentacoes/:id',
    {
      onRequest: exigirOperador,
      schema: {
        params: PARAMETRO_ID,
        body: {
          type: 'object',
          properties: { ativa: { const: false } },
          required: ['ativa'],
        },
      },
    },
    async (req, reply) => {
      const encerrada = await apresentacoes.encerrar(req.params.id);
      if (!encerrada) {
        return erro(reply, 404, 'APRESENTACAO_NAO_ENCONTRADA', 'apresentação não encontrada');
      }
      return encerrada;
    },
  );
}
