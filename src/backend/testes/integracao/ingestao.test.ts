/**
 * Ingestão de ponta a ponta: cliente WebSocket → servidor → PostgreSQL 16 real.
 * Executar no host ou no CI: `npm run test:integracao` (requer Docker).
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { runner } from 'node-pg-migrate';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarValidadorProtocolo } from '../../protocolo/validador.js';
import { ServicoIngestao } from '../../src/aplicacao/index.js';
import { construirApp } from '../../src/app.js';
import { criarContadores } from '../../src/infra/contadores.js';
import { GravadorLote } from '../../src/infra/gravador-lote.js';
import {
  RegistroAuditoriaPg,
  RepositorioCorridasPg,
  RepositorioDispositivosPg,
  VerificadorTokenArgon2,
  criarInserirLote,
} from '../../src/infra/repositorios-pg.js';
import { hello, mensagem } from '../apoio/ingestao-em-memoria.js';

/** Cliente de teste: como o robô, só envia. Os acks são apenas guardados para conferência. */
class Robo {
  acks: { corrida: string; sequencia: number }[] = [];
  fechamento: Promise<number>;
  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener('message', (e) => this.acks.push(JSON.parse(String(e.data))));
    this.fechamento = new Promise((resolver) =>
      ws.addEventListener('close', (e) => resolver(e.code)),
    );
  }
  static async conectar(url: string): Promise<Robo> {
    const ws = new WebSocket(url);
    await new Promise((resolver, rejeitar) => {
      ws.addEventListener('open', resolver);
      ws.addEventListener('error', rejeitar);
    });
    return new Robo(ws);
  }
  enviar(...textos: string[]): void {
    for (const texto of textos) this.ws.send(texto);
  }
  async esperarAck(corrida: string, sequencia: number): Promise<void> {
    await esperar(() => this.acks.some((a) => a.corrida === corrida && a.sequencia === sequencia));
  }
  fechar(): Promise<number> {
    this.ws.close();
    return this.fechamento;
  }
}

async function esperar(condicao: () => boolean | Promise<boolean>, prazoMs = 5000): Promise<void> {
  const limite = Date.now() + prazoMs;
  while (!(await condicao())) {
    if (Date.now() > limite) throw new Error('condição não atingida no prazo');
    await new Promise((resolver) => setTimeout(resolver, 10));
  }
}

