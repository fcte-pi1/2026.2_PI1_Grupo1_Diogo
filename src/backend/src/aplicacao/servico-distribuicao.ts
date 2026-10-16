/**
 * ServicoDistribuicao — entrega aos painéis o que acontece nas corridas (RF-88 a RF-92):
 *  - cada painel recebe só as corridas em que se inscreveu, e o canal `ao_vivo` recebe o
 *    resumo de início, fim e status de todas, e o aviso de ranking (RF-88);
 *  - quem se inscreve no meio recebe um snapshot e, depois, só o que vem depois dele (RF-89);
 *  - eventos discretos (célula, status) vão todos, em ordem; dados contínuos (posição,
 *    energia) vão no máximo 10 vezes por segundo, sempre com o valor mais recente (RF-90);
 *  - um painel lento perde os contínuos e, se continuar lento, é desconectado (RF-91);
 *  - perda e retomada de sinal são avisadas na hora (RF-92).
 *
 * Os eventos chegam do barramento (ServicoCorrida e ServicoIngestao). As conexões são
 * abstratas: o adaptador WebSocket implementa `ConexaoPainel`.
 */
import type { Metricas as MetricasDominio, ParedesCelula } from '../dominio/index.js';
import type {
  Metricas,
  MensagemPainelEntrada,
  MensagemPainelSaida,
  Orientacao,
  PosicaoRobo,
} from '../../protocolo/tipos.js';
import type { MapaEventos } from './eventos.js';
import type { RegistroLog } from './portas.js';
import type { EstadoAoVivo } from './servico-corrida.js';

/** No máximo 10 atualizações contínuas por segundo por corrida (RF-90). */
export const INTERVALO_CONTINUO_MS = 100;
/** Acima disso no buffer de envio, o painel deixa de receber contínuos (RF-91). */
export const LIMITE_BUFFER_BYTES = 1024 * 1024;
/** Tempo acima do limite para o painel ser desconectado (RF-91, CA2). */
export const PRAZO_PAINEL_LENTO_MS = 10_000;
/** Código de fechamento para o painel lento: "tente de novo mais tarde". */
export const FECHAMENTO_PAINEL_LENTO = 1013;

export interface ConexaoPainel {
  enviar(texto: string): void;
  /** Bytes ainda não enviados pela conexão (`bufferedAmount` do WebSocket). */
  bytesPendentes(): number;
  fechar(codigo: number, motivo: string): void;
}

/** O que a distribuição precisa saber das corridas: o ServicoCorrida implementa. */
export interface FonteEstadoAoVivo {
  estadoAoVivo(corridaId: string): EstadoAoVivo | null;
  corridasEmAndamento(): EstadoAoVivo[];
}

export interface DependenciasDistribuicao {
  corridas: FonteEstadoAoVivo;
  log: RegistroLog;
  agora?: () => number;
  intervaloContinuoMs?: number;
  limiteBufferBytes?: number;
}

export class Painel {
  readonly corridas = new Set<string>();
  aoVivo = false;
  /** Desde quando o buffer está acima do limite, ou `null` se não está. */
  lentoDesde: number | null = null;

  constructor(readonly conexao: ConexaoPainel) {}
}

interface ContinuoPendente {
  tempoMs: number;
  posicao: PosicaoRobo | null;
  energia: { tensao_v: number; corrente_a: number; potencia_w: number } | null;
  metricas: Metricas;
}

export class ServicoDistribuicao {
  private readonly paineis = new Set<Painel>();
  /** Último estado contínuo conhecido de cada corrida: cada envio leva posição e energia. */
  private readonly continuos = new Map<string, ContinuoPendente>();
  /** Corridas com estado contínuo novo, ainda não enviado. */
  private readonly pendentes = new Set<string>();
  private readonly ultimoContinuoEm = new Map<string, number>();
  private readonly temporizadores = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly agora: () => number;
  private readonly intervaloContinuoMs: number;
  private readonly limiteBufferBytes: number;

  constructor(private readonly deps: DependenciasDistribuicao) {
    this.agora = deps.agora ?? Date.now;
    this.intervaloContinuoMs = deps.intervaloContinuoMs ?? INTERVALO_CONTINUO_MS;
    this.limiteBufferBytes = deps.limiteBufferBytes ?? LIMITE_BUFFER_BYTES;
  }

  // ---------------------------------------------------------------------------
  // Painéis
  // ---------------------------------------------------------------------------

  conectar(conexao: ConexaoPainel): Painel {
    const painel = new Painel(conexao);
    this.paineis.add(painel);
    return painel;
  }

  desconectar(painel: Painel): void {
    this.paineis.delete(painel);
  }

