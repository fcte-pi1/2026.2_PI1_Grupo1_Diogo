/**
 * Verifica a migração inicial contra um PostgreSQL 16 real (Testcontainers).
 * Executar no host ou no CI: `npm run test:integracao` (requer Docker).
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { runner } from 'node-pg-migrate';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('migração inicial', () => {
  let container: StartedPostgreSqlContainer;
  let banco: pg.Client;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    await runner({
      databaseUrl: container.getConnectionUri(),
      dir: 'migracoes',
      direction: 'up',
      migrationsTable: 'pgmigrations',
      log: () => {},
    });
    banco = new pg.Client({ connectionString: container.getConnectionUri() });
    await banco.connect();
  });

  afterAll(async () => {
    await banco?.end();
    await container?.stop();
  });

  async function criarCorrida(): Promise<string> {
    const { rows } = await banco.query<{ id: string }>(
      `WITH d AS (
         INSERT INTO dispositivo (identificador, nome, token_hash)
         VALUES ('d-' || gen_random_uuid(), 'teste', 'x') RETURNING id)
       INSERT INTO corrida (dispositivo_id, id_corrida_robo, boot, tipo_labirinto, versao_protocolo)
       SELECT id, 'c1', 'b1', '4x4', 1 FROM d RETURNING id`,
    );
    return rows[0]!.id;
  }

  it('cria as 11 tabelas do DER', async () => {
    const { rows } = await banco.query(
      `SELECT count(*)::int AS total FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'pgmigrations'`,
    );
    expect(rows[0].total).toBe(11);
  });

  it('é idempotente por (corrida, seq) e impede alterar mensagens (append-only)', async () => {
    const corrida = await criarCorrida();
    const inserir = `INSERT INTO mensagem (corrida_id, seq, tipo, t_robo_ms, versao_protocolo, payload)
                     VALUES ($1, 1, 'inicio_corrida', 0, 1, '{}') ON CONFLICT DO NOTHING`;

    expect((await banco.query(inserir, [corrida])).rowCount).toBe(1);
    expect((await banco.query(inserir, [corrida])).rowCount).toBe(0);
    await expect(banco.query('UPDATE mensagem SET t_robo_ms = 1')).rejects.toThrow(/append-only/);
    await expect(banco.query('DELETE FROM mensagem')).rejects.toThrow(/append-only/);
  });

  it('impede alterar corrida finalizada', async () => {
    const corrida = await criarCorrida();
    await banco.query(`UPDATE corrida SET status = 'CONCLUIDA' WHERE id = $1`, [corrida]);
    await expect(
      banco.query(`UPDATE corrida SET status = 'FALHOU' WHERE id = $1`, [corrida]),
    ).rejects.toThrow(/não pode ser alterada/);
  });

  it('calcula a distância a partir das transições de célula', async () => {
    const corrida = await criarCorrida();
    const { rows } = await banco.query(
      `UPDATE corrida SET transicoes_celula = 10 WHERE id = $1 RETURNING distancia_m`,
      [corrida],
    );
    expect(Number(rows[0].distancia_m)).toBeCloseTo(1.8);
  });
});
