/**
 * Consultas da API HTTP em PostgreSQL. As chaves da resposta seguem o contrato publicado
 * em `protocolo/tipos.ts` (arquivo `protocolo/v1/API.md`).
 */
import type { RepositorioConsulta } from '../aplicacao/portas.js';
import { paredesDeBits, type MotivoTermino, type StatusCorrida } from '../dominio/index.js';
import type { DetalheCorrida, PosicaoLeaderboard, TipoLabirinto } from '../../protocolo/tipos.js';
import type { Banco } from './banco.js';

interface LinhaCorrida {
  id: string;
  id_corrida_robo: string;
  iniciada_em: Date;
  encerrada_em: Date | null;
  tipo_labirinto: TipoLabirinto | null;
  numero_tentativa: number | null;
  status: StatusCorrida;
  motivo_termino: MotivoTermino | null;
  detalhe_termino: string | null;
  tempo_conclusao_ms: number | null;
  t_inicio_robo_ms: string | null;
  t_fim_robo_ms: string | null;
  t_ultima_ms: string | null;
  transicoes_celula: number;
  distancia_m: string;
  revisitas: number;
  velocidade_media_mps: string | null;
  tensao_inicial_v: string | null;
  tensao_final_v: string | null;
  delta_v: string | null;
  carga_inicial_pct: string | null;
  carga_final_pct: string | null;
  ultimo_seq_contiguo: number;
  seqs_faltantes: number;
  anulacao_motivo: string | null;
  anulada_em: Date | null;
  anulada_por: string | null;
}

export class RepositorioConsultaPg implements RepositorioConsulta {
  constructor(private readonly banco: Banco) {}

  async detalheCorrida(corridaId: string): Promise<DetalheCorrida | null> {
    const { rows } = await this.banco.query<LinhaCorrida>(
      `SELECT c.*, a.motivo AS anulacao_motivo, a.anulada_em, o.login AS anulada_por,
              (SELECT max(m.t_robo_ms) FROM mensagem m WHERE m.corrida_id = c.id) AS t_ultima_ms
       FROM corrida c
       LEFT JOIN anulacao a ON a.corrida_id = c.id
       LEFT JOIN operador o ON o.id = a.operador_id
       WHERE c.id = $1`,
      [corridaId],
    );
    const c = rows[0];
    if (!c) return null;

    const [passagens, leituras] = await Promise.all([
      this.banco.query<{
        seq: number;
        x: number;
        y: number;
        paredes: number;
        t_robo_ms: string;
        revisita: boolean;
      }>(
        `SELECT seq, x, y, paredes, t_robo_ms, revisita
         FROM passagem_celula WHERE corrida_id = $1 ORDER BY seq`,
        [corridaId],
      ),
      this.banco.query<{
        seq: number;
        t_robo_ms: string;
        tensao_v: string;
        corrente_a: string;
        potencia_w: string;
      }>(
        `SELECT seq, t_robo_ms, tensao_v, corrente_a, potencia_w
         FROM leitura_energia WHERE corrida_id = $1 ORDER BY seq`,
        [corridaId],
      ),
    ]);

    // Encerrada: até o fim. Em andamento: até a última mensagem gravada.
    const inicio = numeroOuNulo(c.t_inicio_robo_ms);
    const ate = numeroOuNulo(c.t_fim_robo_ms) ?? numeroOuNulo(c.t_ultima_ms);

    return {
      id: c.id,
      corrida_robo: c.id_corrida_robo,
      iniciada_em: c.iniciada_em.toISOString(),
      encerrada_em: c.encerrada_em?.toISOString() ?? null,
      tipo_labirinto: c.tipo_labirinto,
      numero_tentativa: c.numero_tentativa,
      status: c.status,
      motivo_termino: c.motivo_termino,
      detalhe_termino: c.detalhe_termino,
      tempo_conclusao_ms: c.tempo_conclusao_ms,
      anulada: c.anulada_em !== null,
      ultima_sequencia_contigua: c.ultimo_seq_contiguo,
      sequencias_faltantes: c.seqs_faltantes,
      metricas: {
        tempo_decorrido_ms: inicio !== null && ate !== null ? ate - inicio : null,
        tempo_conclusao_ms: c.tempo_conclusao_ms,
        celulas_percorridas: c.transicoes_celula,
        distancia_m: Number(c.distancia_m),
        revisitas: c.revisitas,
        velocidade_media_mps: numeroOuNulo(c.velocidade_media_mps),
        tensao_inicial_v: numeroOuNulo(c.tensao_inicial_v),
        tensao_final_v: numeroOuNulo(c.tensao_final_v),
        delta_v: numeroOuNulo(c.delta_v),
        carga_inicial_pct: numeroOuNulo(c.carga_inicial_pct),
        carga_final_pct: numeroOuNulo(c.carga_final_pct),
      },
      // A ordem sai da posição em `seq`, e não da coluna `ordem`: depois de uma lacuna
      // preenchida tarde e de um reinício, a coluna pode repetir valores (ver #356).
      trajeto: passagens.rows.map((p, i) => ({
        sequencia: p.seq,
        ordem: i + 1,
        x: p.x,
        y: p.y,
        paredes: paredesDeBits(p.paredes),
        tempo_ms: Number(p.t_robo_ms),
        revisita: p.revisita,
      })),
      energia: leituras.rows.map((l) => ({
        sequencia: l.seq,
        tempo_ms: Number(l.t_robo_ms),
        tensao_v: Number(l.tensao_v),
        corrente_a: Number(l.corrente_a),
        potencia_w: Number(l.potencia_w),
      })),
      anulacao:
        c.anulada_em !== null
          ? {
              motivo: c.anulacao_motivo ?? '',
              anulada_em: c.anulada_em.toISOString(),
              operador: c.anulada_por ?? '',
            }
          : null,
    };
  }

