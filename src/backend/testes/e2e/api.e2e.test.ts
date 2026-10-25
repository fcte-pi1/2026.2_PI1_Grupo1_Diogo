/**
 * Ponta a ponta do backend: robô (WebSocket /ws/telemetria) → servidor completo → PostgreSQL 16
 * real → consultas HTTP e painel (WebSocket /ws/painel).
 *
 * Complementa o `simulador.e2e.test.ts`, que cobre a ingestão pelo simulador. Aqui o foco é o
 * que o painel enxerga: histórico, detalhe, ranking, replay, exportação, tempo real, saúde e
 * recuperação depois de reiniciar o backend.
 *
 * Executar no host ou no CI: `npm run test:e2e` (requer Docker, como o `test:integracao`).
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { runner } from 'node-pg-migrate';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocketNode from 'ws';
import {
  CodigoFechamento,
  type DetalheCorrida,
  type ItemLinhaDoTempo,
  type MensagemPainelSaida,
  type RespostaLeaderboard,
  type RespostaListaCorridas,
} from '../../protocolo/tipos.js';
import { criarValidadorProtocolo } from '../../protocolo/validador.js';
import {
  ServicoConsulta,
  ServicoCorrida,
  ServicoDistribuicao,
  ServicoIngestao,
  ServicoLinhaDoTempo,
} from '../../src/aplicacao/index.js';
import { construirApp } from '../../src/app.js';
import { verificarBanco } from '../../src/infra/banco.js';
import { BarramentoEventos } from '../../src/infra/barramento-eventos.js';
import { RepositorioConsultaPg, RepositorioLinhaDoTempoPg } from '../../src/infra/consulta-pg.js';
import { criarContadores } from '../../src/infra/contadores.js';
import { GravadorLote } from '../../src/infra/gravador-lote.js';
import { HistogramasLatencia } from '../../src/infra/latencia.js';
import {
  RegistroAuditoriaPg,
  RepositorioCorridasPg,
  RepositorioDispositivosPg,
  RepositorioProjecoesPg,
  VerificadorTokenArgon2,
  criarInserirLote,
} from '../../src/infra/repositorios-pg.js';
import { hello, mensagem } from '../apoio/ingestao-em-memoria.js';

const SILENCIOSO = { info: () => {}, warn: () => {}, error: () => {} };
const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

async function esperar(condicao: () => boolean | Promise<boolean>, prazoMs = 5000): Promise<void> {
  const limite = Date.now() + prazoMs;
  while (!(await condicao())) {
    if (Date.now() > limite) throw new Error('condição não atingida no prazo');
    await new Promise((resolver) => setTimeout(resolver, 20));
  }
}

const pausa = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

function abrir(url: string): Promise<WebSocketNode> {
  const ws = new WebSocketNode(url);
  return new Promise((resolver, rejeitar) => {
    ws.once('open', () => resolver(ws));
    ws.once('error', rejeitar);
  });
}

/** Cliente de teste do robô: só envia, e guarda os acks e o código de fechamento. */
class Robo {
  readonly acks: { corrida: string; sequencia: number }[] = [];
  readonly fechamento: Promise<number>;

  private constructor(private readonly ws: WebSocketNode) {
    ws.on('message', (dados) => this.acks.push(JSON.parse(dados.toString())));
    this.fechamento = new Promise((resolver) => ws.on('close', (codigo) => resolver(codigo)));
  }

  static async conectar(url: string): Promise<Robo> {
    return new Robo(await abrir(url));
  }

  enviar(...textos: string[]): void {
    for (const texto of textos) this.ws.send(texto);
  }

  esperarAck(corrida: string, sequencia: number, prazoMs?: number): Promise<void> {
    return esperar(
      () => this.acks.some((a) => a.corrida === corrida && a.sequencia === sequencia),
      prazoMs,
    );
  }

  fechar(): Promise<number> {
    this.ws.close();
    return this.fechamento;
  }
}

type MensagemDoPainel<T extends MensagemPainelSaida['tipo']> = Extract<
  MensagemPainelSaida,
  { tipo: T }
>;

/** Cliente de teste do painel: guarda tudo o que o backend envia. */
class Painel {
  readonly mensagens: MensagemPainelSaida[] = [];
  readonly fechamento: Promise<number>;

  private constructor(private readonly ws: WebSocketNode) {
    ws.on('message', (dados) => this.mensagens.push(JSON.parse(dados.toString())));
    this.fechamento = new Promise((resolver) => ws.on('close', (codigo) => resolver(codigo)));
  }

  static async conectar(url: string): Promise<Painel> {
    return new Painel(await abrir(url));
  }

  enviar(mensagemDoPainel: unknown): void {
    this.ws.send(
      typeof mensagemDoPainel === 'string' ? mensagemDoPainel : JSON.stringify(mensagemDoPainel),
    );
  }

