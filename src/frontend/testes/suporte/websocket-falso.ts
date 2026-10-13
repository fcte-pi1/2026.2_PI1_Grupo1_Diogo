import type { MensagemPainelEntrada, MensagemPainelSaida } from '@protocolo';

type Ouvinte = (evento: { data?: unknown }) => void;

/** WebSocket de teste: o teste decide quando abre, quando recebe e quando cai. */
export class WebSocketFalso {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instancias: WebSocketFalso[] = [];

  readyState: number = WebSocketFalso.CONNECTING;
  readonly enviadas: MensagemPainelEntrada[] = [];
  private readonly ouvintes = new Map<string, Ouvinte[]>();

  constructor(readonly url: string) {
    WebSocketFalso.instancias.push(this);
  }

  addEventListener(tipo: string, ouvinte: Ouvinte): void {
    this.ouvintes.set(tipo, [...(this.ouvintes.get(tipo) ?? []), ouvinte]);
  }

  send(dado: string): void {
    this.enviadas.push(JSON.parse(dado) as MensagemPainelEntrada);
  }

  close(): void {
    this.readyState = WebSocketFalso.CLOSED;
    this.emitir('close', {});
  }

  abrir(): void {
    this.readyState = WebSocketFalso.OPEN;
    this.emitir('open', {});
  }

  receber(mensagem: MensagemPainelSaida | string): void {
    const data = typeof mensagem === 'string' ? mensagem : JSON.stringify(mensagem);
    this.emitir('message', { data });
  }

  private emitir(tipo: string, evento: { data?: unknown }): void {
    (this.ouvintes.get(tipo) ?? []).forEach((ouvinte) => ouvinte(evento));
  }
}
