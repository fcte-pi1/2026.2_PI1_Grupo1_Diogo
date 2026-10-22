/**
 * `npm run seed:historico`: 200 corridas nos 3 dias anteriores ao de hoje, com tipos e
 * status variados, para o CT-BE-26 e para desenvolver a tela de histórico sem o robô (#328).
 * Precisa do `npm run seed` antes (dispositivo `sim-01`). Idempotente: as datas ficam as da
 * primeira execução. Usa a conexão do dono do banco (DATABASE_URL), como o seed.
 */
import pg from 'pg';
import { gerarHistorico } from './historico.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definida');

// Os três dias anteriores: as corridas vão até 23h (UTC), e as de hoje ficariam no futuro.
const hoje = new Date();
const dias = [3, 2, 1].map((atras) =>
  new Date(hoje.getTime() - atras * 86_400_000).toISOString().slice(0, 10),
);

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();
try {
  const dispositivo = await cliente.query<{ id: string }>(
    `SELECT id FROM dispositivo WHERE identificador = 'sim-01'`,
  );
  if (dispositivo.rowCount === 0) {
    throw new Error("dispositivo 'sim-01' não encontrado: rode `npm run seed` antes");
  }
  await cliente.query('BEGIN');
  const criadas = await gerarHistorico(cliente, {
    dispositivoId: dispositivo.rows[0]!.id,
    dias,
    prefixo: 'historico',
  });
  await cliente.query('COMMIT');
  console.log(
    `seed:historico concluído — ${criadas} corridas criadas em ${dias.join(', ')} (0 = já existiam)`,
  );
} catch (erro) {
  await cliente.query('ROLLBACK').catch(() => undefined);
  throw erro;
} finally {
  await cliente.end();
}
