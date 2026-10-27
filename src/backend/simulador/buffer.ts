/**
 * Buffer circular de retransmissão, igual ao `TelemetryBuffer` do firmware
 * (`src/firmware/src/telemetry/TelemetryBuffer.cpp`, branch `feat/firmware-hardware`).
 *
 * Toda mensagem de corrida que o robô produz entra aqui, esteja o enlace no ar ou não. A cada
 * conexão nova (ou volta do sinal), o robô envia o `hello` e, em seguida, o buffer inteiro, sem
 * saber o que o backend já gravou: as duplicatas são descartadas pelo backend (RF-77).
 *
 * Como no firmware, a idade é medida no RELÓGIO DO ROBÔ (`tempo_ms`), e não no relógio da
 * máquina: ao entrar uma mensagem, saem as que ficaram mais de `retencaoMs` antes dela e, depois,
 * as mais antigas que passarem de `maxMensagens`. O firmware usa 60 000 ms e 4 000 mensagens.
 */

/** `TelemetryBuffer buffer(60000, 4000)` no `main.cpp` do firmware. */
export const RETENCAO_PADRAO_MS = 60_000;
export const MAX_MENSAGENS_PADRAO = 4000;

export interface OpcoesBuffer {
  /** Janela de retenção no relógio do robô, em ms. Padrão: 60 000. */
  retencaoMs?: number;
  /** Limite de mensagens guardadas. Padrão: 4 000. */
  maxMensagens?: number;
}

/** De qual corrida e sequência é a mensagem (o simulador usa para saber o que já enviou). */
export interface Marca {
  corrida: string;
  sequencia: number;
}

export interface EntradaBuffer {
  readonly tempoMs: number;
  readonly texto: string;
  readonly marca?: Marca;
}

export class BufferRetransmissao {
  readonly retencaoMs: number;
  readonly maxMensagens: number;
  private entradas: EntradaBuffer[] = [];

  constructor(opcoes: OpcoesBuffer = {}) {
    this.retencaoMs = opcoes.retencaoMs ?? RETENCAO_PADRAO_MS;
    this.maxMensagens = opcoes.maxMensagens ?? MAX_MENSAGENS_PADRAO;
    if (!Number.isFinite(this.retencaoMs) || this.retencaoMs < 0) {
      throw new RangeError(`retenção do buffer inválida: ${this.retencaoMs}`);
    }
    if (!Number.isInteger(this.maxMensagens) || this.maxMensagens < 0) {
      throw new RangeError(`tamanho do buffer inválido: ${this.maxMensagens}`);
    }
  }

  get tamanho(): number {
    return this.entradas.length;
  }

  /** As mensagens guardadas, da mais antiga para a mais nova, como texto. */
  mensagens(): string[] {
    return this.entradas.map((entrada) => entrada.texto);
  }

  /** As mensagens guardadas, da mais antiga para a mais nova, com o tempo e a marca. */
  conteudo(): readonly EntradaBuffer[] {
    return [...this.entradas];
  }

  /** `TelemetryBuffer::add`: guarda a mensagem e descarta o que saiu da janela. */
  adicionar(tempoMs: number, texto: string, marca?: Marca): void {
    this.entradas.push(marca ? { tempoMs, texto, marca } : { tempoMs, texto });
    const corte = tempoMs - this.retencaoMs;
    let inicio = 0;
    while (inicio < this.entradas.length && this.entradas[inicio]!.tempoMs < corte) inicio++;
    inicio = Math.max(inicio, this.entradas.length - this.maxMensagens);
    if (inicio > 0) this.entradas = this.entradas.slice(inicio);
  }

  /** O reinício do robô apaga a RAM e, com ela, o buffer. */
  limpar(): void {
    this.entradas = [];
  }
}
