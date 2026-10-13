/**
 * Implementações PostgreSQL das portas da ingestão. SQL explícito, sem ORM
 * (arquitetura do backend, §2.3).
 */
import argon2 from 'argon2';
import type {
  CorridaPersistida,
  DadosNovaCorrida,
  Dispositivo,
  MensagemParaGravar,
  RegistroAuditoria,
  Rejeicao,
  RepositorioCorridas,
  RepositorioDispositivos,
  SequenciaGravada,
  VerificadorToken,
} from '../aplicacao/portas.js';
import type { TipoLabirinto } from '../dominio/index.js';
import type { Banco } from './banco.js';
import type { InserirLote } from './gravador-lote.js';

export class RepositorioDispositivosPg implements RepositorioDispositivos {
  constructor(private readonly banco: Banco) {}

  async buscarPorIdentificador(identificador: string): Promise<Dispositivo | null> {
    const { rows } = await this.banco.query<{
      id: string;
      identificador: string;
      token_hash: string;
      ativo: boolean;
    }>('SELECT id, identificador, token_hash, ativo FROM dispositivo WHERE identificador = $1', [
      identificador,
    ]);
    const linha = rows[0];
    if (!linha) return null;
    return {
      id: linha.id,
      identificador: linha.identificador,
      tokenHash: linha.token_hash,
      ativo: linha.ativo,
    };
  }
}

export class VerificadorTokenArgon2 implements VerificadorToken {
  async confere(token: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, token);
    } catch {
      // Hash em formato inválido no cadastro: trata como não autorizado.
      return false;
    }
  }
}

export class RepositorioCorridasPg implements RepositorioCorridas {
  constructor(private readonly banco: Banco) {}

  async obterOuCriar(dados: DadosNovaCorrida): Promise<CorridaPersistida> {
    // A restrição única (dispositivo, id do robô) garante uma só corrida mesmo com
    // mensagens concorrentes (RF-78). Se já existir, o SELECT a devolve.
    await this.banco.query(
      `INSERT INTO corrida
         (dispositivo_id, id_corrida_robo, boot, tipo_labirinto, versao_protocolo, t_inicio_robo_ms)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (dispositivo_id, id_corrida_robo) DO NOTHING`,
      [
        dados.dispositivoId,
        dados.idCorridaRobo,
        dados.boot,
        dados.labirinto,
        dados.versaoProtocolo,
        dados.tempoInicioRoboMs,
      ],
    );
    const { rows } = await this.banco.query<{ id: string; tipo_labirinto: TipoLabirinto | null }>(
      'SELECT id, tipo_labirinto FROM corrida WHERE dispositivo_id = $1 AND id_corrida_robo = $2',
      [dados.dispositivoId, dados.idCorridaRobo],
    );
    const linha = rows[0];
    if (!linha) throw new Error(`corrida ${dados.idCorridaRobo} não encontrada após a criação`);
    return { id: linha.id, labirinto: linha.tipo_labirinto };
  }

  async definirInicio(
    corridaId: string,
    labirinto: TipoLabirinto,
    tempoInicioRoboMs: number,
  ): Promise<void> {
    await this.banco.query(
      `UPDATE corrida SET tipo_labirinto = $2, t_inicio_robo_ms = $3
       WHERE id = $1 AND tipo_labirinto IS NULL`,
      [corridaId, labirinto, tempoInicioRoboMs],
    );
  }

  async sequenciasGravadas(corridaId: string): Promise<SequenciaGravada[]> {
    const { rows } = await this.banco.query<{ seq: number; t_robo_ms: string }>(
      'SELECT seq, t_robo_ms FROM mensagem WHERE corrida_id = $1 ORDER BY seq',
      [corridaId],
    );
    return rows.map((linha) => ({ sequencia: linha.seq, tempoMs: Number(linha.t_robo_ms) }));
  }

  async registrarProgresso(
    corridaId: string,
    ultimaContigua: number,
    faltantes: number,
  ): Promise<void> {
    await this.banco.query(
      `UPDATE corrida SET ultimo_seq_contiguo = $2, seqs_faltantes = $3
       WHERE id = $1 AND (ultimo_seq_contiguo, seqs_faltantes) IS DISTINCT FROM ($2, $3)`,
      [corridaId, ultimaContigua, faltantes],
    );
  }
}

/**
 * Gravação append-only e idempotente de um lote (RF-77, RF-79): um único INSERT,
 * atômico, em que as mensagens já existentes são ignoradas pela chave (corrida_id, seq).
 */
export function criarInserirLote(banco: Banco): InserirLote {
  return async (lote: readonly MensagemParaGravar[]) => {
    const { rows } = await banco.query<{ corrida_id: string; seq: number }>(
      `INSERT INTO mensagem (corrida_id, seq, tipo, t_robo_ms, versao_protocolo, payload)
       SELECT * FROM unnest($1::uuid[], $2::int[], $3::tipo_mensagem[], $4::bigint[], $5::smallint[], $6::jsonb[])
       ON CONFLICT (corrida_id, seq) DO NOTHING
       RETURNING corrida_id, seq`,
      [
        lote.map((m) => m.corridaId),
        lote.map((m) => m.sequencia),
        lote.map((m) => m.tipo),
        lote.map((m) => m.tempoRoboMs),
        lote.map((m) => m.versaoProtocolo),
        lote.map((m) => JSON.stringify(m.payload)),
      ],
    );
    const inseridas = new Set(rows.map((linha) => `${linha.corrida_id}:${linha.seq}`));
    // Se a mesma mensagem aparecer duas vezes no lote, só a primeira conta como inserida.
    return lote.map((m) => inseridas.delete(`${m.corridaId}:${m.sequencia}`));
  };
}

export class RegistroAuditoriaPg implements RegistroAuditoria {
  constructor(private readonly banco: Banco) {}

  async eventoConexao(evento: {
    dispositivoId: string;
    corridaId: string | null;
    tipo: string;
    boot: string;
  }): Promise<void> {
    await this.banco.query(
      'INSERT INTO evento_conexao (dispositivo_id, corrida_id, tipo, boot) VALUES ($1, $2, $3, $4)',
      [evento.dispositivoId, evento.corridaId, evento.tipo, evento.boot],
    );
  }

  async rejeicao(rejeicao: Rejeicao): Promise<void> {
    await this.banco.query(
      `INSERT INTO mensagem_rejeitada (dispositivo_id, corrida_robo, seq, motivo_codigo, detalhe, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        rejeicao.dispositivoId,
        rejeicao.corridaRobo,
        rejeicao.sequencia,
        rejeicao.motivoCodigo,
        rejeicao.detalhe.slice(0, 1000),
        JSON.stringify(rejeicao.payload ?? null),
      ],
    );
  }
}
