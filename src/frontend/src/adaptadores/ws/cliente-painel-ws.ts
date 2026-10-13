import { atrasoBackoffMs, ehTipoLabirinto, type DadosExecucao } from '../../dominio';
import { usePainel } from '../../estado';
import type {
  AoVivoPainel,
  ContinuoPainel,
  EventoCelulaPainel,
  EventoStatusPainel,
  MensagemPainelEntrada,
  MensagemPainelSaida,
  Metricas,
  SinalPainel,
  SnapshotPainel,
} from '../../protocolo';

const TIPOS_SAIDA: ReadonlySet<string> = new Set<MensagemPainelSaida['tipo']>([
  'snapshot',
  'evento',
  'continuo',
  'sinal',
  'alerta',
  'ao_vivo',
  'leaderboard',
  'keepalive',
]);

const STATUS_FINAIS: ReadonlySet<string> = new Set(['CONCLUIDA', 'FALHOU', 'INTERROMPIDA']);

/**
 * ClientePainelWS — conexão com /ws/painel fora da árvore de componentes (RF-58),
 * com reconexão por backoff de teto 2 s (RNF-39).
 *
 * Fluxo do contrato (protocolo v1, "Backend → Painel"):
 *  1. ao abrir, inscreve-se no canal `ao_vivo` (resumo de início e fim de qualquer corrida);
 *  2. ao receber `ao_vivo` com `EM_ANDAMENTO` de uma corrida nova, inscreve-se nela, o que
 *     faz o backend enviar `snapshot` e depois `evento`, `continuo` e `sinal`;
 *  3. ao mudar a corrida acompanhada, o estado da tela é reiniciado.
 */
export class ClientePainelWS {
  private socket: WebSocket | null = null;
  private tentativa = 0;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private encerrado = false;
  /** Corrida em que o painel está inscrito (id do backend). */
  private corridaInscrita: string | null = null;

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
    this.corridaInscrita = null;
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
      this.enviar({ tipo: 'inscrever', canal: 'ao_vivo' });
      // Reconexão no meio de uma corrida: pede o snapshot de novo (RF-89).
      const { corrida, status } = usePainel.getState().aoVivo;
      if (this.corridaInscrita && corrida === this.corridaInscrita && status === 'EM_ANDAMENTO') {
        this.enviar({ tipo: 'inscrever', corrida });
      }
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