  /** Mensagem do painel, já validada pelo esquema `painel-entrada`. */
  receber(painel: Painel, mensagem: MensagemPainelEntrada): void {
    const inscrever = mensagem.tipo === 'inscrever';
    if ('canal' in mensagem) {
      painel.aoVivo = inscrever;
      // Quem chega ao canal fica sabendo das corridas que já estão acontecendo.
      if (inscrever) {
        for (const estado of this.deps.corridas.corridasEmAndamento()) {
          this.enviar(painel, aoVivo(estado.corridaId, estado));
        }
      }
      return;
    }

    if (!inscrever) {
      painel.corridas.delete(mensagem.corrida);
      return;
    }
    const estado = this.deps.corridas.estadoAoVivo(mensagem.corrida);
    if (!estado) {
      // Corrida desconhecida ou fora da memória (antiga): o painel usa o detalhe HTTP.
      this.deps.log.warn({ corrida: mensagem.corrida }, 'inscrição em corrida não carregada');
      return;
    }
    // Snapshot e inscrição no mesmo tick: nada entre os dois (RF-89).
    painel.corridas.add(mensagem.corrida);
    this.enviar(painel, snapshot(estado));
  }

  /** Chamado a cada segundo: keepalive para todos e controle dos painéis lentos (RF-91). */
  verificarPaineis(): void {
    const agora = this.agora();
    for (const painel of this.paineis) {
      if (painel.conexao.bytesPendentes() > this.limiteBufferBytes) {
        painel.lentoDesde ??= agora;
        if (agora - painel.lentoDesde >= PRAZO_PAINEL_LENTO_MS) {
          this.deps.log.warn(
            { bytes: painel.conexao.bytesPendentes() },
            'painel lento desconectado',
          );
          this.paineis.delete(painel);
          painel.conexao.fechar(FECHAMENTO_PAINEL_LENTO, 'painel lento');
          continue;
        }
      } else {
        painel.lentoDesde = null;
      }
      // Sinal de vida para o watchdog do painel, também fora das corridas.
      this.enviar(painel, { tipo: 'keepalive' });
    }
  }

  // ---------------------------------------------------------------------------
  // Eventos do barramento
  // ---------------------------------------------------------------------------

  aoAplicar(dados: MapaEventos['mensagem-aplicada']): void {
    const { corridaId, mensagem } = dados;
    const metricas = metricasParaPainel(dados.metricas);
    switch (mensagem.tipo) {
      case 'inicio_corrida':
        this.paraAoVivo(
          aoVivo(corridaId, { labirinto: mensagem.labirinto, status: 'EM_ANDAMENTO' }),
        );
        return;
      case 'celula':
        this.paraInscritos(corridaId, {
          tipo: 'evento',
          evento: 'celula',
          corrida: corridaId,
          sequencia: mensagem.sequencia,
          tempo_ms: mensagem.tempo_ms,
          x: mensagem.x,
          y: mensagem.y,
          paredes: mensagem.paredes,
          revisita: dados.revisita,
          metricas,
        });
        return;
      case 'posicao':
        this.acumularContinuo(corridaId, mensagem.tempo_ms, metricas, {
          posicao: { x: mensagem.x, y: mensagem.y, orientacao: mensagem.orientacao },
        });
        return;
      case 'energia':
        this.acumularContinuo(corridaId, mensagem.tempo_ms, metricas, {
          energia: {
            tensao_v: mensagem.tensao_v,
            corrente_a: mensagem.corrente_a,
            potencia_w: mensagem.potencia_w,
          },
        });
        return;
      default:
        return;
    }
  }

  aoMudarStatus(dados: MapaEventos['status-alterado']): void {
    const { corridaId } = dados;
    // O último contínuo pendente sai antes do status, para a tela terminar coerente.
    this.descarregarContinuo(corridaId);
    this.paraInscritos(corridaId, {
      tipo: 'evento',
      evento: 'status',
      corrida: corridaId,
      sequencia: dados.sequencia,
      tempo_ms: dados.tempoMs,
      status: dados.status,
      motivo_termino: dados.motivo,
      detalhe: dados.detalhe,
      metricas: metricasParaPainel(dados.metricas),
    });
    this.paraAoVivo(aoVivo(corridaId, dados));
  }

  /**
   * O ranking do labirinto pode ter mudado, e a corrida já está no banco (RF-95). Vai para
   * o canal `ao_vivo`, como os outros avisos que não são de uma corrida (RF-88).
   */
  aoMudarRanking(dados: MapaEventos['ranking-alterado']): void {
    this.paraAoVivo({ tipo: 'leaderboard', labirinto: dados.labirinto });
  }

  aoAlertar(dados: MapaEventos['alerta-tensao']): void {
    this.paraInscritos(dados.corridaId, {
      tipo: 'alerta',
      corrida: dados.corridaId,
      alerta: 'TENSAO_BAIXA',
      tensao_v: dados.tensaoV,
    });
  }

  aoMudarSinal(dados: MapaEventos['sinal-alterado']): void {
    this.paraInscritos(dados.corridaId, {
      tipo: 'sinal',
      corrida: dados.corridaId,
      estado: dados.estado,
    });
  }

  /** Cancela os temporizadores pendentes (encerramento e testes). */
  parar(): void {
    for (const temporizador of this.temporizadores.values()) clearTimeout(temporizador);
    this.temporizadores.clear();
  }