  async leaderboard(
    labirinto: TipoLabirinto,
    apresentacaoId: string | null,
  ): Promise<PosicaoLeaderboard[]> {
    // A view já exclui as não concluídas e as anuladas. A posição é recalculada aqui porque
    // a da view é do labirinto inteiro, e com o filtro de apresentação ela teria buracos.
    const { rows } = await this.banco.query<{
      posicao: string;
      id: string;
      corrida_robo: string;
      numero_tentativa: number | null;
      tempo_conclusao_ms: number;
      distancia_m: string;
      velocidade_media_mps: string | null;
      encerrada_em: Date;
    }>(
      `SELECT RANK() OVER (ORDER BY l.tempo_conclusao_ms, l.distancia_m) AS posicao,
              l.corrida_id AS id, c.id_corrida_robo AS corrida_robo, l.numero_tentativa,
              l.tempo_conclusao_ms, l.distancia_m, l.velocidade_media_mps, l.encerrada_em
       FROM vw_leaderboard l
       JOIN corrida c ON c.id = l.corrida_id
       WHERE l.tipo_labirinto = $1 AND ($2::uuid IS NULL OR l.apresentacao_id = $2)
       ORDER BY posicao, l.encerrada_em, l.corrida_id`,
      [labirinto, apresentacaoId],
    );
    return rows.map((r) => ({
      posicao: Number(r.posicao),
      id: r.id,
      corrida_robo: r.corrida_robo,
      numero_tentativa: r.numero_tentativa,
      tempo_conclusao_ms: r.tempo_conclusao_ms,
      distancia_m: Number(r.distancia_m),
      velocidade_media_mps: numeroOuNulo(r.velocidade_media_mps),
      encerrada_em: r.encerrada_em.toISOString(),
    }));
  }
}

/** O `pg` devolve `numeric` e `bigint` como texto, para não perder precisão. */
function numeroOuNulo(valor: string | null): number | null {
  return valor === null ? null : Number(valor);
}
