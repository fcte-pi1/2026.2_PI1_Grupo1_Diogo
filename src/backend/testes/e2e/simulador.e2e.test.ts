/**
 * Ponta a ponta: simulador de robô (API programática) → backend completo → PostgreSQL 16 real.
 * É o critério de aceite da #322 ("a API programática é usada por pelo menos um teste E2E").
 *
 * Executar no host ou no CI: `npm run test:e2e` (requer Docker, como o `test:integracao`).
 * Os resultados esperados são os de `docs/software/backend/4_casos_de_teste.md`.
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import { runner } from 'node-pg-migrate';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarValidadorProtocolo } from '../../protocolo/validador.js';
import { criarSimulador, type OpcoesSimulador } from '../../simulador/simulador.js';
import {
  ServicoConsulta,
  ServicoCorrida,
  ServicoDistribuicao,
  ServicoIngestao,
} from '../../src/aplicacao/index.js';
import { construirApp } from '../../src/app.js';
import { BarramentoEventos } from '../../src/infra/barramento-eventos.js';
import { RepositorioConsultaPg } from '../../src/infra/consulta-pg.js';
import { criarContadores } from '../../src/infra/contadores.js';
import { GravadorLote } from '../../src/infra/gravador-lote.js';
import {
  RegistroAuditoriaPg,
  RepositorioCorridasPg,
  RepositorioDispositivosPg,
  RepositorioProjecoesPg,
  VerificadorTokenArgon2,
  criarInserirLote,
} from '../../src/infra/repositorios-pg.js';
import { linhaDoTempoVazia } from '../apoio/linha-do-tempo-vazia.js';

const SILENCIOSO = { info: () => {}, warn: () => {}, error: () => {} };

async function esperar(condicao: () => Promise<boolean>, prazoMs = 5000): Promise<void> {
  const limite = Date.now() + prazoMs;
  while (!(await condicao())) {
    if (Date.now() > limite) throw new Error('condição não atingida no prazo');
    await new Promise((resolver) => setTimeout(resolver, 20));
  }
}

describe('simulador → backend → PostgreSQL', () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let app: FastifyInstance;
  let url: string;
  let distribuicao: ServicoDistribuicao;

  const consulta = async <T extends pg.QueryResultRow>(sql: string, parametros: unknown[] = []) =>
    (await pool.query<T>(sql, parametros)).rows;
  const corridaDe = async (idRobo: string) =>
    (await consulta(`SELECT * FROM corrida WHERE id_corrida_robo = $1`, [idRobo]))[0];
  const contagemDe = async (idRobo: string) =>
    (
      await consulta<{ n: number; distintas: number; min: number; max: number }>(
        `SELECT count(*)::int AS n, count(DISTINCT m.seq)::int AS distintas,
                min(m.seq) AS min, max(m.seq) AS max
         FROM mensagem m JOIN corrida c ON c.id = m.corrida_id WHERE c.id_corrida_robo = $1`,
        [idRobo],
      )
    )[0]!;

  const simulador = (opcoes: OpcoesSimulador = {}) =>
    criarSimulador({ url, taxa: 0, semente: 42, ...opcoes });

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
    // O mesmo cadastro do seed (AMB): sim-01 e sim-02 com o token T-VALIDO.
    const hash = await argon2.hash('T-VALIDO');
    await pool.query(
      `INSERT INTO dispositivo (identificador, nome, token_hash)
       VALUES ('sim-01', 'Simulador', $1), ('sim-02', 'Simulador 2', $1)`,
      [hash],
    );

    const contadores = criarContadores();
    const eventos = new BarramentoEventos();
    const corridas = new ServicoCorrida({
      corridas: new RepositorioCorridasPg(pool),
      projecoes: new RepositorioProjecoesPg(pool),
      eventos,
      log: SILENCIOSO,
    });
    await corridas.recuperar();
    // A mesma montagem do main.ts: a distribuição aos painéis assina os eventos da corrida.
    distribuicao = new ServicoDistribuicao({ corridas, log: SILENCIOSO });
    eventos.assinar('mensagem-aplicada', (d) => distribuicao.aoAplicar(d));
    eventos.assinar('status-alterado', (d) => distribuicao.aoMudarStatus(d));
    eventos.assinar('alerta-tensao', (d) => distribuicao.aoAlertar(d));
    eventos.assinar('sinal-alterado', (d) => distribuicao.aoMudarSinal(d));
    eventos.assinar('ranking-alterado', (d) => distribuicao.aoMudarRanking(d));
    const ingestao = new ServicoIngestao({
      dispositivos: new RepositorioDispositivosPg(pool),
      tokens: new VerificadorTokenArgon2(),
      corridas,
      gravador: new GravadorLote(criarInserirLote(pool)),
      auditoria: new RegistroAuditoriaPg(pool),
      validador: criarValidadorProtocolo(),
      contadores,
      log: SILENCIOSO,
    });
    app = await construirApp({
      linhaDoTempo: linhaDoTempoVazia(),
      verificarBanco: async () => true,
      contadores,
      ingestao,
      consulta: new ServicoConsulta(new RepositorioConsultaPg(pool)),
      distribuicao,
      validador: criarValidadorProtocolo(),
    });
    const endereco = await app.listen({ port: 0, host: '127.0.0.1' });
    url = `${endereco.replace('http', 'ws')}/ws/telemetria`;
  });

  afterAll(async () => {
    distribuicao?.parar();
    await app?.close();
    await pool?.end();
    await container?.stop();
  });

  it('CT-BE-01 e CT-BE-12: corrida completa do simulador, gravada e concluída', async () => {
    const sim = simulador({ labirinto: '8x4' });
    await sim.conectar();
    const corrida = await sim.iniciarCorrida();
    await sim.aguardarConfirmacao(corrida.mensagens);
    await sim.encerrar();

    expect(await contagemDe(corrida.corrida)).toEqual({
      n: corrida.total,
      distintas: corrida.total,
      min: 1,
      max: corrida.total,
    });
    await esperar(async () => (await corridaDe(corrida.corrida))?.status === 'CONCLUIDA');
    expect(await corridaDe(corrida.corrida)).toMatchObject({
      tipo_labirinto: '8x4',
      boot: sim.boot,
      motivo_termino: 'SUCESSO',
      tempo_conclusao_ms: corrida.duracaoMs,
    });
    const eventos = await consulta(`SELECT tipo FROM evento_conexao WHERE boot = $1 ORDER BY id`, [
      sim.boot,
    ]);
    expect(eventos.map((e) => e.tipo)).toEqual(['CONECTADO', 'DESCONECTADO']);
  });

  it('CT-BE-04: queda, reconexão e reenvio do buffer, sem lacunas nem duplicatas no banco', async () => {
    const sim = simulador({ buffer: { maxMensagens: 300 } });
    await sim.conectar();
    const corrida = await sim.iniciarCorrida({ quedas: [{ apos: 120, retorno: 401 }] });
    await sim.aguardarConfirmacao(corrida.mensagens);
    await sim.encerrar();

    expect(await contagemDe(corrida.corrida)).toEqual({
      n: corrida.total,
      distintas: corrida.total,
      min: 1,
      max: corrida.total,
    });
    await esperar(async () => {
      const c = await corridaDe(corrida.corrida);
      return c?.ultimo_seq_contiguo === corrida.total && c?.seqs_faltantes === 0;
    });
    expect(sim.acks.at(-1)?.sequencia).toBe(corrida.total);
  });

  it('CT-BE-05 a 07: as anomalias vão para mensagem_rejeitada e a corrida fecha inteira', async () => {
    const sim = simulador();
    await sim.conectar();
    const corrida = await sim.iniciarCorrida({
      anomalias: [
        { tipo: 'sem-campo' },
        { tipo: 'fora-do-labirinto' },
        { tipo: 'tempo-regredindo' },
      ],
    });
    await sim.aguardarConfirmacao(corrida.mensagens);
    await sim.encerrar();

    await esperar(
      async () =>
        (
          await consulta(`SELECT 1 FROM mensagem_rejeitada WHERE corrida_robo = $1`, [
            corrida.corrida,
          ])
        ).length === 3,
    );
    const motivos = await consulta<{ motivo_codigo: string }>(
      `SELECT motivo_codigo FROM mensagem_rejeitada WHERE corrida_robo = $1 ORDER BY motivo_codigo`,
      [corrida.corrida],
    );
    expect(motivos.map((m) => m.motivo_codigo)).toEqual([
      'COORDENADA_FORA_DO_LABIRINTO',
      'ESQUEMA_INVALIDO',
      'TEMPO_REGRESSIVO',
    ]);
    expect((await contagemDe(corrida.corrida)).distintas).toBe(corrida.total);
  });

  it('CT-BE-14: o reinício do simulador interrompe a corrida com REINICIO_ROBO', async () => {
    const sim = simulador();
    await sim.conectar();
    const corrida = await sim.iniciarCorrida({ reinicioApos: 150 });
    await esperar(async () => (await corridaDe(corrida.corrida))?.status === 'INTERROMPIDA', 2000);
    expect(await corridaDe(corrida.corrida)).toMatchObject({ motivo_termino: 'REINICIO_ROBO' });
    await sim.encerrar();
  });

  it('CT-BE-21: sim-01 e sim-02 ao mesmo tempo, cada corrida no seu dispositivo', async () => {
    const sims = [
      simulador({ dispositivo: 'sim-01', taxa: 400 }),
      simulador({ dispositivo: 'sim-02', taxa: 400 }),
    ];
    await Promise.all(sims.map((s) => s.conectar()));
    const corridas = await Promise.all(sims.map((s) => s.iniciarCorrida()));
    await Promise.all(sims.map((s, i) => s.aguardarConfirmacao(corridas[i]!.mensagens)));
    await Promise.all(sims.map((s) => s.encerrar()));

    const linhas = await consulta<{ identificador: string; id_corrida_robo: string }>(
      `SELECT d.identificador, c.id_corrida_robo FROM corrida c
       JOIN dispositivo d ON d.id = c.dispositivo_id
       WHERE c.id_corrida_robo = ANY($1) ORDER BY d.identificador`,
      [corridas.map((c) => c.corrida)],
    );
    expect(linhas).toEqual([
      { identificador: 'sim-01', id_corrida_robo: corridas[0]!.corrida },
      { identificador: 'sim-02', id_corrida_robo: corridas[1]!.corrida },
    ]);
  });
});