describe('ingestão de telemetria com PostgreSQL real', () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let app: FastifyInstance;
  let url: string;
  let base: string;

  const consulta = async <T extends pg.QueryResultRow>(sql: string, parametros: unknown[] = []) =>
    (await pool.query<T>(sql, parametros)).rows;
  const sequenciasDe = async (corrida: string) =>
    (
      await consulta<{ seq: number }>(
        `SELECT m.seq FROM mensagem m JOIN corrida c ON c.id = m.corrida_id
         WHERE c.id_corrida_robo = $1 ORDER BY m.seq`,
        [corrida],
      )
    ).map((linha) => linha.seq);

  async function subirServidor(): Promise<void> {
    const contadores = criarContadores();
    const ingestao = new ServicoIngestao({
      dispositivos: new RepositorioDispositivosPg(pool),
      tokens: new VerificadorTokenArgon2(),
      corridas: new RepositorioCorridasPg(pool),
      gravador: new GravadorLote(criarInserirLote(pool)),
      auditoria: new RegistroAuditoriaPg(pool),
      validador: criarValidadorProtocolo(),
      contadores,
      log: { info: () => {}, warn: () => {}, error: () => {} },
    });
    app = await construirApp({
      verificarBanco: async () => true,
      contadores,
      ingestao,
      prazoHelloMs: 300,
    });
    const endereco = await app.listen({ port: 0, host: '127.0.0.1' });
    base = endereco;
    url = `${endereco.replace('http', 'ws')}/ws/telemetria`;
  }

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
    await pool.query(
      `INSERT INTO dispositivo (identificador, nome, token_hash) VALUES ('sim-01', 'Simulador', $1)`,
      [await argon2.hash('T-VALIDO')],
    );
    await subirServidor();
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await container?.stop();
  });

  it('CT-BE-01: aceita o dispositivo autorizado, cria a corrida e confirma', async () => {
    const robo = await Robo.conectar(url);
    robo.enviar(hello(), mensagem('inicio_corrida', 1, { corrida: 'ct01' }));
    await robo.esperarAck('ct01', 1);

    const [corrida] = await consulta(
      `SELECT status, tipo_labirinto, boot, t_inicio_robo_ms FROM corrida WHERE id_corrida_robo = 'ct01'`,
    );
    expect(corrida).toMatchObject({ status: 'EM_ANDAMENTO', tipo_labirinto: '4x4', boot: 'b1' });
    const eventos = await consulta(`SELECT tipo FROM evento_conexao WHERE tipo = 'CONECTADO'`);
    expect(eventos.length).toBeGreaterThanOrEqual(1);
    await robo.fechar();
  });

  it('CT-BE-02: recusa token inválido (4001), versão 99 (4002), falta de hello e silêncio (4003)', async () => {
    const antes = (await consulta('SELECT count(*)::int AS n FROM mensagem'))[0]!.n;

    const tokenErrado = await Robo.conectar(url);
    tokenErrado.enviar(hello({ token: 'T-ERRADO' }));
    expect(await tokenErrado.fechamento).toBe(4001);

    const versao = await Robo.conectar(url);
    versao.enviar(hello({ versao: 99 }));
    expect(await versao.fechamento).toBe(4002);

    const semHello = await Robo.conectar(url);
    semHello.enviar(mensagem('celula', 1, { corrida: 'ct02' }));
    expect(await semHello.fechamento).toBe(4003);

    const mudo = await Robo.conectar(url);
    expect(await mudo.fechamento).toBe(4003);

    expect((await consulta('SELECT count(*)::int AS n FROM mensagem'))[0]!.n).toBe(antes);
    expect(await consulta(`SELECT 1 FROM corrida WHERE id_corrida_robo = 'ct02'`)).toHaveLength(0);
  });

  it('CT-BE-04: queda, reconexão e reenvio do buffer sem duplicar nem deixar lacuna', async () => {
    const posicoes = (de: number, ate: number) =>
      Array.from({ length: ate - de + 1 }, (_, i) =>
        mensagem('posicao', de + i, { corrida: 'ct04' }),
      );

    const antes = await Robo.conectar(url);
    antes.enviar(hello(), mensagem('inicio_corrida', 1, { corrida: 'ct04' }), ...posicoes(2, 120));
    await antes.esperarAck('ct04', 120);
    await antes.fechar();

    const depois = await Robo.conectar(url);
    depois.enviar(hello(), ...posicoes(101, 400));
    await depois.esperarAck('ct04', 400);

    const sequencias = await sequenciasDe('ct04');
    expect(sequencias).toHaveLength(400);
    expect(new Set(sequencias).size).toBe(400);
    await esperar(async () => {
      const [c] = await consulta(
        `SELECT ultimo_seq_contiguo, seqs_faltantes FROM corrida WHERE id_corrida_robo = 'ct04'`,
      );
      return c?.ultimo_seq_contiguo === 400 && c?.seqs_faltantes === 0;
    });
    await depois.fechar();
  });

  it('CT-BE-05, 06 e 07: rejeita sem derrubar a conexão e registra o motivo', async () => {
    const robo = await Robo.conectar(url);
    const c = { corrida: 'ct05' };
    robo.enviar(
      hello(),
      mensagem('inicio_corrida', 1, c),
      mensagem('celula', 2, { ...c, paredes: undefined }),
      'isto não é JSON',
      mensagem('teleporte', 3, c),
      mensagem('celula', 2, { ...c, x: 5, y: 2 }),
      mensagem('energia', 2, { ...c, tensao_v: 4.9 }),
      mensagem('celula', 2, c),
    );
    await robo.esperarAck('ct05', 2);

    expect(await sequenciasDe('ct05')).toEqual([1, 2]);
    const rejeitadas = await consulta<{ motivo_codigo: string; seq: number | null }>(
      `SELECT motivo_codigo, seq FROM mensagem_rejeitada
       WHERE corrida_robo = 'ct05' OR corrida_robo IS NULL ORDER BY id`,
    );
    expect(rejeitadas.map((r) => r.motivo_codigo)).toEqual([
      'ESQUEMA_INVALIDO',
      'JSON_INVALIDO',
      'TIPO_DESCONHECIDO',
      'COORDENADA_FORA_DO_LABIRINTO',
      'TENSAO_FORA_DA_FAIXA',
    ]);
    await robo.fechar();
  });

  it('CT-BE-08: a duplicata é confirmada, mas gravada uma única vez, mesmo em duas conexões', async () => {
    const c = { corrida: 'ct08' };
    const a = await Robo.conectar(url);
    const b = await Robo.conectar(url);
    a.enviar(hello(), mensagem('inicio_corrida', 1, c));
    b.enviar(hello());
    await a.esperarAck('ct08', 1);

    for (let i = 0; i < 3; i++) {
      a.enviar(mensagem('celula', 2, c));
      b.enviar(mensagem('celula', 2, c));
    }
    await a.esperarAck('ct08', 2);
    await b.esperarAck('ct08', 2);

    expect(await sequenciasDe('ct08')).toEqual([1, 2]);
    const saude = (await (await fetch(`${base}/health`)).json()) as {
      ingestao: { mensagens_duplicadas: number };
    };
    expect(saude.ingestao.mensagens_duplicadas).toBeGreaterThanOrEqual(5);
    await Promise.all([a.fechar(), b.fechar()]);
  });

  it('CT-BE-09: cria a corrida mesmo sem inicio_corrida e a completa no reenvio', async () => {
    const c = { corrida: 'ct09' };
    const robo = await Robo.conectar(url);
    robo.enviar(hello(), mensagem('celula', 5, c));
    await robo.esperarAck('ct09', 0);
    expect(
      (await consulta(`SELECT tipo_labirinto FROM corrida WHERE id_corrida_robo = 'ct09'`))[0],
    ).toEqual({ tipo_labirinto: null });

    robo.enviar(
      mensagem('inicio_corrida', 1, { ...c, labirinto: '8x4' }),
      ...[2, 3, 4].map((n) => mensagem('posicao', n, c)),
    );
    await robo.esperarAck('ct09', 5);
    const corridas = await consulta(
      `SELECT tipo_labirinto, t_inicio_robo_ms FROM corrida WHERE id_corrida_robo = 'ct09'`,
    );
    expect(corridas).toEqual([{ tipo_labirinto: '8x4', t_inicio_robo_ms: '100' }]);
    await robo.fechar();
  });

  it('aceita um novo hello na mesma conexão e fecha se ele for inválido', async () => {
    const c = { corrida: 'rehello' };
    const robo = await Robo.conectar(url);
    robo.enviar(hello(), mensagem('inicio_corrida', 1, c), mensagem('celula', 2, c));
    await robo.esperarAck('rehello', 2);

    // O BLE caiu e voltou: o robô manda hello de novo (boot novo) e reenvia o buffer.
    robo.enviar(hello({ boot: 'b2' }), mensagem('celula', 2, c), mensagem('posicao', 3, c));
    await robo.esperarAck('rehello', 3);
    expect(await sequenciasDe('rehello')).toEqual([1, 2, 3]);
    const reinicios = await consulta(
      `SELECT e.boot FROM evento_conexao e JOIN corrida c ON c.id = e.corrida_id
       WHERE c.id_corrida_robo = 'rehello' AND e.tipo = 'REINICIO_DETECTADO'`,
    );
    expect(reinicios).toEqual([{ boot: 'b2' }]);

    robo.enviar(hello({ token: 'T-ERRADO' }));
    expect(await robo.fechamento).toBe(4001);
  });

  it('RNF-52: depois de reiniciar o backend, continua idempotente e confirma do ponto certo', async () => {
    const c = { corrida: 'rnf52' };
    const antes = await Robo.conectar(url);
    antes.enviar(hello(), mensagem('inicio_corrida', 1, c), mensagem('celula', 2, c));
    await antes.esperarAck('rnf52', 2);

    await app.close();
    await subirServidor();

    const depois = await Robo.conectar(url);
    depois.enviar(hello(), mensagem('celula', 2, c), mensagem('posicao', 3, c));
    await depois.esperarAck('rnf52', 3);
    expect(await sequenciasDe('rnf52')).toEqual([1, 2, 3]);
    await depois.fechar();
  });

  it('grava o payload original e registra a perda de sinal ao fechar no meio da corrida', async () => {
    const c = { corrida: 'aud' };
    const robo = await Robo.conectar(url);
    const celula = mensagem('celula', 2, c);
    robo.enviar(hello(), mensagem('inicio_corrida', 1, c), celula);
    await robo.esperarAck('aud', 2);
    await robo.fechar();

    const [gravada] = await consulta(
      `SELECT m.tipo, m.t_robo_ms, m.versao_protocolo, m.payload FROM mensagem m
       JOIN corrida c ON c.id = m.corrida_id WHERE c.id_corrida_robo = 'aud' AND m.seq = 2`,
    );
    expect(gravada).toMatchObject({ tipo: 'celula', t_robo_ms: '200', versao_protocolo: 1 });
    expect(gravada!.payload).toEqual(JSON.parse(celula));

    await esperar(async () => {
      const eventos = await consulta<{ tipo: string }>(
        `SELECT e.tipo FROM evento_conexao e JOIN corrida c ON c.id = e.corrida_id
         WHERE c.id_corrida_robo = 'aud' ORDER BY e.id`,
      );
      return eventos.map((e) => e.tipo).join() === 'SINAL_PERDIDO,DESCONECTADO';
    });
  });
});
