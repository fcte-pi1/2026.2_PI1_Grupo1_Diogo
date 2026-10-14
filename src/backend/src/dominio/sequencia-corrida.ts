/**
 * Controle das sequências de uma corrida: idempotência (RF-77), confirmação cumulativa
 * (RF-74), lacunas (RNF-50) e ordem do tempo do robô (RF-76).
 *
 * Uma sequência passa por dois momentos:
 *  - `aceitar`: a mensagem passou nas validações e foi para a fila de gravação;
 *  - `confirmar`: a gravação no banco foi concluída. Só então ela conta para o `ack`.
 */
export class SequenciaCorrida {
  /** Tempo do robô de cada sequência conhecida (aceita ou confirmada). */
  private readonly tempos = new Map<number, number>();
  /** Sequências conhecidas em ordem crescente, para achar as vizinhas. */
  private readonly ordenadas: number[] = [];
  private readonly confirmadas = new Set<number>();
  private contigua = 0;
  private maiorConfirmada = 0;

  /** A sequência já foi aceita ou gravada: a mensagem é uma duplicata. */
  conhece(sequencia: number): boolean {
    return this.tempos.has(sequencia);
  }

  /** A gravação da sequência já foi confirmada pelo banco. */
  gravada(sequencia: number): boolean {
    return this.confirmadas.has(sequencia);
  }

  /**
   * O tempo do robô não pode andar para trás em relação às sequências vizinhas já
   * conhecidas. A comparação é pelas vizinhas, e não pela última mensagem recebida,
   * porque um reenvio legítimo entrega sequências antigas depois das novas.
   */
  tempoCoerente(sequencia: number, tempoMs: number): boolean {
    const posicao = this.posicaoDeInsercao(sequencia);
    const anterior = this.ordenadas[posicao - 1];
    const proxima = this.ordenadas[posicao];
    if (anterior !== undefined && this.tempos.get(anterior)! > tempoMs) return false;
    if (proxima !== undefined && this.tempos.get(proxima)! < tempoMs) return false;
    return true;
  }

  aceitar(sequencia: number, tempoMs: number): void {
    if (this.tempos.has(sequencia)) return;
    this.tempos.set(sequencia, tempoMs);
    this.ordenadas.splice(this.posicaoDeInsercao(sequencia), 0, sequencia);
  }

  /** A gravação falhou: a sequência volta a ser desconhecida e pode ser reenviada. */
  descartar(sequencia: number): void {
    if (this.confirmadas.has(sequencia) || !this.tempos.has(sequencia)) return;
    this.tempos.delete(sequencia);
    this.ordenadas.splice(this.posicaoDeInsercao(sequencia), 1);
  }

  confirmar(sequencia: number): void {
    if (!this.tempos.has(sequencia)) return;
    this.confirmadas.add(sequencia);
    if (sequencia > this.maiorConfirmada) this.maiorConfirmada = sequencia;
    while (this.confirmadas.has(this.contigua + 1)) this.contigua++;
  }

  /** Maior sequência gravada sem nenhuma lacuna antes dela: é o valor do `ack`. */
  get ultimaContigua(): number {
    return this.contigua;
  }

  /** Quantidade de sequências que faltam abaixo da maior já gravada. */
  get faltantes(): number {
    return this.maiorConfirmada - this.confirmadas.size;
  }

  /** Índice da primeira sequência conhecida que é maior ou igual à informada. */
  private posicaoDeInsercao(sequencia: number): number {
    let inicio = 0;
    let fim = this.ordenadas.length;
    while (inicio < fim) {
      const meio = (inicio + fim) >>> 1;
      if (this.ordenadas[meio]! < sequencia) inicio = meio + 1;
      else fim = meio;
    }
    return inicio;
  }
}