  doTipo<T extends MensagemPainelSaida['tipo']>(tipo: T): MensagemDoPainel<T>[] {
    return this.mensagens.filter((m): m is MensagemDoPainel<T> => m.tipo === tipo);
  }

  get aberto(): boolean {
    return this.ws.readyState === WebSocketNode.OPEN;
  }

  fechar(): void {
    this.ws.close();
  }
}

interface Servidor {
  http: string;
  wsTelemetria: string;
  wsPainel: string;
  parar: () => Promise<void>;
}

/** Uma corrida de 6 mensagens: início, 2 células, posição, energia e fim. */
interface OpcoesCorrida {
  id: string;
  labirinto: '4x4' | '8x4' | '12x4';
  /** `tempo_ms` do `fim_corrida`. O tempo oficial é este valor menos os 100 ms do início. */
  fimMs: number;
  resultado?: 'sucesso' | 'falha';
  detalhe?: string;
}
const MENSAGENS_POR_CORRIDA = 6;

function mensagensDaCorrida(o: OpcoesCorrida): string[] {
  const c = { corrida: o.id };
  return [
    mensagem('inicio_corrida', 1, { ...c, labirinto: o.labirinto }),
    mensagem('celula', 2, { ...c, x: 0, y: 3 }),
    mensagem('celula', 3, { ...c, x: 0, y: 2 }),
    mensagem('posicao', 4, { ...c, x: 0, y: 2 }),
    mensagem('energia', 5, { ...c, tensao_v: 8.1 }),
    mensagem('fim_corrida', 6, {
      ...c,
      tempo_ms: o.fimMs,
      resultado: o.resultado ?? 'sucesso',
      ...(o.detalhe !== undefined && { detalhe: o.detalhe }),
    }),
  ];
}

