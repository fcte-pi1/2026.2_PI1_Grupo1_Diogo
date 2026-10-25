/**
 * Ponta a ponta do servidor HTTP e WebSocket, sem banco de dados: o app sobe numa porta real e
 * é lido com `fetch` e `ws`, como o navegador e o robô fariam. Serve o painel compilado, o
 * contrato de erro da API, a saúde e o prazo do `hello`.
 *
 * Não precisa de Docker. Executar com `npm run test:e2e`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import WebSocketNode from 'ws';
import { CodigoFechamento } from '../../protocolo/tipos.js';
import { criarValidadorProtocolo } from '../../protocolo/validador.js';
import { ServicoConsulta } from '../../src/aplicacao/index.js';
import { construirApp } from '../../src/app.js';
import { AmbienteEmMemoria } from '../apoio/ingestao-em-memoria.js';
import { linhaDoTempoVazia } from '../apoio/linha-do-tempo-vazia.js';

const PAGINA_DO_PAINEL = '<!doctype html><title>Painel</title><div id="raiz">painel-e2e</div>';

describe('servidor HTTP e WebSocket (sem banco)', () => {
  let painelDir: string;
  let ambiente: AmbienteEmMemoria | null = null;
  let app: FastifyInstance | null = null;

  beforeAll(() => {
    painelDir = mkdtempSync(join(tmpdir(), 'painel-e2e-'));
    mkdirSync(join(painelDir, 'assets'));
    writeFileSync(join(painelDir, 'index.html'), PAGINA_DO_PAINEL);
    writeFileSync(join(painelDir, 'assets', 'app-abc123.js'), 'console.log("painel");');
  });

  afterAll(() => rmSync(painelDir, { recursive: true, force: true }));

  afterEach(async () => {
    ambiente?.distribuicao.parar();
    await app?.close();
    ambiente = null;
    app = null;
  });

  interface Opcoes {
    painelDir?: string | null;
    bancoOk?: boolean;
    prazoHelloMs?: number;
  }

  async function montar(opcoes: Opcoes = {}) {
    ambiente = new AmbienteEmMemoria();
    app = await construirApp({
      linhaDoTempo: linhaDoTempoVazia(),
      verificarBanco: async () => opcoes.bancoOk ?? true,
      contadores: ambiente.contadores,
      ingestao: ambiente.servico,
      distribuicao: ambiente.distribuicao,
      validador: criarValidadorProtocolo(),
      consulta: new ServicoConsulta({
        detalheCorrida: async () => null,
        leaderboard: async () => [],
        listarCorridas: async () => ({ itens: [], total: 0 }),
      }),
      painelDir: opcoes.painelDir ?? null,
      ...(opcoes.prazoHelloMs !== undefined && { prazoHelloMs: opcoes.prazoHelloMs }),
    });
    const endereco = await app.listen({ port: 0, host: '127.0.0.1' });
    return { http: endereco, ws: endereco.replace('http', 'ws') };
  }

  describe('painel compilado, servido na mesma origem', () => {
    it('entrega o index.html na raiz, sem cache', async () => {
      const { http } = await montar({ painelDir });

      const resposta = await fetch(`${http}/`);

      expect(resposta.status).toBe(200);
      expect(resposta.headers.get('content-type')).toContain('text/html');
      expect(resposta.headers.get('cache-control')).toBe('no-cache');
      expect(await resposta.text()).toContain('painel-e2e');
    });

    it('as rotas do painel recebem o index.html para o roteador do React resolver', async () => {
      const { http } = await montar({ painelDir });

      for (const caminho of ['/historico', '/historico/0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33']) {
        const resposta = await fetch(`${http}${caminho}`);
        expect(resposta.status, caminho).toBe(200);
        expect(resposta.headers.get('content-type'), caminho).toContain('text/html');
        expect(await resposta.text(), caminho).toContain('painel-e2e');
      }
    });

    it('os assets com hash ficam em cache para sempre', async () => {
      const { http } = await montar({ painelDir });

      const resposta = await fetch(`${http}/assets/app-abc123.js`);

      expect(resposta.status).toBe(200);
      expect(resposta.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    });

    it('um asset que não existe é 404, e nunca o HTML do painel no lugar de um JavaScript', async () => {
      const { http } = await montar({ painelDir });

      for (const caminho of ['/assets/app-velho.js', '/favicon.ico']) {
        const resposta = await fetch(`${http}${caminho}`);
        expect(resposta.status, caminho).toBe(404);
        expect(resposta.headers.get('content-type'), caminho).not.toContain('text/html');
      }
    });

    it('um caminho do backend que não existe é 404 em JSON, e nunca a página do painel', async () => {
      const { http } = await montar({ painelDir });

      for (const caminho of ['/api/inexistente', '/api', '/ws', '/health/']) {
        const resposta = await fetch(`${http}${caminho}`);
        expect(resposta.status, caminho).toBe(404);
        expect(resposta.headers.get('content-type'), caminho).toContain('application/json');
      }
    });

    it('só GET e HEAD caem no index.html: um POST numa rota do painel é 404', async () => {
      const { http } = await montar({ painelDir });

      const resposta = await fetch(`${http}/historico`, { method: 'POST' });

      expect(resposta.status).toBe(404);
      expect(resposta.headers.get('content-type')).toContain('application/json');
    });

    it('sem a pasta do painel (desenvolvimento), a raiz não é servida', async () => {
      const { http } = await montar({ painelDir: null });

      const resposta = await fetch(`${http}/`);

      expect(resposta.status).toBe(404);
    });
  });

  describe('contrato da API', () => {
    it('GET /api/corridas sem corridas devolve a lista vazia', async () => {
      const { http } = await montar();

      const resposta = await fetch(`${http}/api/corridas`);

      expect(resposta.status).toBe(200);
      expect(await resposta.json()).toMatchObject({ itens: [], total: 0 });
    });

    it('um id que não é UUID é 400, e um UUID sem corrida é 404, nos mesmos formatos', async () => {
      const { http } = await montar();

      const invalido = await fetch(`${http}/api/corridas/abc`);
      expect(invalido.status).toBe(400);
      expect(await invalido.json()).toMatchObject({ code: 'FST_ERR_VALIDATION' });

      const inexistente = await fetch(`${http}/api/corridas/00000000-0000-4000-8000-000000000000`);
      expect(inexistente.status).toBe(404);
      expect(await inexistente.json()).toEqual({
        statusCode: 404,
        code: 'CORRIDA_NAO_ENCONTRADA',
        error: 'Not Found',
        message: 'corrida não encontrada',
      });
    });

    it('GET /api/leaderboard sem corridas devolve a lista vazia do labirinto pedido', async () => {
      const { http } = await montar();

      const resposta = await fetch(`${http}/api/leaderboard?labirinto=8x4`);

      expect(resposta.status).toBe(200);
      expect(await resposta.json()).toEqual({ labirinto: '8x4', apresentacao: null, itens: [] });
    });
  });

  describe('GET /health', () => {
    it('200 com o banco disponível', async () => {
      const { http } = await montar({ bancoOk: true });

      const resposta = await fetch(`${http}/health`);

      expect(resposta.status).toBe(200);
      expect(await resposta.json()).toMatchObject({
        status: 'ok',
        banco: 'ok',
        ingestao: {
          mensagens_aceitas: 0,
          mensagens_duplicadas: 0,
          mensagens_rejeitadas: 0,
          conexoes_recusadas: 0,
        },
      });
    });

    it('503 com o banco indisponível, para o painel mostrar o backend degradado', async () => {
      const { http } = await montar({ bancoOk: false });

      const resposta = await fetch(`${http}/health`);

      expect(resposta.status).toBe(503);
      expect(await resposta.json()).toMatchObject({ status: 'degradado', banco: 'indisponivel' });
    });
  });

  describe('WS /ws/telemetria', () => {
    it('fecha com 4003 se o hello não chegar no prazo', async () => {
      const { ws } = await montar({ prazoHelloMs: 200 });
      const robo = new WebSocketNode(`${ws}/ws/telemetria`);
      const fechou = new Promise<number>((resolver) =>
        robo.on('close', (codigo) => resolver(codigo)),
      );

      expect(await fechou).toBe(CodigoFechamento.HELLO_INVALIDO);
    });

    it('fecha com 4001 para um dispositivo que o backend não conhece', async () => {
      const { ws } = await montar();
      const robo = new WebSocketNode(`${ws}/ws/telemetria`);
      const fechou = new Promise<number>((resolver) =>
        robo.on('close', (codigo) => resolver(codigo)),
      );
      await new Promise((resolver) => robo.once('open', resolver));

      robo.send(
        JSON.stringify({
          tipo: 'hello',
          versao: 1,
          dispositivo: 'sim-99',
          token: 'T-VALIDO',
          boot: 'b1',
        }),
      );

      expect(await fechou).toBe(CodigoFechamento.TOKEN_INVALIDO);
    });
  });

  describe('WS /ws/painel', () => {
    it('recebe o keepalive de 1 s mesmo sem nenhuma corrida', async () => {
      const { ws } = await montar();
      const painel = new WebSocketNode(`${ws}/ws/painel`);
      const recebidas: { tipo: string }[] = [];
      painel.on('message', (dados) => recebidas.push(JSON.parse(dados.toString())));
      await new Promise((resolver) => painel.once('open', resolver));

      // O monitor do `main.ts` não existe aqui: a verificação é chamada à mão.
      ambiente!.distribuicao.verificarPaineis();
      const limite = Date.now() + 3000;
      while (!recebidas.some((m) => m.tipo === 'keepalive') && Date.now() < limite) {
        await new Promise((resolver) => setTimeout(resolver, 20));
      }

      expect(recebidas).toContainEqual({ tipo: 'keepalive' });
      painel.close();
    });

    it('uma mensagem inválida é ignorada e o painel segue conectado', async () => {
      const { ws } = await montar();
      const painel = new WebSocketNode(`${ws}/ws/painel`);
      await new Promise((resolver) => painel.once('open', resolver));

      painel.send('isto não é JSON');
      painel.send(JSON.stringify({ tipo: 'anular', corrida: 'x' }));
      await new Promise((resolver) => setTimeout(resolver, 200));

      expect(painel.readyState).toBe(WebSocketNode.OPEN);
      painel.close();
    });
  });
});
