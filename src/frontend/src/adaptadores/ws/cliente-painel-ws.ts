import { atrasoBackoffMs } from '../../dominio';
import { usePainel } from '../../estado';

/**
 * ClientePainelWS — conexão com /ws/painel fora da árvore de componentes (RF-58),
 * com reconexão por backoff de teto 2 s (RNF-39).
 * Esqueleto: conecta, reconecta e se inscreve no canal `ao_vivo`. O watchdog, os eventos
 * online/offline e o despacho das mensagens serão implementados com a tela ao vivo.
 */
export class ClientePainelWS {
  private socket: WebSocket | null = null;
  private tentativa = 0;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private encerrado = false;

  constructor(private readonly url: string = ClientePainelWS.urlPadrao()) {}

  /** ws(s)://<host da página>/ws/painel — sem IP fixo no código (arquitetura do frontend, §6). */
  static urlPadrao(): string {
    const protocolo = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocolo}//${window.location.host}/ws/painel`;
  }

  iniciar(): void {
    this.encerrado = false;
    this.conectar();
  }

  parar(): void {
    this.encerrado = true;
    if (this.temporizador) clearTimeout(this.temporizador);
    this.socket?.close();
  }

  private conectar(): void {
    const { acoes } = usePainel.getState();
    acoes.definirEstadoConexao(this.tentativa === 0 ? 'CONECTANDO' : 'RECONECTANDO');

    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.tentativa = 0;
      acoes.definirEstadoConexao('CONECTADO');
      socket.send(JSON.stringify({ tipo: 'inscrever', canal: 'ao_vivo' }));
    });

    socket.addEventListener('message', (evento) => {
      // Despacho das mensagens (snapshot, evento, continuo, sinal...) para a store: a implementar.
      console.debug('[painel-ws]', evento.data);
    });

    socket.addEventListener('close', () => {
      if (this.encerrado) return;
      acoes.definirEstadoConexao('RECONECTANDO');
      this.temporizador = setTimeout(() => this.conectar(), atrasoBackoffMs(this.tentativa++));
    });
  }
}
