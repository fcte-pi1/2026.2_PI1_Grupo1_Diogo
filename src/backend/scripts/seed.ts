/**
 * Seed do ambiente padrão de testes (AMB — docs/software/backend/4_casos_de_teste.md):
 * dispositivo `sim-01`, operador `op1` e apresentação "Teste" ativa. Cadastra também o
 * `sim-02`, para dois simuladores ao mesmo tempo (CT-BE-21), e o robô real (`rato-01`), com
 * o token gravado no firmware.
 * Idempotente: pode ser executado várias vezes. Usa a conexão do dono do banco (DATABASE_URL).
 */
import argon2 from 'argon2';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definida');

const PADROES_DE_DESENVOLVIMENTO = {
  SEED_DISPOSITIVO_TOKEN: 'T-VALIDO',
  SEED_OPERADOR_SENHA: 'op1-dev',
  SEED_ROBO_TOKEN: 'troque-em-build',
} as const;
type VariavelSeed = keyof typeof PADROES_DE_DESENVOLVIMENTO;

const producao = process.env.NODE_ENV === 'production';

/**
 * Em desenvolvimento, a variável ausente usa o padrão do AMB. Em produção (`seed:prod`), ela é
 * obrigatória: sem isso, o sistema subiria com credenciais públicas, sem aviso. O padrão de
 * desenvolvimento ainda é aceito em produção, com um aviso: o token do robô, por exemplo, é o
 * mesmo compilado no firmware, e trocá-lo exige gravar o firmware de novo.
 */
function credencial(nome: VariavelSeed): string {
  const valor = process.env[nome];
  if (valor === undefined || valor === '') {
    if (producao) throw new Error(`${nome} não definida: em produção, defina no .env`);
    return PADROES_DE_DESENVOLVIMENTO[nome];
  }
  if (producao && valor === PADROES_DE_DESENVOLVIMENTO[nome]) {
    console.warn(`AVISO: ${nome} usa o valor público de desenvolvimento; troque no .env`);
  }
  return valor;
}

const token = credencial('SEED_DISPOSITIVO_TOKEN');
const senha = credencial('SEED_OPERADOR_SENHA');
// O mesmo valor de TELEMETRY_TOKEN usado na compilação do firmware.
const tokenRobo = credencial('SEED_ROBO_TOKEN');

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();

try {
  await cliente.query('BEGIN');

  const dispositivo = await cliente.query(
    `INSERT INTO dispositivo (identificador, nome, token_hash)
     VALUES ('sim-01', 'Simulador de robô', $1), ('sim-02', 'Simulador de robô 2', $2)
     ON CONFLICT (identificador) DO NOTHING`,
    [await argon2.hash(token), await argon2.hash(token)],
  );

  // O token do robô é atualizado a cada execução: basta mudar SEED_ROBO_TOKEN e rodar de novo.
  await cliente.query(
    `INSERT INTO dispositivo (identificador, nome, token_hash)
     VALUES ('rato-01', 'Rato Borrachudo', $1)
     ON CONFLICT (identificador) DO UPDATE SET token_hash = EXCLUDED.token_hash`,
    [await argon2.hash(tokenRobo)],
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
