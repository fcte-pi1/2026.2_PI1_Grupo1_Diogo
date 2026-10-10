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
      this.despacharMensagem(evento.data);
    });

    socket.addEventListener('close', () => {
      if (this.encerrado) return;
      acoes.definirEstadoConexao('RECONECTANDO');
      this.temporizador = setTimeout(() => this.conectar(), atrasoBackoffMs(this.tentativa++));
    });
  }

  private despacharMensagem(dado: unknown): void {
    try {
      const mensagem = typeof dado === 'string' ? JSON.parse(dado) : dado;
      if (!mensagem || typeof mensagem !== 'object') return;

      const registro = mensagem as Record<string, unknown>;
      const { acoes } = usePainel.getState();
      const metricas = asRegistro(registro.metricas);
      const energia = asRegistro(registro.energia);
      const labirinto = asRegistro(registro.labirinto);
      const ponto = asRegistro(registro.ponto ?? registro.posicao);

      acoes.atualizarExecucao({
        tipoLabirinto: asTipoLabirinto(labirinto.tipo ?? registro.tipo_labirinto),
        velocidadeMediaMps: asNumber(metricas.velocidade_media_m_s ?? registro.velocidade_media_m_s),
        tempoMs: asNumber(registro.tempo_conclusao_ms ?? registro.t),
        status: asStatus(registro.status),
        tensaoV: asNumber(energia.tensao_v),
        correnteA: asNumber(energia.corrente_a),
        potenciaW: asNumber(energia.potencia_w),
      });

      if (registro.tipo === 'evento' && registro.evento === 'celula' && ponto) {
        const seq = asNumber(registro.seq);
        const x = asNumber(ponto.x);
        const y = asNumber(ponto.y);
        if (seq !== null && x !== null && y !== null) acoes.adicionarPontoTrajeto({ seq, x, y });
      }
    } catch {
      console.warn('[painel-ws] mensagem inválida');
    }
  }
}

function asRegistro(valor: unknown): Record<string, unknown> {
  return valor !== null && typeof valor === 'object' ? valor as Record<string, unknown> : {};
}

function asNumber(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

function asTipoLabirinto(valor: unknown) {
  return valor === '4x4' || valor === '8x4' || valor === '12x4' ? valor : undefined;
}

function asStatus(valor: unknown) {
  return valor === 'EM_ANDAMENTO' || valor === 'CONCLUIDA' || valor === 'FALHOU' || valor === 'INTERROMPIDA'
    ? valor
    : undefined;
}
