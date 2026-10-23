/**
 * ServicoConsulta — consultas da API HTTP (RF-93 a RF-95). Só leitura: nada aqui altera
 * uma corrida.
 */
import type {
  DetalheCorrida,
  FiltrosListaCorridas,
  RespostaLeaderboard,
  RespostaListaCorridas,
  TipoLabirinto,
} from '../../protocolo/tipos.js';
import type { FiltrosListagem, RepositorioConsulta } from './portas.js';

/** Tamanho de página padrão e máximo da listagem (HU-BE-22, CA2). */
export const TAMANHO_PAGINA_PADRAO = 20;
export const TAMANHO_PAGINA_MAXIMO = 100;

/** Um filtro da listagem com valor inválido (data que não é ISO 8601, `de` depois de `ate`). */
export class FiltroInvalido extends Error {}

const DIA = 24 * 60 * 60 * 1000;
const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const DATA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** O `Date` do JavaScript aceita 30/02 e o transforma em 02/03: aqui o dia tem de existir. */
function diaExiste(aaaaMmDd: string): boolean {
  const [ano, mes, dia] = aaaaMmDd.split('-').map(Number) as [number, number, number];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
  );
}

/**
 * Converte `de`/`ate` em instantes. Data e hora (com fuso) valem como vieram; só a data vale
 * o dia inteiro em UTC, então `ate=2026-10-14` inclui as corridas de todo o dia 14.
 */
function instante(valor: string, campo: 'de' | 'ate'): { inicio: Date; fimExclusivo: Date } {
  const soData = SO_DATA.test(valor);
  const data =
    soData || DATA_HORA.test(valor) ? new Date(soData ? `${valor}T00:00:00Z` : valor) : null;
  if (!data || Number.isNaN(data.getTime()) || !diaExiste(valor.slice(0, 10))) {
    throw new FiltroInvalido(
      `${campo} inválido: use ISO 8601 (2026-10-14 ou 2026-10-14T18:00:00Z)`,
    );
  }
  const fim = soData ? data.getTime() + DIA : data.getTime() + 1;
  return { inicio: data, fimExclusivo: new Date(fim) };
}

export class ServicoConsulta {
  constructor(private readonly consulta: RepositorioConsulta) {}

  /**
   * Detalhe da corrida: métricas, trajeto e série de energia (RF-84, RF-85). Também serve
   * a uma corrida em andamento, para o painel completar o snapshot ao reconectar.
   */
  detalheCorrida(corridaId: string): Promise<DetalheCorrida | null> {
    return this.consulta.detalheCorrida(corridaId);
  }

  /**
   * Ranking de um tipo de labirinto: só corridas CONCLUIDA e não anuladas, por tempo de
   * conclusão e, no empate, pela menor distância (RF-95).
   */
  async leaderboard(
    labirinto: TipoLabirinto,
    apresentacaoId: string | null = null,
  ): Promise<RespostaLeaderboard> {
    const itens = await this.consulta.leaderboard(labirinto, apresentacaoId);
    return { labirinto, apresentacao: apresentacaoId, itens };
  }

  /**
   * Histórico de corridas, da mais recente para a mais antiga, com filtros combináveis e
   * paginação (RF-93, HU-BE-22). Um tamanho acima do máximo é limitado, sem erro.
   */
  async listarCorridas(entrada: FiltrosListaCorridas = {}): Promise<RespostaListaCorridas> {
    const pagina = entrada.pagina ?? 1;
    const tamanho = Math.min(entrada.tamanho ?? TAMANHO_PAGINA_PADRAO, TAMANHO_PAGINA_MAXIMO);
    const de = entrada.de !== undefined ? instante(entrada.de, 'de').inicio : null;
    const antesDe = entrada.ate !== undefined ? instante(entrada.ate, 'ate').fimExclusivo : null;
    if (de && antesDe && de >= antesDe) {
      throw new FiltroInvalido('de deve ser anterior a ate');
    }
    const filtros: FiltrosListagem = {
      tipo: entrada.tipo ?? null,
      status: entrada.status ?? null,
      de,
      antesDe,
      limite: tamanho,
      deslocamento: (pagina - 1) * tamanho,
    };
    const { itens, total } = await this.consulta.listarCorridas(filtros);
    return { itens, total, pagina, tamanho };
  }
}