  private enviar(mensagem: MensagemPainelEntrada): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(mensagem));
  }

  private despacharMensagem(dado: unknown): void {
    const mensagem = lerMensagem(dado);
    if (!mensagem) {
      console.warn('[painel-ws] mensagem inválida');
      return;
    }
    // keepalive existe só para o watchdog de conexão: não é telemetria.
    if (mensagem.tipo === 'keepalive') return;

    usePainel.getState().acoes.registrarMensagem();
    switch (mensagem.tipo) {
      case 'ao_vivo':
        return this.aoReceberAoVivo(mensagem);
      case 'snapshot':
        return this.aoReceberSnapshot(mensagem);
      case 'evento':
        return mensagem.evento === 'celula'
          ? this.aoReceberCelula(mensagem)
          : this.aoReceberStatus(mensagem);
      case 'continuo':
        return this.aoReceberContinuo(mensagem);
      case 'sinal':
        return this.aoReceberSinal(mensagem);
      default:
        // alerta e leaderboard ainda não têm tela.
        return;
    }
  }

  private aoReceberAoVivo(m: AoVivoPainel): void {
    const { acoes, aoVivo } = usePainel.getState();
    const mesmaCorrida = aoVivo.corrida === m.corrida;

    if (m.status === 'EM_ANDAMENTO') {
      // Um `ao_vivo` atrasado não reabre uma corrida já encerrada.
      if (mesmaCorrida && aoVivo.status !== null && STATUS_FINAIS.has(aoVivo.status)) return;
      if (!mesmaCorrida) {
        acoes.reiniciarExecucao({ corrida: m.corrida, status: 'EM_ANDAMENTO' });
        this.aplicarLabirinto(m.labirinto);
      }
      this.inscreverNaCorrida(m.corrida);
      return;
    }
    if (mesmaCorrida) acoes.atualizarExecucao({ status: m.status });
  }

  private aoReceberSnapshot(m: SnapshotPainel): void {
    if (this.corridaInscrita !== null && this.corridaInscrita !== m.corrida) return;
    this.corridaInscrita = m.corrida;

    const { acoes } = usePainel.getState();
    const tipo: unknown = m.labirinto;
    acoes.substituirSnapshot({
      tipoLabirinto: ehTipoLabirinto(tipo) ? tipo : null,
      tipoInvalido: !ehTipoLabirinto(tipo) && tipo !== undefined && tipo !== null,
      mapa: Array.isArray(m.mapa) ? m.mapa : [],
      posicao: m.posicao ?? null,
      status: m.status,
      ...dadosDasMetricas(m.metricas),
      corrida: m.corrida,
    });
  }

  private aoReceberCelula(m: EventoCelulaPainel): void {
    if (!this.daCorridaAtual(m.corrida)) return;
    const { acoes } = usePainel.getState();
    acoes.atualizarExecucao(dadosDasMetricas(m.metricas));
    acoes.atualizarCelulaMapa({ x: m.x, y: m.y, paredes: m.paredes });
    acoes.adicionarPontoTrajeto({ seq: m.sequencia, x: m.x, y: m.y });
  }

  private aoReceberStatus(m: EventoStatusPainel): void {
    if (!this.daCorridaAtual(m.corrida)) return;
    usePainel.getState().acoes.atualizarExecucao({
      ...dadosDasMetricas(m.metricas),
      status: m.status,
    });
  }

  private aoReceberContinuo(m: ContinuoPainel): void {
    if (!this.daCorridaAtual(m.corrida)) return;
    const { acoes } = usePainel.getState();
    acoes.atualizarExecucao({
      ...dadosDasMetricas(m.metricas),
      ...(m.posicao ? { posicao: m.posicao } : {}),
    });
    if (m.energia) {
      acoes.adicionarAmostraEnergia({
        seq: null,
        tempoMs: m.tempo_ms,
        tensaoV: m.energia.tensao_v,
        correnteA: m.energia.corrente_a,
        potenciaW: m.energia.potencia_w,
        cargaPct: m.metricas?.carga_estimada_pct ?? null,
      });
    }
  }

  private aoReceberSinal(m: SinalPainel): void {
    if (!this.daCorridaAtual(m.corrida)) return;
    usePainel.getState().acoes.definirSinal(m.estado === 'RETOMADO' ? 'OK' : 'PERDIDO');
  }

  private daCorridaAtual(corrida: string): boolean {
    return usePainel.getState().aoVivo.corrida === corrida;
  }

  /** Inscreve-se na corrida (e cancela a anterior): eventos e contínuos só chegam a quem pede. */
  private inscreverNaCorrida(corrida: string): void {
    if (this.corridaInscrita === corrida) return;
    if (this.corridaInscrita !== null)
      this.enviar({ tipo: 'cancelar', corrida: this.corridaInscrita });
    this.corridaInscrita = corrida;
    this.enviar({ tipo: 'inscrever', corrida });
  }

  private aplicarLabirinto(tipo: unknown): void {
    const { acoes } = usePainel.getState();
    if (ehTipoLabirinto(tipo)) acoes.atualizarExecucao({ tipoLabirinto: tipo });
    else if (tipo !== undefined && tipo !== null) acoes.definirTipoInvalido();
  }
}

function lerMensagem(dado: unknown): MensagemPainelSaida | null {
  try {
    const mensagem: unknown = typeof dado === 'string' ? JSON.parse(dado) : dado;
    if (mensagem === null || typeof mensagem !== 'object') return null;
    const tipo = (mensagem as { tipo?: unknown }).tipo;
    return typeof tipo === 'string' && TIPOS_SAIDA.has(tipo)
      ? (mensagem as MensagemPainelSaida)
      : null;
  } catch {
    return null;
  }
}

/**
 * Métricas derivadas pelo backend → dados da tela. O tempo vem do backend (relógio oficial,
 * RF-82): `tempo_conclusao_ms` quando a corrida terminou com sucesso, senão o decorrido.
 */
function dadosDasMetricas(metricas: Metricas | null | undefined): Partial<DadosExecucao> {
  if (!metricas) return {};
  const tempo = metricas.tempo_conclusao_ms ?? metricas.tempo_decorrido_ms;
  return {
    celulasPercorridas: metricas.celulas_percorridas,
    velocidadeMediaMps: metricas.velocidade_media_mps,
    tensaoV: metricas.tensao_v,
    correnteA: metricas.corrente_a,
    potenciaW: metricas.potencia_w,
    cargaPct: metricas.carga_estimada_pct,
    ...(tempo !== null && tempo !== undefined ? { tempoMs: tempo } : {}),
  };
}
