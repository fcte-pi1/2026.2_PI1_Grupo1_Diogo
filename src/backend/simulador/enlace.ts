/**
 * Enlace do simulador com o backend: o WebSocket e o atraso de rede artificial.
 *
 * O socket padrão usa a biblioteca `ws`, e não o `WebSocket` nativo do Node, por dois motivos:
 * - o nativo responde ao ping sozinho e não deixa desligar isso. Para simular a perda de sinal
 *   com o TCP aberto (CT-BE-03), o simulador precisa ficar mudo também no pong;
 * - o nativo só fecha com o handshake de fechamento. Uma queda de verdade (o Bluetooth cai, o
 *   notebook perde a rede) não avisa ninguém: `terminate()` derruba o TCP sem a mensagem de
 *   fechamento do WebSocket, e o backend vê `1006`.
 */
import type { Socket } from 'node:net';
import WebSocket from 'ws';
import { inteiroEntre, type Aleatorio } from './aleatorio.js';
import type { Marca } from './buffer.js';

/** Subconjunto da API WebSocket usado pelo simulador (compatível com o `WebSocket` do Node). */
export interface SocketSimulador {
  readonly readyState: number;
  /** Bytes enviados que ainda não saíram da máquina. Sem ele, a queda não espera o envio. */
  readonly bufferedAmount?: number;
  send(dados: string): void;
  close(codigo?: number, motivo?: string): void;
  addEventListener(tipo: 'open', ouvinte: () => void): void;
  addEventListener(tipo: 'message', ouvinte: (evento: { data: unknown }) => void): void;
  addEventListener(
    tipo: 'close',
    ouvinte: (evento: { code: number; reason: string }) => void,
  ): void;
  addEventListener(tipo: 'error', ouvinte: () => void): void;
  /** Derruba o TCP sem o handshake de fechamento. Sem ele, a queda usa `close(4000)`. */
  terminate?(): void;
  /** Liga ou desliga a resposta aos pings do backend. Sem ele, não dá para silenciar o pong. */
  responderPing?(responder: boolean): void;
}

export const SOCKET_ABERTO = 1;
/** Depois do FIN, tempo até destruir o socket de vez, se o outro lado não fechar antes. */
const ESPERA_FIN_MS = 200;

/** Socket padrão: `ws` com o pong controlado pelo simulador. */
export function criarSocketWs(url: string): SocketSimulador {
  const ws = new WebSocket(url, { autoPong: false });
  let responder = true;
  ws.on('ping', (dados) => {
    if (responder && ws.readyState === WebSocket.OPEN) ws.pong(dados);
  });
  return {
    get readyState() {
      return ws.readyState;
    },
    get bufferedAmount() {
      return ws.bufferedAmount;
    },
    send: (dados) => ws.send(dados),
    close: (codigo, motivo) => ws.close(codigo, motivo),
    addEventListener: (tipo: string, ouvinte: (evento: never) => void) =>
      ws.addEventListener(tipo as 'open', ouvinte as never),
    terminate: () => derrubarTcp(ws),
    responderPing: (valor) => {
      responder = valor;
    },
  };
}

/**
 * Derruba o TCP sem o fechamento do WebSocket, mas sem perder o que já foi enviado.
 *
 * O `ws.terminate()` destrói o socket na hora. Se houver `ack` do backend ainda não lido, o
 * sistema operacional responde com RST, e o RST faz o OUTRO lado descartar o que já tinha chegado
 * mas o backend ainda não tinha lido. Aí a "queda depois da sequência N" perderia mensagens antes
 * da N, e a lacuna não seria a que o teste pediu. Por isso o simulador primeiro encerra o envio
 * (FIN, que só sai depois dos dados) e só destrói o socket se o outro lado não fechar logo.
 * Para o backend continua sendo uma queda: o TCP termina sem o quadro de fechamento (1006).
 */
function derrubarTcp(ws: WebSocket): void {
  // `_socket` é interno do `ws` (estável desde a versão 1), e é o único jeito de mandar só o FIN.
  const tcp = (ws as unknown as { _socket?: Socket | null })._socket;
  if (!tcp || tcp.destroyed) {
    ws.terminate();
    return;
  }
  tcp.end();
  setTimeout(() => ws.terminate(), ESPERA_FIN_MS).unref();
}

/** Atraso de cada mensagem na rede, sorteado entre `minimoMs` e `maximoMs`. */
export interface AtrasoRede {
  minimoMs: number;
  maximoMs: number;
}

export function validarAtraso(atraso: AtrasoRede): void {
  const { minimoMs, maximoMs } = atraso;
  if (
    !Number.isInteger(minimoMs) ||
    !Number.isInteger(maximoMs) ||
    minimoMs < 0 ||
    maximoMs < minimoMs
  ) {
    throw new RangeError(`atraso de rede inválido: ${minimoMs} a ${maximoMs} ms`);
  }
}

/**
 * Fila de saída com atraso de rede artificial (CT-BE-15).
 *
 * Cada mensagem sai `d` ms depois de entrar, com `d` sorteado na faixa, mas NUNCA antes da
 * anterior: a fila é FIFO, como um TCP com variação de latência. Trocar a ordem das mensagens
 * não é papel do atraso, e sim da anomalia `fora-de-ordem`.
 */
export class FilaComAtraso {
  private pendentes: { texto: string; marca: Marca | undefined; saidaEm: number }[] = [];
  private ultimaSaida = 0;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private aoEsvaziar: (() => void)[] = [];

  constructor(
    private readonly atraso: AtrasoRede | null,
    private readonly aleatorio: Aleatorio,
    /** Escreve no socket. Chamada na ordem de entrada, quando chega a hora de cada mensagem. */
    private readonly escrever: (texto: string, marca: Marca | undefined) => void,
  ) {}

  get tamanho(): number {
    return this.pendentes.length;
  }

  colocar(texto: string, marca?: Marca): void {
    if (!this.atraso || this.atraso.maximoMs === 0) {
      this.escrever(texto, marca);
      return;
    }
    const atraso = inteiroEntre(this.aleatorio, this.atraso.minimoMs, this.atraso.maximoMs);
    const saidaEm = Math.max(this.ultimaSaida, performance.now() + atraso);
    this.ultimaSaida = saidaEm;
    this.pendentes.push({ texto, marca, saidaEm });
    this.agendar();
  }

  /** Esquece o que ainda não saiu: numa queda, o que estava "na rede" se perde. */
  descartar(): void {
    this.pendentes = [];
    this.ultimaSaida = 0;
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    this.avisarVazia();
  }

  /** Resolve quando tudo o que entrou já saiu. */
  esvaziar(): Promise<void> {
    if (this.pendentes.length === 0) return Promise.resolve();
    return new Promise((resolver) => this.aoEsvaziar.push(resolver));
  }

  private agendar(): void {
    if (this.temporizador || this.pendentes.length === 0) return;
    const espera = Math.max(0, this.pendentes[0]!.saidaEm - performance.now());
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      const agora = performance.now();
      while (this.pendentes.length > 0 && this.pendentes[0]!.saidaEm <= agora) {
        const { texto, marca } = this.pendentes.shift()!;
        this.escrever(texto, marca);
      }
      if (this.pendentes.length === 0) this.avisarVazia();
      else this.agendar();
    }, espera);
  }

  private avisarVazia(): void {
    const pendentes = this.aoEsvaziar;
    this.aoEsvaziar = [];
    for (const avisar of pendentes) avisar();
  }
}
