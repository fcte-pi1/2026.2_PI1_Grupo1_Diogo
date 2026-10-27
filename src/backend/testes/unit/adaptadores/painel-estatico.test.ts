import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { criarValidadorProtocolo } from '../../../protocolo/validador.js';
import { ServicoConsulta } from '../../../src/aplicacao/index.js';
import { construirApp } from '../../../src/app.js';
import { AmbienteEmMemoria } from '../../apoio/ingestao-em-memoria.js';
import { linhaDoTempoVazia } from '../../apoio/linha-do-tempo-vazia.js';

const INDEX = '<!doctype html><title>Painel</title>';

describe('painel compilado servido pelo backend (produção, RNF-58)', () => {
  let app: FastifyInstance;
  let pasta: string;

  beforeAll(() => {
    pasta = mkdtempSync(join(tmpdir(), 'painel-'));
    writeFileSync(join(pasta, 'index.html'), INDEX);
    mkdirSync(join(pasta, 'assets'));
    writeFileSync(join(pasta, 'assets', 'app-abc123.js'), 'console.log(1)');
  });
  afterAll(() => rmSync(pasta, { recursive: true, force: true }));
  afterEach(() => app.close());

  async function montar(painelDir: string | null) {
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
        listarCorridas: async () => ({ itens: [], total: 0 }),
      }),
      linhaDoTempo: linhaDoTempoVazia(),
      painelDir,
    });
  }

  it('serve o index.html na raiz e os arquivos do build, com cache longo em assets/', async () => {
    await montar(pasta);
    const raiz = await app.inject({ method: 'GET', url: '/' });
    expect(raiz.statusCode).toBe(200);
    expect(raiz.body).toBe(INDEX);
    expect(raiz.headers['cache-control']).toBe('no-cache');

    const js = await app.inject({ method: 'GET', url: '/assets/app-abc123.js' });
    expect(js.statusCode).toBe(200);
    expect(js.headers['cache-control']).toContain('immutable');
  });

  it('uma rota do painel (recarregar /historico/:id) devolve o index.html', async () => {
    await montar(pasta);
    const resposta = await app.inject({ method: 'GET', url: '/historico/0b6f7c0e?pagina=2' });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toContain('text/html');
    expect(resposta.body).toBe(INDEX);
  });

  it('a API continua respondendo, e o 404 dela não vira a página do painel', async () => {
    await montar(pasta);
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    const inexistente = await app.inject({ method: 'GET', url: '/api/nao-existe' });
    expect(inexistente.statusCode).toBe(404);
    expect(inexistente.json()).toMatchObject({ statusCode: 404, error: 'Not Found' });
    const post = await app.inject({ method: 'POST', url: '/qualquer' });
    expect(post.statusCode).toBe(404);
  });

  it('arquivo que não existe (asset de um build antigo, favicon) é 404, e não o index.html', async () => {
    await montar(pasta);
    for (const url of ['/assets/app-velho999.js', '/favicon.ico', '/historico/relatorio.pdf']) {
      const resposta = await app.inject({ method: 'GET', url });
      expect(resposta.statusCode, url).toBe(404);
      expect(resposta.headers['content-type'], url).toContain('application/json');
    }
  });

  it('HEAD numa rota do painel responde como o GET', async () => {
    await montar(pasta);
    const resposta = await app.inject({ method: 'HEAD', url: '/historico/0b6f7c0e' });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toContain('text/html');
  });

  it('/ws/qualquer e /api são do backend; /healthcheck e /apis são rotas do painel', async () => {
    await montar(pasta);
    for (const url of ['/ws/qualquer', '/api', '/health/']) {
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(404);
    }
    for (const url of ['/healthcheck', '/apis']) {
      const resposta = await app.inject({ method: 'GET', url });
      expect(resposta.statusCode, url).toBe(200);
      expect(resposta.body, url).toBe(INDEX);
    }
  });

  it('sem PAINEL_DIR (desenvolvimento), o backend não serve o painel', async () => {
    await montar(null);
    expect((await app.inject({ method: 'GET', url: '/' })).statusCode).toBe(404);
  });
});
