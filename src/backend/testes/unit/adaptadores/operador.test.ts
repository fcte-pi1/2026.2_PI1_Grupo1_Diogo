import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { RespostaLogin } from '../../../protocolo/tipos.js';
import { criarValidadorProtocolo } from '../../../protocolo/validador.js';
import { ServicoConsulta } from '../../../src/aplicacao/index.js';
import { construirApp } from '../../../src/app.js';
import { AmbienteEmMemoria } from '../../apoio/ingestao-em-memoria.js';
import { operadorEmMemoria, SENHA_OP1 } from '../../apoio/operador-em-memoria.js';

const CONCLUIDA = '0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a01';
const FALHOU = '0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a02';
const EM_ANDAMENTO = '0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a03';
const INEXISTENTE = '0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a09';

let app: FastifyInstance;
let operador: ReturnType<typeof operadorEmMemoria>;
afterEach(() => app.close());

async function montar() {
  const amb = new AmbienteEmMemoria();
  operador = operadorEmMemoria();
  operador.corridas.set(CONCLUIDA, { status: 'CONCLUIDA', labirinto: '4x4', anulada: false });
  operador.corridas.set(FALHOU, { status: 'FALHOU', labirinto: '4x4', anulada: false });
  operador.corridas.set(EM_ANDAMENTO, { status: 'EM_ANDAMENTO', labirinto: '4x4', anulada: false });
  app = await construirApp({
    ...operador.deps,
    verificarBanco: async () => true,
    contadores: amb.contadores,
    ingestao: amb.servico,
    distribuicao: amb.distribuicao,
    validador: criarValidadorProtocolo(),
    consulta: new ServicoConsulta({
      detalheCorrida: async () => null,
      leaderboard: async () => [],
    }),
  });
}

async function token(): Promise<string> {
  const resposta = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { login: 'op1', senha: SENHA_OP1 },
  });
  return (resposta.json() as RespostaLogin).token;
}

const anular = async (id: string, motivo: unknown, autorizacao?: string) =>
  app.inject({
    method: 'POST',
    url: `/api/corridas/${id}/anulacao`,
    payload: { motivo },
    headers: autorizacao ? { authorization: `Bearer ${autorizacao}` } : {},
  });

describe('POST /api/auth/login (RNF-55)', () => {
  it('login certo devolve o token, a validade e o operador', async () => {
    await montar();
    const resposta = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'op1', senha: SENHA_OP1 },
    });
    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json() as RespostaLogin;
    expect(corpo.operador).toEqual({ login: 'op1', nome: 'Operador 1' });
    expect(corpo.token.split('.')).toHaveLength(3);
    const horas = (Date.parse(corpo.expira_em) - Date.now()) / 3_600_000;
    expect(horas).toBeGreaterThan(7.9);
  });

  it.each([
    ['senha errada', { login: 'op1', senha: 'errada' }],
    ['login inexistente', { login: 'ninguem', senha: SENHA_OP1 }],
  ])('%s: 401 com a mesma resposta', async (_, payload) => {
    await montar();
    const resposta = await app.inject({ method: 'POST', url: '/api/auth/login', payload });
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toMatchObject({
      code: 'CREDENCIAIS_INVALIDAS',
      message: 'login ou senha inválidos',
    });
  });

  it('sem login ou senha: 400', async () => {
    await montar();
    const resposta = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { login: 'op1' },
    });
    expect(resposta.statusCode).toBe(400);
  });
});

