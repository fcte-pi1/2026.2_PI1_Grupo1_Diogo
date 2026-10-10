/**
 * Transforma os bytes recebidos da porta serial em linhas completas.
 * O robô envia uma mensagem JSON por linha, terminada em `\n` (um `\r` antes é tolerado).
 * Linhas maiores que o limite são descartadas inteiras: isso evita que lixo na serial,
 * sem quebra de linha, consuma memória sem fim.
 */
export const TAMANHO_MAXIMO_LINHA = 1024;

export class SeparadorLinhas {
  private pendente = '';
  private descartando = false;
  private readonly decodificador = new TextDecoder('utf-8');
  /** Quantidade de linhas descartadas por excederem o limite. */
  linhasDescartadas = 0;

  constructor(private readonly limite: number = TAMANHO_MAXIMO_LINHA) {}

  /** Recebe um pedaço de dados e devolve as linhas completas, sem as linhas em branco. */
  alimentar(dados: Uint8Array | string): string[] {
    const texto =
      typeof dados === 'string' ? dados : this.decodificador.decode(dados, { stream: true });
    const linhas: string[] = [];

    for (const parte of texto.split(/(\n)/)) {
      if (parte === '\n') {
        if (this.descartando) {
          this.descartando = false;
          this.linhasDescartadas++;
        } else {
          const linha = this.pendente.trim();
          if (linha !== '') linhas.push(linha);
        }
        this.pendente = '';
        continue;
      }
      if (this.descartando) continue;
      this.pendente += parte;
      if (this.pendente.length > this.limite) {
        this.pendente = '';
        this.descartando = true;
      }
    }
    return linhas;
  }

  /** Esquece o que estava pela metade (a conexão Bluetooth caiu no meio de uma linha). */
  reiniciar(): void {
    this.pendente = '';
    this.descartando = false;
  }
}
