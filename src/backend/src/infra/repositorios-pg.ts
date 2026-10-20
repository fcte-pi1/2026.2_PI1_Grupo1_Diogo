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
  RepositorioProjecoes,
  VerificadorToken,
  CorridaEmAndamento,
  EncerramentoCorrida,
  MensagemGravada,
  ProgressoCorrida,
} from '../aplicacao/portas.js';
import type { Efeito, MotivoTermino, StatusCorrida, TipoLabirinto } from '../dominio/index.js';
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
    // A corrida nova entra na apresentação ativa, se houver (RF-97).
    await this.banco.query(
      `INSERT INTO corrida
         (dispositivo_id, id_corrida_robo, boot, tipo_labirinto, versao_protocolo, t_inicio_robo_ms,
          apresentacao_id)
       VALUES ($1, $2, $3, $4, $5, $6, (SELECT id FROM apresentacao WHERE ativa))
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
    const { rows } = await this.banco.query<{
      id: string;
      tipo_labirinto: TipoLabirinto | null;
      boot: string;
      status: StatusCorrida;
      motivo_termino: MotivoTermino | null;
    }>(
      `SELECT id, tipo_labirinto, boot, status, motivo_termino FROM corrida
       WHERE dispositivo_id = $1 AND id_corrida_robo = $2`,
      [dados.dispositivoId, dados.idCorridaRobo],
    );
    const linha = rows[0];
    if (!linha) throw new Error(`corrida ${dados.idCorridaRobo} não encontrada após a criação`);
    if (linha.tipo_labirinto) await this.numerarTentativa(linha.id);
    return {
      id: linha.id,
      labirinto: linha.tipo_labirinto,
      boot: linha.boot,
      status: linha.status,
      motivo: linha.motivo_termino,
    };
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
    // Sem o labirinto, a corrida não tinha como ser numerada; agora tem.
    await this.numerarTentativa(corridaId);
  }

  /**
   * Número da tentativa por (apresentação, tipo de labirinto), começando em 1 (RF-97). Toda
   * tentativa conta, inclusive as que falham ou são anuladas depois. Só numera uma corrida
   * que está numa apresentação, já tem o labirinto e ainda não tem número: chamar de novo
   * não muda nada. A linha da apresentação fica travada durante a conta, para duas corridas
   * simultâneas (dois simuladores, por exemplo) não pegarem o mesmo número.
   */
  private async numerarTentativa(corridaId: string): Promise<void> {
    const cliente = await this.banco.connect();
    try {
      await cliente.query('BEGIN');
      const { rows } = await cliente.query<{
        apresentacao_id: string | null;
        tipo_labirinto: TipoLabirinto | null;
        numero_tentativa: number | null;
      }>(`SELECT apresentacao_id, tipo_labirinto, numero_tentativa FROM corrida WHERE id = $1`, [
        corridaId,
      ]);
      const corrida = rows[0];
      if (corrida?.apresentacao_id && corrida.tipo_labirinto && corrida.numero_tentativa === null) {
        await cliente.query('SELECT 1 FROM apresentacao WHERE id = $1 FOR UPDATE', [
          corrida.apresentacao_id,
        ]);
        await cliente.query(
          `UPDATE corrida SET numero_tentativa = (
             SELECT coalesce(max(numero_tentativa), 0) + 1 FROM corrida
             WHERE apresentacao_id = $2 AND tipo_labirinto = $3)
           WHERE id = $1 AND numero_tentativa IS NULL`,
          [corridaId, corrida.apresentacao_id, corrida.tipo_labirinto],
        );
      }
      await cliente.query('COMMIT');
    } catch (erro) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw erro;
    } finally {
      cliente.release();
    }
  }

  async mensagensGravadas(corridaId: string): Promise<MensagemGravada[]> {
    const { rows } = await this.banco.query<{ seq: number; t_robo_ms: string; payload: unknown }>(
      'SELECT seq, t_robo_ms, payload FROM mensagem WHERE corrida_id = $1 ORDER BY seq',
      [corridaId],
    );
    return rows.map((linha) => ({
      sequencia: linha.seq,
      tempoMs: Number(linha.t_robo_ms),
      payload: linha.payload,
    }));
  }

  async registrarProgresso(corridaId: string, progresso: ProgressoCorrida): Promise<void> {
    // Só altera corridas que ainda não terminaram: depois de CONCLUIDA ou FALHOU, o trigger
    // de imutabilidade recusaria a alteração (RNF-54).
    await this.banco.query(
      `UPDATE corrida SET ${COLUNAS_PROGRESSO}
       WHERE id = $1 AND status NOT IN ('CONCLUIDA', 'FALHOU')`,
      [corridaId, ...valoresProgresso(progresso)],
    );
  }

  async encerrar(corridaId: string, encerramento: EncerramentoCorrida): Promise<void> {
    const { metricas } = encerramento;
    await this.banco.query(
      `UPDATE corrida SET ${COLUNAS_PROGRESSO},
         status = $12, motivo_termino = $13, detalhe_termino = $14,
         t_fim_robo_ms = $15, tempo_conclusao_ms = $16, encerrada_em = now()
       WHERE id = $1 AND status NOT IN ('CONCLUIDA', 'FALHOU')`,
      [
        corridaId,
        ...valoresProgresso(encerramento),
        encerramento.status,
        encerramento.motivo,
        encerramento.detalhe,
        encerramento.tempoFimRoboMs,
        metricas.tempoConclusaoMs,
      ],
    );
  }

  async corridasEmAndamento(): Promise<CorridaEmAndamento[]> {
    const { rows } = await this.banco.query<{
      id: string;
      dispositivo_id: string;
      id_corrida_robo: string;
      boot: string;
      versao_protocolo: number;
      ultima: Date | null;
    }>(
      `SELECT c.id, c.dispositivo_id, c.id_corrida_robo, c.boot, c.versao_protocolo,
              (SELECT max(m.recebida_em) FROM mensagem m WHERE m.corrida_id = c.id) AS ultima
       FROM corrida c WHERE c.status = 'EM_ANDAMENTO'`,
    );
    return rows.map((linha) => ({
      id: linha.id,
      dispositivoId: linha.dispositivo_id,
      idCorridaRobo: linha.id_corrida_robo,
      boot: linha.boot,
      versaoProtocolo: linha.versao_protocolo,
      ultimaMensagemEm: linha.ultima?.getTime() ?? null,
    }));
  }
}

/** Colunas atualizadas a cada gravação de progresso, de $2 a $11. */
const COLUNAS_PROGRESSO = `
  ultimo_seq_contiguo = $2, seqs_faltantes = $3, transicoes_celula = $4, revisitas = $5,
  velocidade_media_mps = $6, tensao_inicial_v = $7, tensao_final_v = $8, delta_v = $9,
  carga_inicial_pct = $10, carga_final_pct = $11`;

function valoresProgresso({ ultimaContigua, faltantes, metricas: m }: ProgressoCorrida): unknown[] {
  return [
    ultimaContigua,
    faltantes,
    m.transicoes,
    m.revisitas,
    m.velocidadeMediaMps,
    m.tensaoInicialV,
    m.tensaoFinalV,
    m.deltaV,
    m.cargaInicialPct,
    m.cargaFinalPct,
  ];
}

/** Projeções idempotentes: reaplicar a mesma mensagem não duplica nada. */
export class RepositorioProjecoesPg implements RepositorioProjecoes {
  constructor(private readonly banco: Banco) {}

  async passagem(corridaId: string, p: Extract<Efeito, { tipo: 'passagem' }>): Promise<void> {
    await this.banco.query(
      `INSERT INTO passagem_celula (corrida_id, seq, ordem, x, y, paredes, t_robo_ms, revisita)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
      [corridaId, p.sequencia, p.ordem, p.x, p.y, p.paredes, p.tempoMs, p.revisita],
    );
  }

  async leituraEnergia(
    corridaId: string,
    l: Extract<Efeito, { tipo: 'leitura_energia' }>,
  ): Promise<void> {
    await this.banco.query(
      `INSERT INTO leitura_energia (corrida_id, seq, t_robo_ms, tensao_v, corrente_a, potencia_w)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [corridaId, l.sequencia, l.tempoMs, l.tensaoV, l.correnteA, l.potenciaW],
    );
  }

  async snapshot(corridaId: string, s: Extract<Efeito, { tipo: 'snapshot' }>): Promise<void> {
    await this.banco.query(
      `INSERT INTO snapshot_mapa (corrida_id, seq_corte, celulas_visitadas, estado)
       VALUES ($1, $2, $3, $4) ON CONFLICT (corrida_id, seq_corte) DO NOTHING`,
      [
        corridaId,
        s.sequenciaCorte,
        s.celulasVisitadas,
        JSON.stringify({ mapa: s.mapa, metricas: s.metricas }),
      ],
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
