import pg from 'pg';

export type Banco = pg.Pool;

export function criarBanco(url: string): Banco {
  return new pg.Pool({ connectionString: url, max: 10 });
}

export async function verificarBanco(banco: Banco): Promise<boolean> {
  try {
    await banco.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
