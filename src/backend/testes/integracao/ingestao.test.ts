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
import WebSocketNode from 'ws';
import type { DetalheCorrida, RespostaLeaderboard } from '../../protocolo/tipos.js';
import { criarValidadorProtocolo } from '../../protocolo/validador.js';
import {
  AVISO_PAINEL_LENTO,
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
import { hello, mensagem } from '../apoio/ingestao-em-memoria.js';

const SILENCIOSO = { info: () => {}, warn: () => {}, error: () => {} };

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
  let corridas: ServicoCorrida;
  let distribuicao: ServicoDistribuicao;
  let verificacaoPaineis: ReturnType<typeof setInterval> | undefined;
  const avisosDistribuicao: string[] = [];

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
    const eventos = new BarramentoEventos();
    corridas = new ServicoCorrida({
      corridas: new RepositorioCorridasPg(pool),
      projecoes: new RepositorioProjecoesPg(pool),
      eventos,
      log: { info: () => {}, warn: () => {}, error: () => {} },
    });
    await corridas.recuperar();
    distribuicao?.parar();
    if (verificacaoPaineis) clearInterval(verificacaoPaineis);
    // Limites menores que os de produção, para o CT-BE-24 não levar 10 s nem precisar de
    // 1 MB no buffer. A regra é a mesma.
    distribuicao = new ServicoDistribuicao({
      corridas,
      log: { ...SILENCIOSO, warn: (_dados, mensagem) => avisosDistribuicao.push(mensagem) },
      limiteBufferBytes: 64 * 1024,
      prazoPainelLentoMs: 500,
    });
    verificacaoPaineis = setInterval(() => distribuicao.verificarPaineis(), 100);
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
      log: { info: () => {}, warn: () => {}, error: () => {} },
    });
    app = await construirApp({
      verificarBanco: async () => true,
      contadores,
      ingestao,
      consulta: new ServicoConsulta(new RepositorioConsultaPg(pool)),
      distribuicao,
      validador: criarValidadorProtocolo(),
      prazoHelloMs: 300,
      // Maior que o prazo do painel lento, como em produção (15 s e 10 s): quem não lê
      // também não responde ao ping, e o painel lento tem de cair pela regra do RF-91.
      intervaloPingPainelMs: 1500,
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
    if (verificacaoPaineis) clearInterval(verificacaoPaineis);
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

  describe('persistência e métricas (#325)', () => {
    const corridaDe = async (idRobo: string) =>
      (await consulta(`SELECT * FROM corrida WHERE id_corrida_robo = $1`, [idRobo]))[0]!;

    it('CT-BE-12, 15, 16 e 18: encerra com status, tempo, velocidade e energia gravados', async () => {
      const c = { corrida: 'met' };
      const robo = await Robo.conectar(url);
      const celulas = Array.from({ length: 31 }, (_, i) =>
        mensagem('celula', i + 2, {
          ...c,
          x: i % 4,
          y: 3 - (Math.floor(i / 4) % 4),
          tempo_ms: 1000 + i * 1500,
        }),
      );
      const energias = [8.2, 8.0, 7.8, 7.6].map((v, i) =>
        mensagem('energia', 33 + i, { ...c, tensao_v: v, tempo_ms: 46_000 + i }),
      );
      robo.enviar(
        hello(),
        mensagem('inicio_corrida', 1, { ...c, tempo_ms: 1000 }),
        ...celulas,
        ...energias,
        mensagem('fim_corrida', 37, { ...c, tempo_ms: 95_500 }),
      );
      await robo.esperarAck('met', 37);
      await robo.fechar();
      await corridas.esvaziar();

      const corrida = await corridaDe('met');
      expect(corrida).toMatchObject({
        status: 'CONCLUIDA',
        motivo_termino: 'SUCESSO',
        tempo_conclusao_ms: 94_500,
        t_fim_robo_ms: '95500',
        transicoes_celula: 30,
        distancia_m: '5.40',
        tensao_inicial_v: '8.200',
        tensao_final_v: '7.600',
        delta_v: '0.600',
        carga_inicial_pct: '87.50',
        carga_final_pct: '50.00',
        ultimo_seq_contiguo: 37,
        seqs_faltantes: 0,
      });
      expect(corrida.encerrada_em).toBeInstanceOf(Date);
      // 30 transições em 94,5 s (do início ao fim, pelo relógio do robô).
      expect(Number(corrida.velocidade_media_mps)).toBeCloseTo(5.4 / 94.5, 3);

      const passagens = await consulta(
        `SELECT count(*)::int AS n, sum(revisita::int)::int AS revisitas FROM passagem_celula WHERE corrida_id = $1`,
        [corrida.id],
      );
      expect(passagens[0]).toEqual({ n: 31, revisitas: corrida.revisitas });
      const leituras = await consulta(
        `SELECT tensao_v FROM leitura_energia WHERE corrida_id = $1 ORDER BY seq`,
        [corrida.id],
      );
      expect(leituras.map((l) => l.tensao_v)).toEqual(['8.200', '8.000', '7.800', '7.600']);
      const snapshots = await consulta(
        `SELECT seq_corte, celulas_visitadas FROM snapshot_mapa WHERE corrida_id = $1 ORDER BY seq_corte`,
        [corrida.id],
      );
      expect(snapshots.map((s) => s.seq_corte)).toEqual([21, 37]);
      // Passagens, contando as revisitas (CT-BE-11).
      expect(snapshots.map((s) => s.celulas_visitadas)).toEqual([20, 31]);

      // RNF-54: depois de CONCLUIDA, o banco recusa alterar a corrida.
      await expect(
        pool.query(`UPDATE corrida SET status = 'FALHOU' WHERE id = $1`, [corrida.id]),
      ).rejects.toThrow(/não pode ser alterada/);
    });

    const rejeicoesDe = (corrida: string) =>
      consulta<{ motivo_codigo: string; seq: number }>(
        `SELECT motivo_codigo, seq FROM mensagem_rejeitada WHERE corrida_robo = $1 ORDER BY id`,
        [corrida],
      );

    it('CT-BE-20: FALHOU com detalhe, e um segundo fim é rejeitado (CORRIDA_FINALIZADA)', async () => {
      const c = { corrida: 'falha' };
      const robo = await Robo.conectar(url);
      robo.enviar(
        hello(),
        mensagem('inicio_corrida', 1, c),
        mensagem('fim_corrida', 2, { ...c, resultado: 'falha', detalhe: 'Erro: sensor ToF 3' }),
        mensagem('fim_corrida', 3, { ...c, resultado: 'sucesso' }),
      );
      await robo.esperarAck('falha', 2);
      await esperar(async () => (await rejeicoesDe('falha')).length > 0);
      await robo.fechar();
      await corridas.esvaziar();

      expect(await corridaDe('falha')).toMatchObject({
        status: 'FALHOU',
        motivo_termino: 'FALHA_REPORTADA',
        detalhe_termino: 'Erro: sensor ToF 3',
        tempo_conclusao_ms: null,
      });
      expect(await rejeicoesDe('falha')).toEqual([{ motivo_codigo: 'CORRIDA_FINALIZADA', seq: 3 }]);
      expect(await sequenciasDe('falha')).toEqual([1, 2]);
    });

    it('CT-BE-14: reconectar com outro boot interrompe a corrida (REINICIO_ROBO)', async () => {
      const c = { corrida: 'reboot' };
      const antes = await Robo.conectar(url);
      antes.enviar(hello(), mensagem('inicio_corrida', 1, c));
      await antes.esperarAck('reboot', 1);

      const depois = await Robo.conectar(url);
      depois.enviar(hello({ boot: 'b-novo' }));
      await esperar(async () => (await corridaDe('reboot')).status === 'INTERROMPIDA');
      expect(await corridaDe('reboot')).toMatchObject({ motivo_termino: 'REINICIO_ROBO' });

      // Um fim enviado depois para essa corrida é rejeitado.
      depois.enviar(mensagem('fim_corrida', 2, c));
      await esperar(async () => (await rejeicoesDe('reboot')).length > 0);
      expect(await rejeicoesDe('reboot')).toEqual([
        { motivo_codigo: 'CORRIDA_FINALIZADA', seq: 2 },
      ]);
      expect(await corridaDe('reboot')).toMatchObject({ status: 'INTERROMPIDA' });
      await Promise.all([antes.fechar(), depois.fechar()]);
    });

    it('RNF-52: o backend reinicia no meio da corrida e as métricas continuam de onde pararam', async () => {
      const c = { corrida: 'recupera' };
      const antes = await Robo.conectar(url);
      antes.enviar(
        hello(),
        mensagem('inicio_corrida', 1, { ...c, tempo_ms: 0 }),
        mensagem('celula', 2, { ...c, tempo_ms: 0 }),
        mensagem('celula', 3, { ...c, x: 0, y: 2, tempo_ms: 1800 }),
      );
      await antes.esperarAck('recupera', 3);

      await app.close();
      await subirServidor();

      const depois = await Robo.conectar(url);
      depois.enviar(
        hello(),
        mensagem('celula', 4, { ...c, x: 1, y: 2, tempo_ms: 3600 }),
        mensagem('fim_corrida', 5, { ...c, tempo_ms: 3600 }),
      );
      await depois.esperarAck('recupera', 5);
      await depois.fechar();
      await corridas.esvaziar();

      const corrida = await corridaDe('recupera');
      expect(corrida).toMatchObject({
        status: 'CONCLUIDA',
        transicoes_celula: 2,
        tempo_conclusao_ms: 3600,
      });
      const ordens = await consulta(
        `SELECT seq, ordem FROM passagem_celula WHERE corrida_id = $1 ORDER BY seq`,
        [corrida.id],
      );
      expect(ordens).toEqual([
        { seq: 2, ordem: 1 },
        { seq: 3, ordem: 2 },
        { seq: 4, ordem: 3 },
      ]);
    });
  });

  describe('numeração de tentativas por apresentação (RF-97, CT-BE-30)', () => {
    const numeroDe = async (idRobo: string) =>
      (
        await consulta<{ numero_tentativa: number | null; nome: string | null }>(
          `SELECT c.numero_tentativa, a.nome FROM corrida c
           LEFT JOIN apresentacao a ON a.id = c.apresentacao_id
           WHERE c.id_corrida_robo = $1`,
          [idRobo],
        )
      )[0];
    const ativar = async (nome: string) => {
      await pool.query('UPDATE apresentacao SET ativa = false WHERE ativa');
      await pool.query(`INSERT INTO apresentacao (nome, ativa) VALUES ($1, true)`, [nome]);
    };
    /** Uma corrida curta: inicio, uma célula e, se pedido, o fim. */
    async function correr(
      idRobo: string,
      labirinto: string,
      fim?: 'sucesso' | 'falha',
      boot = 'b-tent',
    ): Promise<void> {
      const c = { corrida: idRobo };
      const robo = await Robo.conectar(url);
      robo.enviar(
        hello({ boot }),
        mensagem('inicio_corrida', 1, { ...c, labirinto }),
        mensagem('celula', 2, c),
        ...(fim ? [mensagem('fim_corrida', 3, { ...c, resultado: fim })] : []),
      );
      await robo.esperarAck(idRobo, fim ? 3 : 2);
      await robo.fechar();
    }

    afterAll(async () => {
      // Os outros testes rodam sem apresentação ativa.
      await pool.query('UPDATE apresentacao SET ativa = false WHERE ativa');
    });

    it('CT-BE-30: numera por (apresentação, labirinto), contando falha, interrupção e anulação', async () => {
      await ativar('Teste CT-BE-30');
      await correr('tent-1', '4x4', 'falha');
      await correr('tent-2', '4x4', 'sucesso');
      await correr('tent-3', '8x4'); // fica em andamento...
      await correr('tent-4', '4x4', 'sucesso', 'b-tent-2'); // ...e é interrompida pelo reinício
      await esperar(async () => {
        const [c] = await consulta<{ status: string }>(
          `SELECT status FROM corrida WHERE id_corrida_robo = 'tent-3'`,
        );
        return c?.status === 'INTERROMPIDA';
      });
      // A 4x4 de sucesso é anulada depois: continua com o número dela.
      await pool.query(
        `INSERT INTO operador (login, nome, senha_hash) VALUES ('op-tent', 'Operador', 'x')
         ON CONFLICT DO NOTHING`,
      );
      await pool.query(
        `INSERT INTO anulacao (corrida_id, operador_id, motivo)
         SELECT c.id, o.id, 'toque manual' FROM corrida c, operador o
         WHERE c.id_corrida_robo = 'tent-4' AND o.login = 'op-tent'`,
      );

      expect(await numeroDe('tent-1')).toEqual({ numero_tentativa: 1, nome: 'Teste CT-BE-30' });
      expect((await numeroDe('tent-2'))!.numero_tentativa).toBe(2);
      expect((await numeroDe('tent-3'))!.numero_tentativa).toBe(1); // o 8x4 tem a sua contagem
      expect((await numeroDe('tent-4'))!.numero_tentativa).toBe(3);

      // Na apresentação "Final", a contagem recomeça.
      await ativar('Final CT-BE-30');
      await correr('tent-5', '4x4', 'sucesso', 'b-tent-2');
      expect(await numeroDe('tent-5')).toEqual({ numero_tentativa: 1, nome: 'Final CT-BE-30' });

      // O número aparece no detalhe da corrida.
      const resposta = await fetch(
        `${base}/api/corridas/${
          (
            await consulta<{ id: string }>(
              `SELECT id FROM corrida WHERE id_corrida_robo = 'tent-2'`,
            )
          )[0]!.id
        }`,
      );
      expect(((await resposta.json()) as DetalheCorrida).numero_tentativa).toBe(2);
    });

    it('duas corridas ao mesmo tempo no mesmo labirinto recebem números diferentes', async () => {
      await ativar('Concorrência');
      await Promise.all(
        Array.from({ length: 5 }, (_, i) => correr(`conc-${i}`, '12x4', undefined, 'b-conc')),
      );
      const numeros = await consulta<{ numero_tentativa: number }>(
        `SELECT numero_tentativa FROM corrida WHERE id_corrida_robo LIKE 'conc-%'
         ORDER BY numero_tentativa`,
      );
      expect(numeros.map((n) => n.numero_tentativa)).toEqual([1, 2, 3, 4, 5]);
    });

    it('20 corridas criadas ao mesmo tempo no repositório recebem números distintos', async () => {
      // Pelo WebSocket, as corridas quase não se sobrepõem na numeração: sem o FOR UPDATE, o
      // teste anterior ainda passa. Direto no repositório, as 20 disputam a mesma contagem.
      await ativar('Concorrência no repositório');
      const [{ id: dispositivoId }] = (await consulta<{ id: string }>(
        `SELECT id FROM dispositivo WHERE identificador = 'sim-01'`,
      )) as [{ id: string }];
      const repositorio = new RepositorioCorridasPg(pool);
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          repositorio.obterOuCriar({
            dispositivoId,
            idCorridaRobo: `repo-conc-${i}`,
            boot: 'b-repo-conc',
            versaoProtocolo: 1,
            labirinto: '4x4',
            tempoInicioRoboMs: 0,
          }),
        ),
      );
      const numeros = await consulta<{ numero_tentativa: number }>(
        `SELECT numero_tentativa FROM corrida WHERE id_corrida_robo LIKE 'repo-conc-%'
         ORDER BY numero_tentativa`,
      );
      expect(numeros.map((n) => n.numero_tentativa)).toEqual(
        Array.from({ length: 20 }, (_, i) => i + 1),
      );
    });

    it('corrida já terminada e sem número: a recarga não tenta numerar nem falha', async () => {
      // A numeração falhou antes do fim (por exemplo, o banco caiu nesse instante) e a corrida
      // terminou sem número. O tg_corrida_imutavel recusa qualquer UPDATE nela.
      await ativar('Terminada sem número');
      const [{ id: dispositivoId }] = (await consulta<{ id: string }>(
        `SELECT id FROM dispositivo WHERE identificador = 'sim-01'`,
      )) as [{ id: string }];
      await pool.query(
        `INSERT INTO corrida (dispositivo_id, id_corrida_robo, boot, tipo_labirinto, status,
                              motivo_termino, versao_protocolo, apresentacao_id, encerrada_em)
         VALUES ($1, 'terminada-sem-numero', 'b-term', '4x4', 'FALHOU', 'FALHA_REPORTADA', 1,
                 (SELECT id FROM apresentacao WHERE ativa), now())`,
        [dispositivoId],
      );
      // A recarga (reinício do backend, RNF-52) passa pelo obterOuCriar.
      await expect(
        new RepositorioCorridasPg(pool).obterOuCriar({
          dispositivoId,
          idCorridaRobo: 'terminada-sem-numero',
          boot: 'b-term',
          versaoProtocolo: 1,
          labirinto: '4x4',
          tempoInicioRoboMs: 0,
        }),
      ).resolves.toMatchObject({ status: 'FALHOU' });
      expect((await numeroDe('terminada-sem-numero'))!.numero_tentativa).toBeNull();
    });

    it('sem labirinto, a corrida espera o inicio_corrida para ser numerada', async () => {
      await ativar('Labirinto tardio');
      const c = { corrida: 'tardia' };
      const robo = await Robo.conectar(url);
      // A primeira mensagem não é o inicio_corrida (ele se perdeu e vem no reenvio).
      robo.enviar(hello({ boot: 'b-tardia' }), mensagem('celula', 2, c));
      await robo.esperarAck('tardia', 0);
      expect((await numeroDe('tardia'))!.numero_tentativa).toBeNull();

      robo.enviar(mensagem('inicio_corrida', 1, { ...c, labirinto: '8x4' }));
      await robo.esperarAck('tardia', 2);
      await esperar(async () => (await numeroDe('tardia'))!.numero_tentativa === 1);
      await robo.fechar();
    });

    it('sem apresentação ativa, a corrida fica sem número', async () => {
      await pool.query('UPDATE apresentacao SET ativa = false WHERE ativa');
      await correr('sem-apresentacao', '4x4', 'sucesso', 'b-sem');
      expect(await numeroDe('sem-apresentacao')).toEqual({ numero_tentativa: null, nome: null });
    });
  });

  describe('GET /api/corridas/{id} (#325, parte 2)', () => {
    const idDe = async (idRobo: string) =>
      (
        await consulta<{ id: string }>(`SELECT id FROM corrida WHERE id_corrida_robo = $1`, [
          idRobo,
        ])
      )[0]!.id;
    const detalhe = async (id: string) => {
      const resposta = await fetch(`${base}/api/corridas/${id}`);
      return { status: resposta.status, corpo: (await resposta.json()) as DetalheCorrida };
    };

    it('devolve métricas, trajeto em ordem e série de energia de uma corrida encerrada', async () => {
      const c = { corrida: 'detalhe' };
      const robo = await Robo.conectar(url);
      robo.enviar(
        hello(),
        mensagem('inicio_corrida', 1, { ...c, labirinto: '8x4', tempo_ms: 1000 }),
        mensagem('celula', 2, { ...c, x: 0, y: 3, tempo_ms: 1000 }),
        mensagem('energia', 3, { ...c, tensao_v: 8.2, tempo_ms: 1000 }),
        // A 5 chega antes da 4, como num reenvio.
        mensagem('celula', 5, { ...c, x: 0, y: 3, tempo_ms: 4600 }),
        mensagem('celula', 4, {
          ...c,
          x: 0,
          y: 2,
          tempo_ms: 2800,
          paredes: { norte: true, leste: false, sul: false, oeste: true },
        }),
        mensagem('energia', 6, { ...c, tensao_v: 7.6, tempo_ms: 4600 }),
        mensagem('fim_corrida', 7, { ...c, tempo_ms: 10_000 }),
      );
      await robo.esperarAck('detalhe', 7);
      await robo.fechar();
      await corridas.esvaziar();

      const { status, corpo } = await detalhe(await idDe('detalhe'));
      expect(status).toBe(200);
      expect(corpo).toMatchObject({
        corrida_robo: 'detalhe',
        tipo_labirinto: '8x4',
        status: 'CONCLUIDA',
        motivo_termino: 'SUCESSO',
        detalhe_termino: null,
        tempo_conclusao_ms: 9000,
        anulada: false,
        anulacao: null,
        ultima_sequencia_contigua: 7,
        sequencias_faltantes: 0,
        metricas: {
          tempo_decorrido_ms: 9000,
          tempo_conclusao_ms: 9000,
          celulas_percorridas: 2,
          distancia_m: 0.36,
          revisitas: 1,
          velocidade_media_mps: 0.04,
          tensao_inicial_v: 8.2,
          tensao_final_v: 7.6,
          delta_v: 0.6,
          carga_inicial_pct: 87.5,
          carga_final_pct: 50,
        },
      });
      expect(corpo.trajeto).toEqual([
        {
          sequencia: 2,
          ordem: 1,
          x: 0,
          y: 3,
          paredes: { norte: false, leste: true, sul: true, oeste: true },
          tempo_ms: 1000,
          revisita: false,
        },
        {
          sequencia: 4,
          ordem: 2,
          x: 0,
          y: 2,
          paredes: { norte: true, leste: false, sul: false, oeste: true },
          tempo_ms: 2800,
          revisita: false,
        },
        {
          sequencia: 5,
          ordem: 3,
          x: 0,
          y: 3,
          paredes: { norte: false, leste: true, sul: true, oeste: true },
          tempo_ms: 4600,
          revisita: true,
        },
      ]);
      expect(corpo.energia).toEqual([
        { sequencia: 3, tempo_ms: 1000, tensao_v: 8.2, corrente_a: 0.4, potencia_w: 3.2 },
        { sequencia: 6, tempo_ms: 4600, tensao_v: 7.6, corrente_a: 0.4, potencia_w: 3.2 },
      ]);
      expect(Date.parse(corpo.iniciada_em)).not.toBeNaN();
      expect(Date.parse(corpo.encerrada_em!)).not.toBeNaN();
    });

    it('numera o trajeto pela sequência, mesmo com a coluna ordem repetida', async () => {
      const c = { corrida: 'ordem-repetida' };
      const robo = await Robo.conectar(url);
      robo.enviar(
        hello(),
        mensagem('inicio_corrida', 1, c),
        mensagem('celula', 2, { ...c, x: 0, y: 3 }),
        mensagem('celula', 3, { ...c, x: 0, y: 2 }),
        mensagem('celula', 4, { ...c, x: 0, y: 1 }),
      );
      await robo.esperarAck('ordem-repetida', 4);
      await robo.fechar();
      await corridas.esvaziar();
      const id = await idDe('ordem-repetida');
      // O que sobra no banco quando uma lacuna é preenchida tarde e o backend reinicia.
      await pool.query(`UPDATE passagem_celula SET ordem = 2 WHERE corrida_id = $1 AND seq = 4`, [
        id,
      ]);

      const { corpo } = await detalhe(id);
      expect(corpo.trajeto.map((p) => [p.sequencia, p.ordem])).toEqual([
        [2, 1],
        [3, 2],
        [4, 3],
      ]);
    });

    it('serve a corrida em andamento, com o que já foi gravado', async () => {
      const c = { corrida: 'parcial' };
      const robo = await Robo.conectar(url);
      robo.enviar(
        hello(),
        mensagem('inicio_corrida', 1, { ...c, tempo_ms: 0 }),
        mensagem('celula', 2, { ...c, tempo_ms: 0 }),
        mensagem('posicao', 3, { ...c, tempo_ms: 700 }),
      );
      await robo.esperarAck('parcial', 3);
      await corridas.esvaziar();

      const { status, corpo } = await detalhe(await idDe('parcial'));
      expect(status).toBe(200);
      expect(corpo).toMatchObject({
        status: 'EM_ANDAMENTO',
        encerrada_em: null,
        tempo_conclusao_ms: null,
      });
      expect(corpo.metricas.tempo_decorrido_ms).toBe(700);
      expect(corpo.trajeto).toHaveLength(1);
      await robo.fechar();
    });

    it('mostra a anulação, com o operador', async () => {
      const id = await idDe('detalhe');
      await pool.query(
        `INSERT INTO operador (login, nome, senha_hash) VALUES ('op-teste', 'Operador', 'x') ON CONFLICT DO NOTHING`,
      );
      await pool.query(
        `INSERT INTO anulacao (corrida_id, operador_id, motivo)
         SELECT $1, id, 'robô empurrado na largada' FROM operador WHERE login = 'op-teste'`,
        [id],
      );
      const { corpo } = await detalhe(id);
      expect(corpo.anulada).toBe(true);
      expect(corpo.anulacao).toMatchObject({
        motivo: 'robô empurrado na largada',
        operador: 'op-teste',
      });
    });

    it('404 para corrida inexistente e 400 para id que não é UUID', async () => {
      expect((await detalhe('0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33')).status).toBe(404);
      expect((await detalhe('nao-e-uuid')).status).toBe(400);
    });
  });

  describe('distribuição aos painéis (#327)', () => {
    /** Painel de teste: guarda tudo o que recebe e pode enviar inscrições. */
    async function conectarPainel() {
      const ws = new WebSocket(url.replace('/ws/telemetria', '/ws/painel'));
      const recebidas: { tipo: string; [chave: string]: unknown }[] = [];
      ws.addEventListener('message', (e) => recebidas.push(JSON.parse(String(e.data))));
      const fechou = new Promise<number>((resolver) =>
        ws.addEventListener('close', (e) => resolver(e.code)),
      );
      await new Promise((resolver, rejeitar) => {
        ws.addEventListener('open', resolver);
        ws.addEventListener('error', rejeitar);
      });
      return {
        recebidas,
        fechou,
        enviar: (m: unknown) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)),
        fechar: () => ws.close(),
        doTipo: (tipo: string) => recebidas.filter((m) => m.tipo === tipo),
      };
    }

    async function idDaCorrida(idRobo: string): Promise<string> {
      let linhas: { id: string }[] = [];
      await esperar(async () => {
        linhas = await consulta<{ id: string }>(
          `SELECT id FROM corrida WHERE id_corrida_robo = $1`,
          [idRobo],
        );
        return linhas.length > 0;
      });
      return linhas[0]!.id;
    }

    const urlPainel = () => url.replace('/ws/telemetria', '/ws/painel');
    /** Painel com o cliente `ws`, que permite parar de ler o socket e não responder ao ping. */
    async function painelNode(opcoes: WebSocketNode.ClientOptions = {}) {
      const ws = new WebSocketNode(urlPainel(), opcoes);
      const fechou = new Promise<number>((resolver) =>
        ws.on('close', (codigo) => resolver(codigo)),
      );
      await new Promise((resolver, rejeitar) => {
        ws.once('open', resolver);
        ws.once('error', rejeitar);
      });
      return { ws, fechou };
    }

    it('CT-BE-25: PERDIDO quando a conexão cai e RETOMADO em até 1 s após o hello da reconexão', async () => {
      const c = { corrida: 'sinal-volta' };
      const antes = await Robo.conectar(url);
      antes.enviar(hello(), mensagem('inicio_corrida', 1, c));
      await antes.esperarAck('sinal-volta', 1);
      const id = await idDaCorrida('sinal-volta');
      const painel = await conectarPainel();
      painel.enviar({ tipo: 'inscrever', corrida: id });
      await esperar(() => painel.doTipo('snapshot').length > 0);
      const estados = () => painel.doTipo('sinal').map((m) => m.estado);

      const perda = Date.now();
      await antes.fechar();
      await esperar(() => estados().length === 1);
      expect(Date.now() - perda).toBeLessThan(1000);

      // O robô volta por uma conexão nova, com o mesmo boot.
      const depois = await Robo.conectar(url);
      const retomada = Date.now();
      depois.enviar(hello());
      await esperar(() => estados().length === 2);
      expect(Date.now() - retomada).toBeLessThan(1000);
      expect(estados()).toEqual(['PERDIDO', 'RETOMADO']);
      await esperar(
        async () =>
          (
            await consulta(
              `SELECT 1 FROM evento_conexao WHERE corrida_id = $1 AND tipo = 'SINAL_RETOMADO'`,
              [id],
            )
          ).length === 1,
      );

      // Depois do hello, a corrida é a ativa da conexão nova: a próxima queda também é avisada.
      await depois.fechar();
      await esperar(() => estados().length === 3);
      painel.fechar();
    });

    it('CT-BE-24: o painel que não lê perde os contínuos e cai; o socket é liberado e o outro painel recebe tudo', async () => {
      const c = { corrida: 'painel-lento' };
      const robo = await Robo.conectar(url);
      robo.enviar(hello(), mensagem('inicio_corrida', 1, { ...c, labirinto: '12x4', tempo_ms: 0 }));
      await robo.esperarAck('painel-lento', 1);
      const id = await idDaCorrida('painel-lento');

      const normal = await conectarPainel();
      normal.enviar({ tipo: 'inscrever', corrida: id });
      const lento = await painelNode();
      lento.ws.send(JSON.stringify({ tipo: 'inscrever', corrida: id }));
      await esperar(() => normal.doTipo('snapshot').length > 0);
      await new Promise((resolver) => setTimeout(resolver, 100));
      // O painel lento para de ler: o buffer de envio do backend para ele só cresce. O
      // pause() do cliente ws para de ler o socket (API pública, tipada em @types/ws).
      lento.ws.pause();
      avisosDistribuicao.length = 0;

      // O robô envia até o backend desconectar o painel lento. Os buffers do sistema
      // operacional variam, então a quantidade não é fixa.
      let sequencia = 1;
      while (!avisosDistribuicao.includes(AVISO_PAINEL_LENTO) && sequencia < 40_000) {
        const lote: string[] = [];
        for (let i = 0; i < 500; i++) {
          sequencia++;
          lote.push(
            sequencia % 2 === 0
              ? mensagem('celula', sequencia, {
                  ...c,
                  x: sequencia % 12,
                  y: 0,
                  tempo_ms: sequencia,
                })
              : mensagem('posicao', sequencia, {
                  ...c,
                  x: sequencia % 12,
                  y: 0,
                  tempo_ms: sequencia,
                }),
          );
        }
        robo.enviar(...lote);
        await robo.esperarAck('painel-lento', sequencia);
      }
      await esperar(() => avisosDistribuicao.includes(AVISO_PAINEL_LENTO), 5000);

      // O painel normal recebeu todas as células, em ordem, durante todo o episódio.
      const celulasEnviadas = Math.floor(sequencia / 2);
      await esperar(
        () => normal.recebidas.filter((m) => m.evento === 'celula').length === celulasEnviadas,
      );
      const sequencias = normal.recebidas
        .filter((m) => m.evento === 'celula')
        .map((m) => m.sequencia as number);
      expect(sequencias).toEqual([...sequencias].sort((a, b) => a - b));

      // O socket do painel lento foi destruído pelo backend, mesmo sem ele ler o 1013.
      lento.ws.resume();
      expect(await lento.fechou).toBeGreaterThan(0);
      normal.fechar();
      await robo.fechar();
    }, 60_000);

    it('fecha o painel que não responde ao ping (conexão meio aberta)', async () => {
      const mudo = await painelNode({ autoPong: false });
      const codigo = await mudo.fechou;
      expect(codigo).toBe(1006);
    });

    // Corridas para os testes do ranking: inicio_corrida, `celulas` passagens e o fim.
    let fimEnviadoEm = 0;
    async function correr(
      idRobo: string,
      {
        celulas,
        fimMs,
        resultado = 'sucesso',
        labirinto = '12x4',
      }: { celulas: number; fimMs: number; resultado?: string; labirinto?: string },
      antesDoFim?: (id: string) => Promise<void>,
    ): Promise<string> {
      const c = { corrida: idRobo };
      const robo = await Robo.conectar(url);
      robo.enviar(
        hello(),
        mensagem('inicio_corrida', 1, { ...c, labirinto, tempo_ms: 0 }),
        ...Array.from({ length: celulas }, (_, i) =>
          mensagem('celula', i + 2, { ...c, x: i, y: 0, tempo_ms: i * 100 }),
        ),
      );
      await robo.esperarAck(idRobo, celulas + 1);
      const id = await idDaCorrida(idRobo);
      await antesDoFim?.(id);
      fimEnviadoEm = Date.now();
      robo.enviar(mensagem('fim_corrida', celulas + 2, { ...c, resultado, tempo_ms: fimMs }));
      await robo.esperarAck(idRobo, celulas + 2);
      await robo.fechar();
      await corridas.esvaziar();
      return id;
    }
    const ranking = async (consultaUrl = '/api/leaderboard?labirinto=12x4') => {
      const resposta = await fetch(`${base}${consultaUrl}`);
      return (await resposta.json()) as RespostaLeaderboard;
    };

    it('ranking: corridas empatadas no tempo e na distância dividem a posição, e a seguinte pula (1, 2, 2, 4)', async () => {
      // No 8x4 e numa apresentação própria: as corridas dos outros testes não entram, e o
      // CT-BE-28 continua com o 12x4 só para ele.
      const apresentacao = (
        await consulta<{ id: string }>(
          `INSERT INTO apresentacao (nome, ativa) VALUES ('empate', false) RETURNING id`,
        )
      )[0]!.id;
      const naApresentacao = async (id: string) => {
        await pool.query(`UPDATE corrida SET apresentacao_id = $2 WHERE id = $1`, [
          id,
          apresentacao,
        ]);
      };
      const primeira = await correr(
        'emp-1',
        { celulas: 3, fimMs: 40_000, labirinto: '8x4' },
        naApresentacao,
      );
      const empate1 = await correr(
        'emp-2',
        { celulas: 3, fimMs: 50_000, labirinto: '8x4' },
        naApresentacao,
      );
      const empate2 = await correr(
        'emp-3',
        { celulas: 3, fimMs: 50_000, labirinto: '8x4' },
        naApresentacao,
      );
      const ultima = await correr(
        'emp-4',
        { celulas: 2, fimMs: 55_000, labirinto: '8x4' },
        naApresentacao,
      );

      const { itens } = await ranking(
        `/api/leaderboard?labirinto=8x4&apresentacao=${apresentacao}`,
      );
      // Empatadas: a que terminou primeiro vem antes na lista.
      expect(itens.map((i) => [i.posicao, i.id, i.tempo_conclusao_ms, i.distancia_m])).toEqual([
        [1, primeira, 40_000, 0.36],
        [2, empate1, 50_000, 0.36],
        [2, empate2, 50_000, 0.36],
        [4, ultima, 55_000, 0.18],
      ]);
    });

    it('CT-BE-28: o ranking exclui anuladas e não concluídas, desempata pela distância e é avisado depois de gravado', async () => {
      // 12x4: nenhum outro teste conclui corridas nesse labirinto.
      // A, numa apresentação: 60 s e 2 transições (0,36 m).
      const apresentacao = (
        await consulta<{ id: string }>(
          `INSERT INTO apresentacao (nome, ativa) VALUES ('CT-BE-28', false) RETURNING id`,
        )
      )[0]!.id;
      const a = await correr('rank-a', { celulas: 3, fimMs: 60_000 }, async (id) => {
        await pool.query(`UPDATE corrida SET apresentacao_id = $2 WHERE id = $1`, [
          id,
          apresentacao,
        ]);
      });
      // B: mais rápida (50 s), mas anulada. C: falhou.
      const b = await correr('rank-b', { celulas: 3, fimMs: 50_000 });
      await pool.query(
        `INSERT INTO operador (login, nome, senha_hash) VALUES ('op-teste', 'Operador', 'x') ON CONFLICT DO NOTHING`,
      );
      await pool.query(
        `INSERT INTO anulacao (corrida_id, operador_id, motivo)
         SELECT $1, id, 'toque manual' FROM operador WHERE login = 'op-teste'`,
        [b],
      );
      await correr('rank-c', { celulas: 2, fimMs: 40_000, resultado: 'falha' });

      const antes = await ranking();
      expect(antes).toEqual({
        labirinto: '12x4',
        apresentacao: null,
        itens: [
          {
            posicao: 1,
            id: a,
            corrida_robo: 'rank-a',
            numero_tentativa: null,
            tempo_conclusao_ms: 60_000,
            distancia_m: 0.36,
            velocidade_media_mps: expect.any(Number),
            encerrada_em: expect.any(String),
          },
        ],
      });

      // D: mesmos 60 s, com 1 transição (0,18 m). O aviso chega em até 1 s, e a consulta
      // feita logo ao recebê-lo já mostra D à frente de A.
      const painel = await conectarPainel();
      painel.enviar({ tipo: 'inscrever', canal: 'ao_vivo' });
      const d = correr('rank-d', { celulas: 2, fimMs: 60_000 });
      await esperar(() => painel.doTipo('leaderboard').some((m) => m.labirinto === '12x4'));
      expect(Date.now() - fimEnviadoEm).toBeLessThan(1000);
      const aoAvisar = await ranking();
      const idD = await d;
      expect(aoAvisar.itens.map((i) => [i.posicao, i.id, i.distancia_m])).toEqual([
        [1, idD, 0.18],
        [2, a, 0.36],
      ]);
      painel.fechar();

      // Só a apresentação de A.
      const daApresentacao = await ranking(
        `/api/leaderboard?labirinto=12x4&apresentacao=${apresentacao}`,
      );
      expect(daApresentacao.apresentacao).toBe(apresentacao);
      expect(daApresentacao.itens.map((i) => [i.posicao, i.id])).toEqual([[1, a]]);
    });

    it('acompanha uma corrida do anúncio ao fim, pelo WebSocket', async () => {
      const painel = await conectarPainel();
      painel.enviar({ tipo: 'inscrever', canal: 'ao_vivo' });
      // Mensagem inválida do painel é ignorada, sem derrubar a conexão.
      painel.enviar('isto não é JSON');
      painel.enviar({ tipo: 'anular', corrida: 'x' });

      const c = { corrida: 'aovivo' };
      const robo = await Robo.conectar(url);
      robo.enviar(hello(), mensagem('inicio_corrida', 1, { ...c, labirinto: '8x4' }));
      // O canal também anuncia as corridas que outros testes deixaram em andamento.
      const id = await idDaCorrida('aovivo');
      const anuncioDaCorrida = () => painel.doTipo('ao_vivo').find((m) => m.corrida === id);
      await esperar(() => anuncioDaCorrida() !== undefined);
      const anuncio = anuncioDaCorrida()!;
      expect(anuncio).toMatchObject({ labirinto: '8x4', status: 'EM_ANDAMENTO' });

      painel.enviar({ tipo: 'inscrever', corrida: anuncio.corrida });
      await esperar(() => painel.doTipo('snapshot').length > 0);
      expect(painel.doTipo('snapshot')[0]).toMatchObject({ sequencia_corte: 1, labirinto: '8x4' });

      robo.enviar(
        mensagem('celula', 2, c),
        mensagem('posicao', 3, c),
        mensagem('energia', 4, { ...c, tensao_v: 8.1 }),
        mensagem('fim_corrida', 5, { ...c, tempo_ms: 9000 }),
      );
      await esperar(() => painel.doTipo('leaderboard').length > 0);

      const eventos = painel.doTipo('evento');
      expect(eventos.map((e) => e.evento)).toEqual(['celula', 'status']);
      expect(eventos[1]).toMatchObject({ status: 'CONCLUIDA', sequencia: 5, tempo_ms: 9000 });
      expect(eventos[1]!.metricas).toMatchObject({ tempo_conclusao_ms: 8900, tensao_v: 8.1 });
      // O último contínuo pode chegar logo depois do status, para não passar de 10/s.
      await esperar(() => painel.doTipo('continuo').at(-1)?.energia !== null);
      expect(painel.doTipo('continuo').at(-1)).toMatchObject({
        posicao: { x: 0, y: 3, orientacao: 'NORTE' },
        energia: { tensao_v: 8.1 },
      });
      expect(
        painel
          .doTipo('ao_vivo')
          .filter((m) => m.corrida === id)
          .map((m) => m.status),
      ).toEqual(['EM_ANDAMENTO', 'CONCLUIDA']);

      await robo.fechar();
      painel.fechar();
      expect(await painel.fechou).toBe(1005);
    });
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
