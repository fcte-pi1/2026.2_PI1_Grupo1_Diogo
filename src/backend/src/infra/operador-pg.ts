/**
 * Repositórios das ações do operador (RF-96, RF-97, RNF-55) em PostgreSQL. O papel da
 * aplicação só lê `operador`, só insere em `anulacao` e altera `apresentacao` (§7.3).
 */
import type {
  Operador,
  RepositorioAnulacao,
  RepositorioApresentacoes,
  RepositorioOperadores,
  SituacaoCorrida,
} from '../aplicacao/portas.js';
import type { StatusCorrida } from '../dominio/index.js';
import type { AnulacaoCorrida, Apresentacao, TipoLabirinto } from '../../protocolo/tipos.js';
import type { Banco } from './banco.js';

/** Violação de restrição única no PostgreSQL. */
const VIOLACAO_UNICA = '23505';

export class RepositorioOperadoresPg implements RepositorioOperadores {
  constructor(private readonly banco: Banco) {}

  async buscarPorLogin(login: string): Promise<Operador | null> {
    const { rows } = await this.banco.query<{
      id: string;
      login: string;
      nome: string;
      senha_hash: string;
    }>('SELECT id, login, nome, senha_hash FROM operador WHERE login = $1', [login]);
    const o = rows[0];
    return o ? { id: o.id, login: o.login, nome: o.nome, senhaHash: o.senha_hash } : null;
  }
}

export class RepositorioAnulacaoPg implements RepositorioAnulacao {
  constructor(private readonly banco: Banco) {}

  async situacao(corridaId: string): Promise<SituacaoCorrida | null> {
    const { rows } = await this.banco.query<{
      status: StatusCorrida;
      tipo_labirinto: TipoLabirinto | null;
      anulada: boolean;
    }>(
      `SELECT c.status, c.tipo_labirinto, a.corrida_id IS NOT NULL AS anulada
       FROM corrida c LEFT JOIN anulacao a ON a.corrida_id = c.id
       WHERE c.id = $1`,
      [corridaId],
    );
    const c = rows[0];
    return c ? { status: c.status, labirinto: c.tipo_labirinto, anulada: c.anulada } : null;
  }

  async anular(
    corridaId: string,
    operadorId: string,
    motivo: string,
  ): Promise<AnulacaoCorrida | null> {
    try {
      // A chave primária de `anulacao` é a corrida: uma segunda anulação, mesmo
      // simultânea, falha aqui.
      const { rows } = await this.banco.query<{ anulada_em: Date; operador: string }>(
        `WITH nova AS (
           INSERT INTO anulacao (corrida_id, operador_id, motivo) VALUES ($1, $2, $3)
           RETURNING anulada_em, operador_id
         )
         SELECT nova.anulada_em, o.login AS operador FROM nova JOIN operador o ON o.id = nova.operador_id`,
        [corridaId, operadorId, motivo],
      );
      const r = rows[0]!;
      return { motivo, anulada_em: r.anulada_em.toISOString(), operador: r.operador };
    } catch (erro) {
      if ((erro as { code?: string }).code === VIOLACAO_UNICA) return null;
      throw erro;
    }
  }
}

interface LinhaApresentacao {
  id: string;
  nome: string;
  data: string;
  ativa: boolean;
  criada_em: Date;
}

const COLUNAS_APRESENTACAO = `id, nome, to_char(data, 'YYYY-MM-DD') AS data, ativa, criada_em`;

function apresentacao(l: LinhaApresentacao): Apresentacao {
  return {
    id: l.id,
    nome: l.nome,
    data: l.data,
    ativa: l.ativa,
    criada_em: l.criada_em.toISOString(),
  };
}

export class RepositorioApresentacoesPg implements RepositorioApresentacoes {
  constructor(private readonly banco: Banco) {}

  async listar(): Promise<Apresentacao[]> {
    const { rows } = await this.banco.query<LinhaApresentacao>(
      `SELECT ${COLUNAS_APRESENTACAO} FROM apresentacao ORDER BY criada_em DESC`,
    );
    return rows.map(apresentacao);
  }

  async abrir(nome: string): Promise<Apresentacao> {
    // Só uma ativa por vez (índice único parcial): encerra a atual e abre a nova juntas.
    const cliente = await this.banco.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query('UPDATE apresentacao SET ativa = false WHERE ativa');
      const { rows } = await cliente.query<LinhaApresentacao>(
        `INSERT INTO apresentacao (nome, ativa) VALUES ($1, true) RETURNING ${COLUNAS_APRESENTACAO}`,
        [nome],
      );
      await cliente.query('COMMIT');
      return apresentacao(rows[0]!);
    } catch (erro) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw erro;
    } finally {
      cliente.release();
    }
  }

  async encerrar(id: string): Promise<Apresentacao | null> {
    const { rows } = await this.banco.query<LinhaApresentacao>(
      `UPDATE apresentacao SET ativa = false WHERE id = $1 RETURNING ${COLUNAS_APRESENTACAO}`,
      [id],
    );
    return rows[0] ? apresentacao(rows[0]) : null;
  }
}
