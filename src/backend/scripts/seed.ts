/**
 * Seed do ambiente padrão de testes (AMB — docs/software/backend/4_casos_de_teste.md):
 * dispositivo `sim-01`, operador `op1` e apresentação "Teste" ativa.
 * Idempotente: pode ser executado várias vezes. Usa a conexão do dono do banco (DATABASE_URL).
 */
import argon2 from 'argon2';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definida');

const token = process.env.SEED_DISPOSITIVO_TOKEN ?? 'T-VALIDO';
const senha = process.env.SEED_OPERADOR_SENHA ?? 'op1-dev';

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();

try {
  await cliente.query('BEGIN');

  const dispositivo = await cliente.query(
    `INSERT INTO dispositivo (identificador, nome, token_hash)
     VALUES ('sim-01', 'Simulador de robô', $1)
     ON CONFLICT (identificador) DO NOTHING`,
    [await argon2.hash(token)],
  );

  const operador = await cliente.query(
    `INSERT INTO operador (login, nome, senha_hash)
     VALUES ('op1', 'Operador 1', $1)
     ON CONFLICT (login) DO NOTHING`,
    [await argon2.hash(senha)],
  );

  // Só cria a apresentação "Teste" se não houver nenhuma ativa (no máximo uma ativa).
  const apresentacao = await cliente.query(
    `INSERT INTO apresentacao (nome, ativa)
     SELECT 'Teste', true
     WHERE NOT EXISTS (SELECT 1 FROM apresentacao WHERE ativa)`,
  );

  await cliente.query('COMMIT');
  console.log(
    `seed concluído — dispositivo: ${dispositivo.rowCount}, operador: ${operador.rowCount}, ` +
      `apresentação: ${apresentacao.rowCount} (0 = já existia)`,
  );
} catch (erro) {
  await cliente.query('ROLLBACK');
  throw erro;
} finally {
  await cliente.end();
}
