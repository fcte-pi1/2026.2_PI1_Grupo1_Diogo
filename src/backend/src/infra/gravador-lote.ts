import type { GravadorMensagens, MensagemParaGravar } from '../aplicacao/portas.js';

/** Grava um lote e devolve, na mesma ordem, se cada mensagem foi inserida (`false` = já existia). */
export type InserirLote = (lote: readonly MensagemParaGravar[]) => Promise<boolean[]>;

export interface OpcoesGravadorLote {
  /** Espera máxima antes de gravar o que estiver na fila (RF-79: 10 ms). */
  esperaMaximaMs?: number;
  /** Tamanho que dispara a gravação imediata (RF-79: 50 mensagens). */
  tamanhoMaximo?: number;
}

interface Pendente {
  mensagem: MensagemParaGravar;
  resolver: (inserida: boolean) => void;
  rejeitar: (erro: unknown) => void;
}

/**
 * GravadorLote — junta as mensagens em lotes para gravar com um único comando no banco,
 * sem bloquear o event loop (RNF-49). Cada chamada a `gravar` só resolve depois que o
 * lote dela foi confirmado, e os lotes são gravados um de cada vez, em ordem.
 */
export class GravadorLote implements GravadorMensagens {
  private fila: Pendente[] = [];
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private gravando: Promise<void> = Promise.resolve();
  private readonly esperaMaximaMs: number;
  private readonly tamanhoMaximo: number;

  constructor(
    private readonly inserir: InserirLote,
    opcoes: OpcoesGravadorLote = {},
  ) {
    this.esperaMaximaMs = opcoes.esperaMaximaMs ?? 10;
    this.tamanhoMaximo = opcoes.tamanhoMaximo ?? 50;
  }

  gravar(mensagem: MensagemParaGravar): Promise<boolean> {
    return new Promise((resolver, rejeitar) => {
      this.fila.push({ mensagem, resolver, rejeitar });
      if (this.fila.length >= this.tamanhoMaximo) this.descarregar();
      else this.temporizador ??= setTimeout(() => this.descarregar(), this.esperaMaximaMs);
    });
  }

  /** Grava o que estiver na fila e espera todas as gravações em andamento (para o encerramento). */
  async esvaziar(): Promise<void> {
    this.descarregar();
    await this.gravando;
  }

  private descarregar(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    if (this.fila.length === 0) return;
    const lote = this.fila;
    this.fila = [];
    this.gravando = this.gravando.then(() => this.gravarLote(lote));
  }

  private async gravarLote(lote: Pendente[]): Promise<void> {
    try {
      const inseridas = await this.inserir(lote.map((pendente) => pendente.mensagem));
      lote.forEach((pendente, indice) => pendente.resolver(inseridas[indice] === true));
    } catch (erro) {
      for (const pendente of lote) pendente.rejeitar(erro);
    }
  }
}
