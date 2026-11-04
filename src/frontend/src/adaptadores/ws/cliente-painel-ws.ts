import { atrasoBackoffMs, ehTipoLabirinto, lerDepuracao } from '../../dominio';
import { usePainel } from '../../estado';
import { dadosDasMetricas } from '../metricas';
import type {
  AoVivoPainel,
  ContinuoPainel,
  EventoCelulaPainel,
  EventoStatusPainel,
  MensagemPainelEntrada,
  MensagemPainelSaida,
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
 * com reconexão por backoff de teto 2 s (RNF-39). Também reage aos eventos `offline` e `online`
 * do navegador (RNF-39, CT-FE-03), mas só como dica: `navigator.onLine` diz se o computador está
 * em alguma rede, não se o backend responde (na apresentação ele roda em localhost, que segue
 * no ar sem nenhuma rede). Por isso:
 *  - `offline`: mostra "Desconectado", mas continua tentando no recuo de teto 2 s, sem trocar o
 *    rótulo para "Reconectando"; se o socket abrir mesmo assim, o painel volta a "Conectado";
 *  - `online`: zera o recuo e tenta na hora;
 *  - a primeira conexão é sempre tentada, mesmo com `navigator.onLine === false`.
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
  /** O navegador avisou que está sem rede (dica): muda só o rótulo, nunca impede de tentar. */
  private semRede = false;
  private escutandoRede = false;
  /** Corrida em que o painel está inscrito (id do backend). */
  private corridaInscrita: string | null = null;

  constructor(private readonly url: string = ClientePainelWS.urlPadrao()) {}

  /** ws(s)://<host da página>/ws/painel — sem IP fixo no código (arquitetura do frontend, §6). */
  static urlPadrao(): string {
    const protocolo = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocolo}//${window.location.host}/ws/painel`;
  }

  iniciar(): void {
    this.escutarRede();
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    )
      return;
    this.encerrado = false;
    // Sem rede no navegador não quer dizer backend fora do ar (localhost): tenta mesmo assim.
    this.semRede = typeof navigator !== 'undefined' && navigator.onLine === false;
    this.conectar();
  }

  parar(): void {
    this.encerrado = true;
    this.semRede = false;
    this.ignorarRede();
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    this.socket?.close();
    this.socket = null;
    this.corridaInscrita = null;
    usePainel.getState().acoes.definirEstadoConexao('DESCONECTADO');
  }

  private escutarRede(): void {
    if (this.escutandoRede) return;
    this.escutandoRede = true;
    window.addEventListener('offline', this.aoFicarOffline);
    window.addEventListener('online', this.aoVoltarOnline);
  }

  private ignorarRede(): void {
    this.escutandoRede = false;
    window.removeEventListener('offline', this.aoFicarOffline);
    window.removeEventListener('online', this.aoVoltarOnline);
  }

  /**
   * Sem rede: mostra "Desconectado" e fecha o socket, mas segue tentando no recuo de teto 2 s.
   * Se o backend ainda responde (localhost), a próxima tentativa abre e o painel volta a
   * "Conectado" sozinho.
   */
  private readonly aoFicarOffline = (): void => {
    if (this.encerrado) return;
    this.semRede = true;
    if (this.temporizador) clearTimeout(this.temporizador);
    const socket = this.socket;
    // Solta a referência antes de fechar: o `close` desse socket não agenda nada por conta própria.
    this.socket = null;
    socket?.close();
    usePainel.getState().acoes.definirEstadoConexao('DESCONECTADO');
    this.tentativa = 0;
    this.agendarReconexao();
  };

  /** Rede de volta: tenta reconectar agora, com o recuo zerado (RNF-39). */
  private readonly aoVoltarOnline = (): void => {
    if (this.encerrado) return;
    this.semRede = false;
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    if (this.socket?.readyState === WebSocket.OPEN) return;
    if (this.socket?.readyState === WebSocket.CONNECTING) {
      // Já há uma tentativa em curso (feita enquanto estava offline): só troca o rótulo.
      usePainel.getState().acoes.definirEstadoConexao('RECONECTANDO');
      return;
    }
    this.tentativa = 0;
    this.conectar(true);
  };

  /** Próxima tentativa no recuo 0,25 → 0,5 → 1 → 2 s (teto de 2 s, RNF-39). */
  private agendarReconexao(): void {
    this.temporizador = setTimeout(() => this.conectar(), atrasoBackoffMs(this.tentativa++));
  }

  /** Com o navegador sem rede o rótulo fica "Desconectado"; "Reconectando" só havendo rede. */
  private conectar(reconectando = this.tentativa > 0): void {
    const { acoes } = usePainel.getState();
    acoes.definirEstadoConexao(
      this.semRede ? 'DESCONECTADO' : reconectando ? 'RECONECTANDO' : 'CONECTANDO',
    );

    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.tentativa = 0;
      // O backend respondeu: o `offline` do navegador era só uma dica.
      this.semRede = false;
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
      // Socket já substituído ou solto (offline/online): o `close` dele não decide mais nada.
      if (this.encerrado || this.socket !== socket) return;
      acoes.definirEstadoConexao(this.semRede ? 'DESCONECTADO' : 'RECONECTANDO');
      this.agendarReconexao();
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
      motivoTermino: m.motivo_termino ?? null,
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
      motivoTermino: m.motivo_termino ?? null,
      detalheFalha: m.detalhe ?? null,
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
    // Bloco opcional de depuração (HU-FE-14); ainda não faz parte de `ContinuoPainel`.
    const leitura = lerDepuracao((m as { depuracao?: unknown }).depuracao, m.tempo_ms);
    if (leitura) acoes.atualizarDepuracao(leitura);
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
