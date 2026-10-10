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
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    )
      return;
    this.encerrado = false;
    this.conectar();
  }

  parar(): void {
    this.encerrado = true;
    if (this.temporizador) clearTimeout(this.temporizador);
    this.socket?.close();
    this.socket = null;
    usePainel.getState().acoes.definirEstadoConexao('DESCONECTADO');
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

    socket.addEventListener('error', () => socket.close());

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

      const envelope = mensagem as Record<string, unknown>;
      const registro = asRegistro(envelope.dados ?? envelope.payload ?? envelope);
      const tipo = asString(envelope.tipo ?? registro.tipo);
      const { acoes } = usePainel.getState();
      acoes.registrarMensagem();
      if (tipo === 'inicio_corrida') acoes.reiniciarExecucao();
      const metricas = asRegistro(registro.metricas ?? envelope.metricas);
      const energia = asRegistro(registro.energia ?? envelope.energia);
      const labirinto = asRegistro(registro.labirinto ?? envelope.labirinto);
      const ponto = asRegistro(
        registro.ponto ?? registro.posicao ?? envelope.ponto ?? envelope.posicao,
      );
      const tempo = asNumber(
        registro.tempo_conclusao_ms ?? envelope.tempo_conclusao_ms ?? registro.t,
      );
      const status = asStatus(
        registro.status ?? envelope.status ?? asRegistro(registro.estado).status,
      );
      const tensaoV = asNumber(energia.tensao_v ?? registro.tensao_v ?? envelope.tensao_v);
      const correnteA = asNumber(energia.corrente_a ?? registro.corrente_a ?? envelope.corrente_a);
      const potenciaW = asNumber(energia.potencia_w ?? registro.potencia_w ?? envelope.potencia_w);
      const cargaPct = asNumber(
        energia.carga_pct ?? energia.carga_percentual ?? registro.carga_pct ?? envelope.carga_pct,
      );

      const atualizacao: Partial<import('../../dominio').DadosExecucao> = {};
      const tipoLabirinto = asTipoLabirinto(
        labirinto.tipo ?? registro.tipo_labirinto ?? envelope.tipo_labirinto,
      );
      const velocidadeMediaMps = asNumber(
        metricas.velocidade_media_m_s ??
          registro.velocidade_media_m_s ??
          envelope.velocidade_media_m_s,
      );
      if (tipoLabirinto !== undefined) atualizacao.tipoLabirinto = tipoLabirinto;
      if (velocidadeMediaMps !== null) atualizacao.velocidadeMediaMps = velocidadeMediaMps;
      if (tempo !== null) atualizacao.tempoMs = tempo;
      if (status !== undefined) atualizacao.status = status;
      if (tensaoV !== null) atualizacao.tensaoV = tensaoV;
      if (correnteA !== null) atualizacao.correnteA = correnteA;
      if (potenciaW !== null) atualizacao.potenciaW = potenciaW;
      if (cargaPct !== null) atualizacao.cargaPct = cargaPct;
      acoes.atualizarExecucao(atualizacao);

      const seqEnergia = asNumber(registro.seq ?? envelope.seq);
      const tempoEnergia = asNumber(registro.t ?? envelope.t);
      if (tensaoV !== null && correnteA !== null && potenciaW !== null) {
        acoes.adicionarAmostraEnergia({
          seq: seqEnergia,
          tempoMs: tempoEnergia,
          tensaoV,
          correnteA,
          potenciaW,
          cargaPct,
        });
      }

      if (tipo === 'sinal') {
        acoes.definirSinal(registro.sinal === 'OK' ? 'OK' : 'PERDIDO');
      }

      const evento = asString(
        envelope.evento ??
          registro.evento ??
          (tipo === 'evento' ? registro.tipo_evento : undefined),
      );
      if ((tipo === 'evento' && evento === 'celula') || tipo === 'celula') {
        const seq = asNumber(registro.seq ?? envelope.seq);
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
  return valor !== null && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
}

function asNumber(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

function asString(valor: unknown): string | undefined {
  return typeof valor === 'string' ? valor : undefined;
}

function asTipoLabirinto(valor: unknown) {
  return valor === '4x4' || valor === '8x4' || valor === '12x4' ? valor : undefined;
}

function asStatus(valor: unknown) {
  return valor === 'EM_ANDAMENTO' ||
    valor === 'CONCLUIDA' ||
    valor === 'FALHOU' ||
    valor === 'INTERROMPIDA'
    ? valor
    : undefined;
}