describe('backend ponta a ponta: robô → PostgreSQL → painel', () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let servidor: Servidor;
  // Os histogramas de latência sobrevivem ao reinício do servidor, como o `/health` espera.
  const latencia = new HistogramasLatencia();

  const consulta = async <T extends pg.QueryResultRow>(sql: string, parametros: unknown[] = []) =>
    (await pool.query<T>(sql, parametros)).rows;

  const get = (caminho: string) => fetch(`${servidor.http}${caminho}`);
  const obter = async <T>(caminho: string) => {
    const resposta = await get(caminho);
    return { status: resposta.status, resposta, corpo: (await resposta.json()) as T };
  };

  /** A mesma montagem do `main.ts`, sobre o pool do contêiner. */
  async function subirServidor(): Promise<Servidor> {
    const contadores = criarContadores();
    const eventos = new BarramentoEventos();
    const corridas = new ServicoCorrida({
      corridas: new RepositorioCorridasPg(pool),
      projecoes: new RepositorioProjecoesPg(pool),
      eventos,
      log: SILENCIOSO,
    });
    await corridas.recuperar();
    const distribuicao = new ServicoDistribuicao({ corridas, log: SILENCIOSO, latencia });
    eventos.assinar('mensagem-aplicada', (d) => distribuicao.aoAplicar(d));
    eventos.assinar('status-alterado', (d) => distribuicao.aoMudarStatus(d));
    eventos.assinar('alerta-tensao', (d) => distribuicao.aoAlertar(d));
    eventos.assinar('sinal-alterado', (d) => distribuicao.aoMudarSinal(d));
    eventos.assinar('ranking-alterado', (d) => distribuicao.aoMudarRanking(d));

    const gravador = new GravadorLote(criarInserirLote(pool));
    const validador = criarValidadorProtocolo();
    const ingestao = new ServicoIngestao({
      dispositivos: new RepositorioDispositivosPg(pool),
      tokens: new VerificadorTokenArgon2(),
      corridas,
      gravador,
      auditoria: new RegistroAuditoriaPg(pool),
      validador,
      contadores,
      log: SILENCIOSO,
    });
    const app: FastifyInstance = await construirApp({
      verificarBanco: () => verificarBanco(pool),
      contadores,
      latencia,
      ingestao,
      consulta: new ServicoConsulta(new RepositorioConsultaPg(pool)),
      linhaDoTempo: new ServicoLinhaDoTempo(new RepositorioLinhaDoTempoPg(pool)),
      distribuicao,
      validador,
    });
    // Interrupção por silêncio e keepalive dos painéis, como no `main.ts`.
    const monitor = setInterval(() => corridas.verificarInterrupcoes(), 1000);
    const monitorPaineis = setInterval(() => distribuicao.verificarPaineis(), 1000);
    const endereco = await app.listen({ port: 0, host: '127.0.0.1' });

    return {
      http: endereco,
      wsTelemetria: `${endereco.replace('http', 'ws')}/ws/telemetria`,
      wsPainel: `${endereco.replace('http', 'ws')}/ws/painel`,
      parar: async () => {
        clearInterval(monitor);
        clearInterval(monitorPaineis);
        distribuicao.parar();
        await app.close();
        await gravador.esvaziar();
        await corridas.esvaziar();
      },
    };
  }

  async function reiniciarServidor(): Promise<void> {
    await servidor.parar();
    servidor = await subirServidor();
  }

  /** Id da corrida no backend (UUID), a partir do id gerado pelo robô. */
  async function idDaCorrida(idRobo: string): Promise<string> {
    let id = '';
    await esperar(async () => {
      const linhas = await consulta<{ id: string }>(
        `SELECT id FROM corrida WHERE id_corrida_robo = $1`,
        [idRobo],
      );
      id = linhas[0]?.id ?? '';
      return id !== '';
    });
    return id;
  }

  /** O robô conecta, envia a corrida inteira e o teste espera ela ser gravada e encerrada. */
  async function executarCorrida(opcoes: OpcoesCorrida): Promise<string> {
    const robo = await Robo.conectar(servidor.wsTelemetria);
    robo.enviar(hello(), ...mensagensDaCorrida(opcoes));
    await robo.esperarAck(opcoes.id, MENSAGENS_POR_CORRIDA);
    const id = await idDaCorrida(opcoes.id);
    const status = opcoes.resultado === 'falha' ? 'FALHOU' : 'CONCLUIDA';
    await esperar(
      async () =>
        (await consulta<{ status: string }>(`SELECT status FROM corrida WHERE id = $1`, [id]))[0]
          ?.status === status,
    );
    await robo.fechar();
    return id;
  }

  // Corridas da preparação. A ordem de criação é D > C > B > A, da mais nova para a mais antiga.
  const A = { id: 'e2e-a', labirinto: '4x4', fimMs: 9000 } as const; // tempo oficial 8,9 s
  const B = { id: 'e2e-b', labirinto: '4x4', fimMs: 7000 } as const; // tempo oficial 6,9 s
  const C = { id: 'e2e-c', labirinto: '8x4', fimMs: 8000 } as const; // tempo oficial 7,9 s
  const D = {
    id: 'e2e-d',
    labirinto: '4x4',
    fimMs: 5000,
    resultado: 'falha',
    detalhe: '=1+1',
  } as const;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    await runner({
      databaseUrl: container.getConnectionUri(),
      dir: 'migracoes',
      direction: 'up',
      migrationsTable: 'pgmigrations',
      log: () => {},
    });
    pool = new pg.Pool({ connectionString: container.getConnectionUri() });
    const hash = await argon2.hash('T-VALIDO');
    await pool.query(
      `INSERT INTO dispositivo (identificador, nome, token_hash)
       VALUES ('sim-01', 'Simulador', $1), ('sim-02', 'Simulador 2', $1)`,
      [hash],
    );
    servidor = await subirServidor();

    for (const corrida of [A, B, C, D]) {
      ids[corrida.id] = await executarCorrida(corrida);
      // Instantes de início distintos, para a ordem da listagem ser determinística.
      await pausa(30);
    }
  }, 120_000);

  afterAll(async () => {
    await servidor?.parar();
    await pool?.end();
    await container?.stop();
  });

  describe('saúde', () => {
    it('GET /health: 200, banco ok e contadores da ingestão', async () => {
      const { status, corpo } = await obter<{
        status: string;
        banco: string;
        uptime_s: number;
        ingestao: Record<string, number>;
        event_loop_atraso_ms: { p50: number; p99: number };
      }>('/health');

      expect(status).toBe(200);
      expect(corpo).toMatchObject({ status: 'ok', banco: 'ok' });
      expect(corpo.ingestao.mensagens_aceitas).toBeGreaterThanOrEqual(4 * MENSAGENS_POR_CORRIDA);
      expect(corpo.ingestao.mensagens_rejeitadas).toBe(0);
      expect(corpo.event_loop_atraso_ms.p99).toBeGreaterThanOrEqual(0);
    });
  });

  // Estes testes vêm antes dos que criam novas corridas: o banco só tem A, B, C e D.
  describe('histórico: GET /api/corridas', () => {
    it('lista da mais recente para a mais antiga, com o resumo de cada corrida', async () => {
      const { status, corpo } = await obter<RespostaListaCorridas>('/api/corridas');

      expect(status).toBe(200);
      expect(corpo).toMatchObject({ total: 4, pagina: 1, tamanho: 20 });
      expect(corpo.itens.map((i) => i.id)).toEqual([ids[D.id], ids[C.id], ids[B.id], ids[A.id]]);
      expect(corpo.itens.find((i) => i.id === ids[A.id])).toMatchObject({
        tipo_labirinto: '4x4',
        status: 'CONCLUIDA',
        motivo_termino: 'SUCESSO',
        tempo_conclusao_ms: 8900,
        anulada: false,
      });
      expect(corpo.itens.find((i) => i.id === ids[D.id])).toMatchObject({
        status: 'FALHOU',
        motivo_termino: 'FALHA_REPORTADA',
        tempo_conclusao_ms: null,
      });
    });

    it('filtra por tipo e por status, combinados', async () => {
      const por4x4 = await obter<RespostaListaCorridas>('/api/corridas?tipo=4x4');
      expect(por4x4.corpo.total).toBe(3);
      expect(por4x4.corpo.itens.every((i) => i.tipo_labirinto === '4x4')).toBe(true);

      const por8x4 = await obter<RespostaListaCorridas>('/api/corridas?tipo=8x4');
      expect(por8x4.corpo.itens.map((i) => i.id)).toEqual([ids[C.id]]);

      const falhas = await obter<RespostaListaCorridas>('/api/corridas?status=FALHOU');
      expect(falhas.corpo.itens.map((i) => i.id)).toEqual([ids[D.id]]);

      const combinado = await obter<RespostaListaCorridas>(
        '/api/corridas?tipo=4x4&status=CONCLUIDA',
      );
      expect(combinado.corpo.itens.map((i) => i.id)).toEqual([ids[B.id], ids[A.id]]);

      const nenhuma = await obter<RespostaListaCorridas>('/api/corridas?tipo=12x4');
      expect(nenhuma.corpo).toMatchObject({ itens: [], total: 0 });
    });

    it('pagina, devolve página vazia depois da última e limita o tamanho a 100', async () => {
      const segunda = await obter<RespostaListaCorridas>('/api/corridas?pagina=2&tamanho=2');
      expect(segunda.corpo).toMatchObject({ total: 4, pagina: 2, tamanho: 2 });
      expect(segunda.corpo.itens.map((i) => i.id)).toEqual([ids[B.id], ids[A.id]]);

      const alemDoFim = await obter<RespostaListaCorridas>('/api/corridas?pagina=3&tamanho=2');
      expect(alemDoFim.corpo).toMatchObject({ itens: [], total: 4, pagina: 3 });

      const enorme = await obter<RespostaListaCorridas>('/api/corridas?tamanho=500');
      expect(enorme.status).toBe(200);
      expect(enorme.corpo.tamanho).toBe(100);
    });

    it('filtra por intervalo de datas (só a data vale o dia inteiro em UTC)', async () => {
      const desde2000 = await obter<RespostaListaCorridas>('/api/corridas?de=2000-01-01');
      expect(desde2000.corpo.total).toBe(4);

      const futuro = await obter<RespostaListaCorridas>('/api/corridas?de=2999-01-01');
      expect(futuro.corpo).toMatchObject({ itens: [], total: 0 });

      const passado = await obter<RespostaListaCorridas>('/api/corridas?ate=2000-01-01');
      expect(passado.corpo).toMatchObject({ itens: [], total: 0 });
    });

    it('parâmetros inválidos devolvem 400 com o código do contrato', async () => {
      const casos: [string, string][] = [
        ['tipo=5x5', 'FST_ERR_VALIDATION'],
        ['status=PAUSADA', 'FST_ERR_VALIDATION'],
        ['pagina=0', 'FST_ERR_VALIDATION'],
        ['pagina=100001', 'FST_ERR_VALIDATION'],
        ['tamanho=0', 'FST_ERR_VALIDATION'],
        ['de=14/10/2026', 'FILTRO_INVALIDO'],
        ['de=2026-02-30', 'FILTRO_INVALIDO'],
        ['de=2026-10-14&ate=2026-10-13', 'FILTRO_INVALIDO'],
      ];
      for (const [consultaHttp, codigo] of casos) {
        const { status, corpo } = await obter<{ code: string }>(`/api/corridas?${consultaHttp}`);
        expect(status, consultaHttp).toBe(400);
        expect(corpo.code, consultaHttp).toBe(codigo);
      }
    });
  });

  describe('detalhe: GET /api/corridas/{id}', () => {
    it('devolve resumo, métricas, trajeto e energia de uma corrida concluída', async () => {
      const id = ids[A.id]!;
      await esperar(async () => {
        const { corpo } = await obter<DetalheCorrida>(`/api/corridas/${id}`);
        return corpo.metricas?.celulas_percorridas === 1;
      });
      const { status, corpo } = await obter<DetalheCorrida>(`/api/corridas/${id}`);

      expect(status).toBe(200);
      expect(corpo).toMatchObject({
        id,
        corrida_robo: 'e2e-a',
        tipo_labirinto: '4x4',
        status: 'CONCLUIDA',
        motivo_termino: 'SUCESSO',
        tempo_conclusao_ms: 8900,
        anulada: false,
        anulacao: null,
        ultima_sequencia_contigua: MENSAGENS_POR_CORRIDA,
        sequencias_faltantes: 0,
      });
      expect(corpo.encerrada_em).not.toBeNull();
      expect(corpo.metricas).toMatchObject({
        tempo_conclusao_ms: 8900,
        celulas_percorridas: 1,
        distancia_m: 0.18,
        revisitas: 0,
      });
      expect(corpo.trajeto.map((p) => [p.sequencia, p.ordem, p.x, p.y, p.revisita])).toEqual([
        [2, 1, 0, 3, false],
        [3, 2, 0, 2, false],
      ]);
      expect(corpo.energia).toHaveLength(1);
      expect(corpo.energia[0]).toMatchObject({ sequencia: 5, tensao_v: 8.1 });
    });

    it('uma corrida que falhou traz o motivo e o texto enviado pelo robô', async () => {
      const { corpo } = await obter<DetalheCorrida>(`/api/corridas/${ids[D.id]}`);

      expect(corpo).toMatchObject({
        status: 'FALHOU',
        motivo_termino: 'FALHA_REPORTADA',
        detalhe_termino: '=1+1',
        tempo_conclusao_ms: null,
      });
    });

    it('404 para id inexistente e 400 para id que não é UUID', async () => {
      const inexistente = await obter<{ code: string }>(`/api/corridas/${UUID_INEXISTENTE}`);
      expect(inexistente.status).toBe(404);
      expect(inexistente.corpo.code).toBe('CORRIDA_NAO_ENCONTRADA');

      const invalido = await obter<{ code: string }>('/api/corridas/nao-e-uuid');
      expect(invalido.status).toBe(400);
      expect(invalido.corpo.code).toBe('FST_ERR_VALIDATION');
    });
  });

  describe('ranking: GET /api/leaderboard', () => {
    it('só corridas concluídas, do menor tempo para o maior, por tipo de labirinto', async () => {
      const r4x4 = await obter<RespostaLeaderboard>('/api/leaderboard?labirinto=4x4');
      expect(r4x4.status).toBe(200);
      expect(r4x4.corpo).toMatchObject({ labirinto: '4x4', apresentacao: null });
      // A corrida D falhou: não entra no ranking.
      expect(r4x4.corpo.itens.map((i) => [i.posicao, i.id, i.tempo_conclusao_ms])).toEqual([
        [1, ids[B.id], 6900],
        [2, ids[A.id], 8900],
      ]);
      expect(r4x4.corpo.itens[0]).toMatchObject({ corrida_robo: 'e2e-b', distancia_m: 0.18 });

      const r8x4 = await obter<RespostaLeaderboard>('/api/leaderboard?labirinto=8x4');
      expect(r8x4.corpo.itens.map((i) => i.id)).toEqual([ids[C.id]]);

      const r12x4 = await obter<RespostaLeaderboard>('/api/leaderboard?labirinto=12x4');
      expect(r12x4.corpo.itens).toEqual([]);
    });

    it('400 sem labirinto ou com valor inválido', async () => {
      for (const consultaHttp of ['', '?labirinto=5x5', '?labirinto=4x4&apresentacao=1']) {
        const { status, corpo } = await obter<{ code: string }>(`/api/leaderboard${consultaHttp}`);
        expect(status, consultaHttp).toBe(400);
        expect(corpo.code, consultaHttp).toBe('FST_ERR_VALIDATION');
      }
    });
  });

  describe('replay: GET /api/corridas/{id}/linha-do-tempo', () => {
    it('NDJSON com todas as mensagens aceitas, em ordem de sequência e como foram aceitas', async () => {
      const resposta = await get(`/api/corridas/${ids[A.id]}/linha-do-tempo`);
      expect(resposta.status).toBe(200);
      expect(resposta.headers.get('content-type')).toBe('application/x-ndjson; charset=utf-8');

      const itens = (await resposta.text())
        .split('\n')
        .filter((linha) => linha !== '')
        .map((linha) => JSON.parse(linha) as ItemLinhaDoTempo);

      expect(itens.map((i) => i.sequencia)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(itens.map((i) => i.tipo)).toEqual([
        'inicio_corrida',
        'celula',
        'celula',
        'posicao',
        'energia',
        'fim_corrida',
      ]);
      expect(itens[0]!.mensagem).toEqual(JSON.parse(mensagensDaCorrida(A)[0]!));
      expect(Number.isNaN(Date.parse(itens[0]!.recebida_em))).toBe(false);
    });

    it('404 e 400 saem antes do primeiro byte do corpo', async () => {
      const inexistente = await obter<{ code: string }>(
        `/api/corridas/${UUID_INEXISTENTE}/linha-do-tempo`,
      );
      expect(inexistente.status).toBe(404);
      expect(inexistente.corpo.code).toBe('CORRIDA_NAO_ENCONTRADA');

      const invalido = await obter<{ code: string }>('/api/corridas/xyz/linha-do-tempo');
      expect(invalido.status).toBe(400);
      expect(invalido.corpo.code).toBe('FST_ERR_VALIDATION');
    });
  });

  describe('exportação: GET /api/corridas/{id}/exportacao', () => {
    it('JSON: o mesmo conteúdo do detalhe, para download', async () => {
      const id = ids[A.id]!;
      const detalhe = await obter<DetalheCorrida>(`/api/corridas/${id}`);
      const exportado = await obter<DetalheCorrida>(`/api/corridas/${id}/exportacao?formato=json`);

      expect(exportado.status).toBe(200);
      expect(exportado.resposta.headers.get('content-type')).toContain('application/json');
      expect(exportado.resposta.headers.get('content-disposition')).toBe(
        `attachment; filename="corrida-${id}.json"`,
      );
      expect(exportado.corpo).toEqual(detalhe.corpo);
    });

    it('CSV: BOM, cabeçalho fixo, uma linha por mensagem e fim de linha CRLF', async () => {
      const id = ids[A.id]!;
      const resposta = await get(`/api/corridas/${id}/exportacao?formato=csv`);

      expect(resposta.status).toBe(200);
      expect(resposta.headers.get('content-type')).toBe('text/csv; charset=utf-8');
      expect(resposta.headers.get('content-disposition')).toBe(
        `attachment; filename="corrida-${id}.csv"`,
      );
      const bytes = new Uint8Array(await resposta.arrayBuffer());
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

      const texto = Buffer.from(bytes)
        .toString('utf8')
        .replace(/^\uFEFF/, '');
      expect(texto.endsWith('\r\n')).toBe(true);
      const linhas = texto.split('\r\n').filter((linha) => linha !== '');
      expect(linhas[0]).toBe(
        'seq,t_robo_ms,tipo,recebida_em,labirinto,x,y,orientacao,celulas,velocidade_media_mps,' +
          'parede_norte,parede_leste,parede_sul,parede_oeste,tensao_v,corrente_a,potencia_w,' +
          'estado,resultado,detalhe',
      );
      expect(linhas).toHaveLength(1 + MENSAGENS_POR_CORRIDA);
      expect(linhas.slice(1).map((linha) => linha.split(',')[0])).toEqual([
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
      ]);
      expect(linhas[1]!.split(',').slice(2, 3)).toEqual(['inicio_corrida']);
    });

    it('CSV: o texto livre do robô que começa com "=" ganha um apóstrofo (CSV injection)', async () => {
      const resposta = await get(`/api/corridas/${ids[D.id]}/exportacao?formato=csv`);
      const linhas = (await resposta.text()).split('\r\n').filter((linha) => linha !== '');
      const fim = linhas.find((linha) => linha.split(',')[2] === 'fim_corrida')!;

      expect(fim.endsWith(",'=1+1")).toBe(true);
    });

    it('400 sem formato, com formato inválido ou com id que não é UUID; 404 sem corrida', async () => {
      const id = ids[A.id];
      for (const caminho of [
        `/api/corridas/${id}/exportacao`,
        `/api/corridas/${id}/exportacao?formato=xml`,
        '/api/corridas/xyz/exportacao?formato=csv',
      ]) {
        const { status, corpo } = await obter<{ code: string }>(caminho);
        expect(status, caminho).toBe(400);
        expect(corpo.code, caminho).toBe('FST_ERR_VALIDATION');
      }
      for (const formato of ['json', 'csv']) {
        const { status, corpo } = await obter<{ code: string }>(
          `/api/corridas/${UUID_INEXISTENTE}/exportacao?formato=${formato}`,
        );
        expect(status, formato).toBe(404);
        expect(corpo.code, formato).toBe('CORRIDA_NAO_ENCONTRADA');
      }
    });
  });

  describe('ingestão pelo WebSocket do robô', () => {
    async function saude() {
      return (await obter<{ ingestao: Record<string, number> }>('/health')).corpo.ingestao;
    }

    it('recusa token errado e dispositivo desconhecido com 4001', async () => {
      const antes = (await saude())['conexoes_recusadas']!;

      const tokenErrado = await Robo.conectar(servidor.wsTelemetria);
      tokenErrado.enviar(hello({ token: 'ERRADO' }));
      expect(await tokenErrado.fechamento).toBe(CodigoFechamento.TOKEN_INVALIDO);

      const desconhecido = await Robo.conectar(servidor.wsTelemetria);
      desconhecido.enviar(hello({ dispositivo: 'sim-99' }));
      expect(await desconhecido.fechamento).toBe(CodigoFechamento.TOKEN_INVALIDO);

      await esperar(async () => (await saude())['conexoes_recusadas']! >= antes + 2);
    });

    it('recusa uma primeira mensagem que não é o hello com 4003', async () => {
      const robo = await Robo.conectar(servidor.wsTelemetria);
      robo.enviar(mensagem('celula', 1, { corrida: 'e2e-sem-hello' }));

      expect(await robo.fechamento).toBe(CodigoFechamento.HELLO_INVALIDO);
      expect(
        await consulta(`SELECT 1 FROM corrida WHERE id_corrida_robo = 'e2e-sem-hello'`),
      ).toEqual([]);
    });

    it('descarta a mensagem repetida e registra a que viola as regras do domínio', async () => {
      const antes = await saude();
      const c = { corrida: 'e2e-rejeicao' };
      const robo = await Robo.conectar(servidor.wsTelemetria);
      robo.enviar(
        hello(),
        mensagem('inicio_corrida', 1, { ...c, labirinto: '4x4' }),
        mensagem('celula', 2, { ...c, x: 0, y: 3 }),
        // A mesma sequência de novo: duplicata.
        mensagem('celula', 2, { ...c, x: 0, y: 3 }),
        // Coluna 9 não existe num labirinto 4x4.
        mensagem('celula', 3, { ...c, x: 9, y: 0 }),
      );
      await robo.esperarAck(c.corrida, 2);
      await esperar(async () => {
        const agora = await saude();
        return (
          agora['mensagens_duplicadas']! >= antes['mensagens_duplicadas']! + 1 &&
          agora['mensagens_rejeitadas']! >= antes['mensagens_rejeitadas']! + 1
        );
      });

      const gravadas = await consulta<{ seq: number }>(
        `SELECT m.seq FROM mensagem m JOIN corrida c ON c.id = m.corrida_id
         WHERE c.id_corrida_robo = $1 ORDER BY m.seq`,
        [c.corrida],
      );
      expect(gravadas.map((m) => m.seq)).toEqual([1, 2]);
      const rejeitadas = await consulta<{ motivo_codigo: string }>(
        `SELECT motivo_codigo FROM mensagem_rejeitada WHERE corrida_robo = $1`,
        [c.corrida],
      );
      expect(rejeitadas.map((r) => r.motivo_codigo)).toEqual(['COORDENADA_FORA_DO_LABIRINTO']);
      await robo.fechar();
    });
  });

  describe('painel em tempo real: WS /ws/painel', () => {
    it('acompanha uma corrida do anúncio ao ranking, e o ranking já a inclui ao receber o aviso', async () => {
      const painel = await Painel.conectar(servidor.wsPainel);
      painel.enviar({ tipo: 'inscrever', canal: 'ao_vivo' });
      // Mensagens inválidas do painel são ignoradas, sem derrubar a conexão.
      painel.enviar('isto não é JSON');
      painel.enviar({ tipo: 'anular', corrida: 'x' });

      const c = { corrida: 'e2e-ao-vivo' };
      const robo = await Robo.conectar(servidor.wsTelemetria);
      robo.enviar(hello(), mensagem('inicio_corrida', 1, { ...c, labirinto: '8x4' }));
      await robo.esperarAck(c.corrida, 1);
      const id = await idDaCorrida(c.corrida);

      await esperar(() => painel.doTipo('ao_vivo').some((m) => m.corrida === id));
      expect(painel.doTipo('ao_vivo').find((m) => m.corrida === id)).toMatchObject({
        labirinto: '8x4',
        status: 'EM_ANDAMENTO',
      });

      painel.enviar({ tipo: 'inscrever', corrida: id });
      await esperar(() => painel.doTipo('snapshot').length > 0);
      expect(painel.doTipo('snapshot')[0]).toMatchObject({
        corrida: id,
        labirinto: '8x4',
        sequencia_corte: 1,
        status: 'EM_ANDAMENTO',
        sinal: 'NORMAL',
      });

      robo.enviar(
        mensagem('celula', 2, { ...c, x: 0, y: 3 }),
        mensagem('celula', 3, { ...c, x: 0, y: 2 }),
        mensagem('posicao', 4, { ...c, x: 0, y: 2 }),
        mensagem('energia', 5, { ...c, tensao_v: 8.1 }),
        mensagem('fim_corrida', 6, { ...c, tempo_ms: 9500 }),
      );
      await esperar(() => painel.doTipo('leaderboard').length > 0);

      // Todas as células, em ordem, e depois o status final.
      const eventos = painel.doTipo('evento');
      expect(eventos.map((e) => e.evento)).toEqual(['celula', 'celula', 'status']);
      expect(eventos[2]).toMatchObject({ status: 'CONCLUIDA', sequencia: 6, tempo_ms: 9500 });
      expect(eventos[2]!.metricas).toMatchObject({ tempo_conclusao_ms: 9400, tensao_v: 8.1 });
      expect(painel.doTipo('leaderboard')[0]).toMatchObject({ labirinto: '8x4' });
      expect(
        painel
          .doTipo('ao_vivo')
          .filter((m) => m.corrida === id)
          .map((m) => m.status),
      ).toEqual(['EM_ANDAMENTO', 'CONCLUIDA']);

      // O último contínuo pode chegar logo depois do status, já com as métricas finais.
      await esperar(() => painel.doTipo('continuo').at(-1)?.energia != null);
      expect(painel.doTipo('continuo').at(-1)).toMatchObject({
        posicao: { x: 0, y: 2 },
        energia: { tensao_v: 8.1 },
      });

      // O aviso de ranking sai depois de a corrida estar gravada.
      const ranking = await obter<RespostaLeaderboard>('/api/leaderboard?labirinto=8x4');
      expect(ranking.corpo.itens.map((i) => [i.posicao, i.id])).toEqual([
        [1, ids[C.id]],
        [2, id],
      ]);

      // O painel segue conectado e recebendo o keepalive de 1 s.
      expect(painel.aberto).toBe(true);
      await esperar(() => painel.doTipo('keepalive').length > 0, 3000);

      await robo.fechar();
      painel.fechar();
      await painel.fechamento;
    });

    it('alerta de tensão baixa e perda e retomada do sinal chegam a quem acompanha a corrida', async () => {
      const c = { corrida: 'e2e-sinal' };
      const robo = await Robo.conectar(servidor.wsTelemetria);
      robo.enviar(
        hello(),
        mensagem('inicio_corrida', 1, { ...c, labirinto: '4x4' }),
        mensagem('celula', 2, { ...c, x: 0, y: 3 }),
      );
      await robo.esperarAck(c.corrida, 2);
      const id = await idDaCorrida(c.corrida);

      const painel = await Painel.conectar(servidor.wsPainel);
      painel.enviar({ tipo: 'inscrever', corrida: id });
      await esperar(() => painel.doTipo('snapshot').length > 0);

      robo.enviar(mensagem('energia', 3, { ...c, tensao_v: 6.5 }));
      await esperar(() => painel.doTipo('alerta').length > 0);
      expect(painel.doTipo('alerta')[0]).toMatchObject({
        corrida: id,
        alerta: 'TENSAO_BAIXA',
        tensao_v: 6.5,
      });

      // A conexão cai: sinal perdido na hora. O robô volta com o mesmo boot: retomado.
      await robo.fechar();
      await esperar(() => painel.doTipo('sinal').some((s) => s.estado === 'PERDIDO'));
      const volta = await Robo.conectar(servidor.wsTelemetria);
      volta.enviar(hello(), mensagem('celula', 4, { ...c, x: 0, y: 2 }));
      await volta.esperarAck(c.corrida, 4);
      await esperar(() => painel.doTipo('sinal').some((s) => s.estado === 'RETOMADO'));
      expect(painel.doTipo('sinal').map((s) => s.estado)).toEqual(['PERDIDO', 'RETOMADO']);

      await volta.fechar();
      painel.fechar();
    });

    it('registra a latência da recepção ao envio ao painel no /health (RNF-48)', async () => {
      const { corpo } = await obter<{
        latencia_painel_ms: { eventos: { amostras: number; p95: number | null } };
      }>('/health');

      expect(corpo.latencia_painel_ms.eventos.amostras).toBeGreaterThan(0);
      expect(corpo.latencia_painel_ms.eventos.p95).not.toBeNull();
    });
  });

  describe('reinício do backend (RNF-52)', () => {
    it('a corrida em andamento sobrevive, nasce com sinal perdido e é retomada pelo robô', async () => {
      const c = { corrida: 'e2e-reinicio' };
      const antes = await Robo.conectar(servidor.wsTelemetria);
      antes.enviar(
        hello(),
        mensagem('inicio_corrida', 1, { ...c, labirinto: '4x4' }),
        mensagem('celula', 2, { ...c, x: 0, y: 3 }),
      );
      await antes.esperarAck(c.corrida, 2);
      const id = await idDaCorrida(c.corrida);
      await antes.fechar();

      await reiniciarServidor();

      // O detalhe vem do banco: nada se perdeu.
      const { corpo } = await obter<DetalheCorrida>(`/api/corridas/${id}`);
      expect(corpo).toMatchObject({ status: 'EM_ANDAMENTO', encerrada_em: null });
      expect(corpo.trajeto.map((p) => p.sequencia)).toEqual([2]);

      // O painel que entra agora recebe o estado reconstruído, com o sinal perdido.
      const painel = await Painel.conectar(servidor.wsPainel);
      painel.enviar({ tipo: 'inscrever', corrida: id });
      await esperar(() => painel.doTipo('snapshot').length > 0);
      expect(painel.doTipo('snapshot')[0]).toMatchObject({
        corrida: id,
        status: 'EM_ANDAMENTO',
        sinal: 'PERDIDO',
        sequencia_corte: 2,
      });

      // O robô volta, com o mesmo boot, e a corrida segue sem lacunas.
      const depois = await Robo.conectar(servidor.wsTelemetria);
      depois.enviar(hello(), mensagem('celula', 3, { ...c, x: 0, y: 2 }));
      await depois.esperarAck(c.corrida, 3);
      await esperar(() => painel.doTipo('sinal').some((s) => s.estado === 'RETOMADO'));

      const aposRetomada = await obter<DetalheCorrida>(`/api/corridas/${id}`);
      expect(aposRetomada.corpo.status).toBe('EM_ANDAMENTO');
      expect(aposRetomada.corpo.sequencias_faltantes).toBe(0);

      await depois.fechar();
      painel.fechar();
    }, 30_000);
  });
});