describe('POST /api/corridas/{id}/anulacao (RF-96, CT-BE-29)', () => {
  it('passo 1: sem token, 401 e nada muda (mesmo com o corpo inválido)', async () => {
    await montar();
    expect((await anular(CONCLUIDA, 'toque manual')).statusCode).toBe(401);
    const semCorpo = await app.inject({
      method: 'POST',
      url: `/api/corridas/${CONCLUIDA}/anulacao`,
    });
    expect(semCorpo.statusCode).toBe(401);
    expect(operador.anulacoes.size).toBe(0);
  });

  it('token adulterado: 401', async () => {
    await montar();
    const t = await token();
    const adulterado = `${t.slice(0, -4)}AAAA`;
    expect((await anular(CONCLUIDA, 'toque manual', adulterado)).statusCode).toBe(401);
  });

  it('passo 2: motivo vazio ou só espaços, 400', async () => {
    await montar();
    const t = await token();
    for (const motivo of ['', '   ']) {
      const resposta = await anular(CONCLUIDA, motivo, t);
      expect(resposta.statusCode).toBe(400);
    }
    expect(operador.anulacoes.size).toBe(0);
  });

  it('passos 3 e 4: anula com autor, data e motivo, e a segunda vez dá 409', async () => {
    await montar();
    const t = await token();
    const primeira = await anular(CONCLUIDA, '  houve toque manual ', t);
    expect(primeira.statusCode).toBe(201);
    expect(primeira.json()).toMatchObject({ motivo: 'houve toque manual', operador: 'op1' });
    expect(operador.anulacoes.get(CONCLUIDA)?.operadorId).toBe('operador-1');

    const segunda = await anular(CONCLUIDA, 'de novo', t);
    expect(segunda.statusCode).toBe(409);
    expect(segunda.json()).toMatchObject({ code: 'CORRIDA_JA_ANULADA' });
  });

  it('passo 6: corrida em andamento, 409; inexistente, 404', async () => {
    await montar();
    const t = await token();
    const andamento = await anular(EM_ANDAMENTO, 'toque manual', t);
    expect(andamento.statusCode).toBe(409);
    expect(andamento.json()).toMatchObject({ code: 'CORRIDA_EM_ANDAMENTO' });
    expect((await anular(INEXISTENTE, 'toque manual', t)).statusCode).toBe(404);
  });

  it('avisa que o ranking mudou só quando a anulada estava nele (CONCLUIDA)', async () => {
    await montar();
    const t = await token();
    await anular(FALHOU, 'robô empurrado', t);
    expect(operador.eventos).toEqual([]);
    await anular(CONCLUIDA, 'toque manual', t);
    expect(operador.eventos).toEqual([
      { evento: 'ranking-alterado', dados: { corridaId: CONCLUIDA, labirinto: '4x4' } },
    ]);
  });
});

describe('apresentações (RF-97)', () => {
  it('listar não exige login; abrir e encerrar exigem', async () => {
    await montar();
    expect((await app.inject({ method: 'GET', url: '/api/apresentacoes' })).statusCode).toBe(200);
    const semToken = await app.inject({
      method: 'POST',
      url: '/api/apresentacoes',
      payload: { nome: 'Final' },
    });
    expect(semToken.statusCode).toBe(401);
  });

  it('abrir uma apresentação encerra a que estava ativa; encerrar a deixa inativa', async () => {
    await montar();
    const t = await token();
    const cabecalho = { authorization: `Bearer ${t}` };
    const teste = await app.inject({
      method: 'POST',
      url: '/api/apresentacoes',
      payload: { nome: 'Teste' },
      headers: cabecalho,
    });
    expect(teste.statusCode).toBe(201);
    const final = await app.inject({
      method: 'POST',
      url: '/api/apresentacoes',
      payload: { nome: 'Final' },
      headers: cabecalho,
    });
    const lista = (await app.inject({ method: 'GET', url: '/api/apresentacoes' })).json() as {
      nome: string;
      ativa: boolean;
    }[];
    expect(lista.map((a) => [a.nome, a.ativa])).toEqual([
      ['Teste', false],
      ['Final', true],
    ]);

    const id = (final.json() as { id: string }).id;
    const encerrada = await app.inject({
      method: 'PATCH',
      url: `/api/apresentacoes/${id}`,
      payload: { ativa: false },
      headers: cabecalho,
    });
    expect(encerrada.json()).toMatchObject({ nome: 'Final', ativa: false });
  });

  it.each([
    ['nome vazio', 'POST', '/api/apresentacoes', { nome: '   ' }, 400],
    ['reativar pelo PATCH', 'PATCH', `/api/apresentacoes/${INEXISTENTE}`, { ativa: true }, 400],
    [
      'apresentação inexistente',
      'PATCH',
      `/api/apresentacoes/${INEXISTENTE}`,
      { ativa: false },
      404,
    ],
  ] as const)('%s: %s', async (_, method, url, payload, status) => {
    await montar();
    const resposta = await app.inject({
      method,
      url,
      payload,
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(resposta.statusCode).toBe(status);
  });
});
