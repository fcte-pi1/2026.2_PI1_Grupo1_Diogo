/**
 * ServicoLinhaDoTempo — todas as mensagens aceitas de uma corrida, em ordem de sequência,
 * para o replay no painel (RF-94) e para a exportação (RF-98).
 *
 * As mensagens saem em lotes, à medida que são lidas do banco: a memória usada não depende
 * do tamanho da corrida, e o event loop não fica preso montando uma resposta grande
 * (RNF-49, HU-BE-23 CA3).
 */
import type { ItemLinhaDoTempo } from '../../protocolo/tipos.js';
import type { RepositorioLinhaDoTempo } from './portas.js';

/** Mensagens lidas do banco por vez. */
export const TAMANHO_LOTE_LINHA_DO_TEMPO = 500;

export class ServicoLinhaDoTempo {
  constructor(
    private readonly mensagens: RepositorioLinhaDoTempo,
    private readonly tamanhoLote = TAMANHO_LOTE_LINHA_DO_TEMPO,
  ) {}

  /** `null` se a corrida não existe; senão, as mensagens em ordem estritamente crescente de `seq`. */
  async linhaDoTempo(corridaId: string): Promise<AsyncIterable<ItemLinhaDoTempo> | null> {
    if (!(await this.mensagens.corridaExiste(corridaId))) return null;
    return this.lotes(corridaId);
  }

  private async *lotes(corridaId: string): AsyncGenerator<ItemLinhaDoTempo> {
    let depoisDe = 0;
    for (;;) {
      const lote = await this.mensagens.mensagensDepoisDe(corridaId, depoisDe, this.tamanhoLote);
      yield* lote;
      if (lote.length < this.tamanhoLote) return;
      depoisDe = lote.at(-1)!.sequencia;
    }
  }
}