  // ---------------------------------------------------------------------------

  /** Guarda o valor mais recente e o envia no máximo uma vez a cada 100 ms (RF-90). */
  private acumularContinuo(
    corridaId: string,
    tempoMs: number,
    metricas: Metricas,
    novo: Partial<Pick<ContinuoPendente, 'posicao' | 'energia'>>,
  ): void {
    const anterior = this.continuos.get(corridaId);
    this.continuos.set(corridaId, {
      tempoMs,
      metricas,
      posicao: novo.posicao ?? anterior?.posicao ?? null,
      energia: novo.energia ?? anterior?.energia ?? null,
    });
    this.pendentes.add(corridaId);
    if (this.temporizadores.has(corridaId)) return;

    const espera =
      (this.ultimoContinuoEm.get(corridaId) ?? -Infinity) + this.intervaloContinuoMs - this.agora();
    if (espera <= 0) {
      this.descarregarContinuo(corridaId);
    } else {
      this.temporizadores.set(
        corridaId,
        setTimeout(() => this.descarregarContinuo(corridaId), espera),
      );
    }
  }

  private descarregarContinuo(corridaId: string): void {
    const temporizador = this.temporizadores.get(corridaId);
    if (temporizador) clearTimeout(temporizador);
    this.temporizadores.delete(corridaId);
    const pendente = this.continuos.get(corridaId);
    if (!pendente || !this.pendentes.delete(corridaId)) return;
    this.ultimoContinuoEm.set(corridaId, this.agora());

    const texto = JSON.stringify({
      tipo: 'continuo',
      corrida: corridaId,
      tempo_ms: pendente.tempoMs,
      posicao: pendente.posicao,
      energia: pendente.energia,
      metricas: pendente.metricas,
    } satisfies MensagemPainelSaida);
    for (const painel of this.paineis) {
      // Painel lento perde os contínuos, mas continua recebendo os eventos (RF-91, CA1).
      if (painel.corridas.has(corridaId) && painel.lentoDesde === null) {
        if (painel.conexao.bytesPendentes() > this.limiteBufferBytes) {
          painel.lentoDesde = this.agora();
          continue;
        }
        painel.conexao.enviar(texto);
      }
    }
  }

  private paraInscritos(corridaId: string, mensagem: MensagemPainelSaida): void {
    const texto = JSON.stringify(mensagem);
    for (const painel of this.paineis) {
      if (painel.corridas.has(corridaId)) painel.conexao.enviar(texto);
    }
  }

  private paraAoVivo(mensagem: MensagemPainelSaida): void {
    const texto = JSON.stringify(mensagem);
    for (const painel of this.paineis) {
      if (painel.aoVivo) painel.conexao.enviar(texto);
    }
  }

  private enviar(painel: Painel, mensagem: MensagemPainelSaida): void {
    painel.conexao.enviar(JSON.stringify(mensagem));
  }
}

// -----------------------------------------------------------------------------
// Formatação para o contrato do painel (protocolo/tipos.ts, "Backend → Painel")
// -----------------------------------------------------------------------------

/** Métricas do domínio → métricas do painel (valores atuais). */
export function metricasParaPainel(m: MetricasDominio): Metricas {
  return {
    tempo_decorrido_ms: m.tempoDecorridoMs,
    tempo_conclusao_ms: m.tempoConclusaoMs,
    celulas_percorridas: m.transicoes,
    distancia_m: m.distanciaM,
    velocidade_media_mps: m.velocidadeMediaMps,
    tensao_v: m.tensaoFinalV,
    corrente_a: m.correnteA,
    potencia_w: m.potenciaW,
    carga_estimada_pct: m.cargaFinalPct,
    delta_v: m.deltaV,
  };
}

function snapshot(estado: EstadoAoVivo): MensagemPainelSaida {
  return {
    tipo: 'snapshot',
    corrida: estado.corridaId,
    labirinto: estado.labirinto,
    sequencia_corte: estado.sequenciaCorte,
    mapa: estado.mapa.celulas.map((c) => ({ x: c.x, y: c.y, paredes: copiar(c.paredes) })),
    posicao: estado.mapa.posicao
      ? {
          x: estado.mapa.posicao.x,
          y: estado.mapa.posicao.y,
          orientacao: estado.mapa.posicao.orientacao as Orientacao,
        }
      : null,
    metricas: metricasParaPainel(estado.metricas),
    status: estado.status,
    motivo_termino: estado.motivo,
    tempo_inicio_ms: estado.tempoInicioMs,
  };
}

function aoVivo(
  corridaId: string,
  estado: Pick<EstadoAoVivo, 'labirinto' | 'status'>,
): MensagemPainelSaida {
  return {
    tipo: 'ao_vivo',
    corrida: corridaId,
    labirinto: estado.labirinto,
    status: estado.status,
  };
}

function copiar(paredes: ParedesCelula): ParedesCelula {
  return { ...paredes };
}
