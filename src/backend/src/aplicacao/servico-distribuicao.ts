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
import type { RegistroLatencia, RegistroLog } from './portas.js';
import type { EstadoAoVivo } from './servico-corrida.js';

/** No máximo 10 atualizações contínuas por segundo por corrida (RF-90). */
export const INTERVALO_CONTINUO_MS = 100;
/** Acima disso no buffer de envio, o painel deixa de receber contínuos (RF-91). */
export const LIMITE_BUFFER_BYTES = 1024 * 1024;
/** Tempo acima do limite para o painel ser desconectado (RF-91, CA2). */
export const PRAZO_PAINEL_LENTO_MS = 10_000;
/** Código de fechamento para o painel lento: "tente de novo mais tarde". */
export const FECHAMENTO_PAINEL_LENTO = 1013;
/** Mensagem do log quando um painel lento é desconectado (o CT-BE-24 a procura). */
export const AVISO_PAINEL_LENTO = 'painel lento desconectado';

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
  /** Latência da recepção ao envio (RNF-48, CT-BE-32). Sem ela, nada é medido. */
  latencia?: RegistroLatencia;
  /**
   * Relógio monotônico, o mesmo da `recebidaEm` dos eventos (`performance.now()`), já que a
   * latência é a diferença entre os dois.
   */
  agora?: () => number;
  intervaloContinuoMs?: number;
  limiteBufferBytes?: number;
  prazoPainelLentoMs?: number;
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
  /** Chegada da mensagem mais recente que o contínuo leva (RNF-48). */
  recebidaEm: number | undefined;
  /** Quando essa mensagem ficou pronta para sair: gravada, aplicada e publicada (RNF-48). */
  aplicadaEm: number;
}

export class ServicoDistribuicao {
  private readonly paineis = new Set<Painel>();
  /** Último estado contínuo conhecido de cada corrida: cada envio leva posição e energia. */
  private readonly continuos = new Map<string, ContinuoPendente>();
  /** Corridas com estado contínuo novo, ainda não enviado. */
  private readonly pendentes = new Set<string>();
  private readonly ultimoContinuoEm = new Map<string, number>();
  private readonly temporizadores = new Map<string, ReturnType<typeof setTimeout>>();
  /** Corridas já anunciadas no canal `ao_vivo`. */
  private readonly anunciadas = new Set<string>();
  /** Corridas finalizadas: o estado contínuo é descartado depois do último envio. */
  private readonly finalizadas = new Set<string>();
  private readonly agora: () => number;
  private readonly intervaloContinuoMs: number;
  private readonly limiteBufferBytes: number;
  private readonly prazoPainelLentoMs: number;

  constructor(private readonly deps: DependenciasDistribuicao) {
    // Relógio monotônico: o de parede pode ser ajustado e encurtar o intervalo de 100 ms.
    this.agora = deps.agora ?? (() => performance.now());
    this.intervaloContinuoMs = deps.intervaloContinuoMs ?? INTERVALO_CONTINUO_MS;
    this.limiteBufferBytes = deps.limiteBufferBytes ?? LIMITE_BUFFER_BYTES;
    this.prazoPainelLentoMs = deps.prazoPainelLentoMs ?? PRAZO_PAINEL_LENTO_MS;
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
        if (agora - painel.lentoDesde >= this.prazoPainelLentoMs) {
          this.deps.log.warn({ bytes: painel.conexao.bytesPendentes() }, AVISO_PAINEL_LENTO);
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
    if (!this.anunciadas.has(corridaId)) {
      // Na primeira mensagem aplicada, que normalmente é o `inicio_corrida`. Se ele se perdeu
      // numa lacuna, a corrida é anunciada mesmo assim, com o labirinto que se souber. Um
      // lote tardio de uma corrida interrompida não a anuncia de novo: a mudança de status
      // dela já vai para o canal.
      this.anunciadas.add(corridaId);
      const status = this.deps.corridas.estadoAoVivo(corridaId)?.status ?? 'EM_ANDAMENTO';
      const labirinto = mensagem.tipo === 'inicio_corrida' ? mensagem.labirinto : dados.labirinto;
      if (status === 'EM_ANDAMENTO') this.paraAoVivo(aoVivo(corridaId, { labirinto, status }));
    }
    switch (mensagem.tipo) {
      case 'celula': {
        const enviados = this.paraInscritos(corridaId, {
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
        if (enviados > 0) this.medirLatencia('evento', dados.recebidaEm);
        return;
      }
      case 'posicao':
        this.acumularContinuo(corridaId, mensagem.tempo_ms, metricas, dados.recebidaEm, {
          posicao: { x: mensagem.x, y: mensagem.y, orientacao: mensagem.orientacao },
        });
        return;
      case 'energia':
        this.acumularContinuo(corridaId, mensagem.tempo_ms, metricas, dados.recebidaEm, {
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
    // Sem volta: CONCLUIDA, FALHOU e a interrupção por reinício do robô. A interrupção por
    // silêncio ainda pode ser concluída por um lote tardio, então o estado dela fica.
    const definitiva =
      dados.status === 'CONCLUIDA' ||
      dados.status === 'FALHOU' ||
      (dados.status === 'INTERROMPIDA' && dados.motivo === 'REINICIO_ROBO');
    if (definitiva) this.finalizadas.add(corridaId);
    this.anunciadas.delete(corridaId);
    // O último contínuo pendente sai antes do status, para a tela terminar coerente. Se o
    // anterior saiu há menos de 100 ms, ele sai logo depois do status, sem passar de 10/s.
    // Por isso ele passa a levar as métricas do status: senão, chegaria depois com as de
    // antes do fim (sem o tempo oficial, por exemplo) e a tela voltaria atrás.
    const pendente = this.continuos.get(corridaId);
    if (pendente && this.pendentes.has(corridaId)) {
      pendente.metricas = metricasParaPainel(dados.metricas);
    }
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
    recebidaEm: number | undefined,
    novo: Partial<Pick<ContinuoPendente, 'posicao' | 'energia'>>,
  ): void {
    const anterior = this.continuos.get(corridaId) ?? this.continuoInicial(corridaId);
    this.continuos.set(corridaId, {
      tempoMs,
      metricas,
      recebidaEm,
      aplicadaEm: this.agora(),
      posicao: novo.posicao ?? anterior?.posicao ?? null,
      energia: novo.energia ?? anterior?.energia ?? null,
    });
    this.pendentes.add(corridaId);
    if (!this.temporizadores.has(corridaId)) this.descarregarContinuo(corridaId);
  }

  /**
   * Sem contínuo anterior neste processo (corrida nova, ou recuperada depois de um reinício
   * do backend), a posição e a energia vêm do estado da corrida: o primeiro contínuo não sai
   * com um dos dois nulo se ele já é conhecido.
   */
  private continuoInicial(
    corridaId: string,
  ): Pick<ContinuoPendente, 'posicao' | 'energia'> | undefined {
    const estado = this.deps.corridas.estadoAoVivo(corridaId);
    if (!estado) return undefined;
    const { posicao } = estado.mapa;
    const { tensaoFinalV, correnteA, potenciaW } = estado.metricas;
    return {
      posicao: posicao
        ? { x: posicao.x, y: posicao.y, orientacao: posicao.orientacao as Orientacao }
        : null,
      energia:
        tensaoFinalV !== null && correnteA !== null && potenciaW !== null
          ? { tensao_v: tensaoFinalV, corrente_a: correnteA, potencia_w: potenciaW }
          : null,
    };
  }

  /**
   * Envia o contínuo pendente se já passaram 100 ms do anterior; senão, agenda para quando
   * passarem. O intervalo é conferido de novo quando o temporizador dispara, porque ele pode
   * disparar um pouco antes (RF-90: nunca mais de 10 em 1 s).
   */
  private descarregarContinuo(corridaId: string): void {
    const temporizador = this.temporizadores.get(corridaId);
    if (temporizador) clearTimeout(temporizador);
    this.temporizadores.delete(corridaId);
    const pendente = this.continuos.get(corridaId);
    if (!pendente || !this.pendentes.has(corridaId)) {
      this.limparSeFinalizada(corridaId);
      return;
    }
    const janelaAbreEm =
      (this.ultimoContinuoEm.get(corridaId) ?? -Infinity) + this.intervaloContinuoMs;
    const espera = janelaAbreEm - this.agora();
    if (espera > 0) {
      this.temporizadores.set(
        corridaId,
        setTimeout(() => this.descarregarContinuo(corridaId), espera),
      );
      return;
    }
    this.pendentes.delete(corridaId);
    this.ultimoContinuoEm.set(corridaId, this.agora());

    const texto = JSON.stringify({
      tipo: 'continuo',
      corrida: corridaId,
      tempo_ms: pendente.tempoMs,
      posicao: pendente.posicao,
      energia: pendente.energia,
      metricas: pendente.metricas,
    } satisfies MensagemPainelSaida);
    let enviados = 0;
    for (const painel of this.paineis) {
      // Painel lento perde os contínuos, mas continua recebendo os eventos (RF-91, CA1).
      if (painel.corridas.has(corridaId) && painel.lentoDesde === null) {
        if (painel.conexao.bytesPendentes() > this.limiteBufferBytes) {
          painel.lentoDesde = this.agora();
          continue;
        }
        painel.conexao.enviar(texto);
        enviados++;
      }
    }
    // Latência = (aplicadaEm − recebidaEm) + (envio − max(aplicadaEm, janelaAbreEm)). O
    // processamento até a mensagem ficar pronta (fila, gravação, ordenação) conta sempre. Da
    // espera, só fica de fora a da mensagem JÁ PRONTA aguardando a janela do RF-90, que é
    // proposital; um atraso do temporizador depois da abertura continua contando (RNF-48).
    if (enviados > 0 && pendente.recebidaEm !== undefined) {
      const esperaJanela = Math.max(0, janelaAbreEm - pendente.aplicadaEm);
      this.medirLatencia('continuo', pendente.recebidaEm + esperaJanela);
    }
    this.limparSeFinalizada(corridaId);
  }

  /** Corrida finalizada sem nada pendente: o estado contínuo dela não serve mais. */
  private limparSeFinalizada(corridaId: string): void {
    if (!this.finalizadas.has(corridaId) || this.pendentes.has(corridaId)) return;
    this.finalizadas.delete(corridaId);
    this.continuos.delete(corridaId);
    this.ultimoContinuoEm.delete(corridaId);
  }

  /** Envia aos painéis inscritos na corrida e devolve para quantos. */
  private paraInscritos(corridaId: string, mensagem: MensagemPainelSaida): number {
    const texto = JSON.stringify(mensagem);
    let enviados = 0;
    for (const painel of this.paineis) {
      if (painel.corridas.has(corridaId)) {
        painel.conexao.enviar(texto);
        enviados++;
      }
    }
    return enviados;
  }

  /**
   * Uma amostra por mensagem enviada (e não por painel): o envio aos painéis é um laço
   * síncrono, e a diferença entre eles é desprezível.
   */
  private medirLatencia(tipo: 'evento' | 'continuo', recebidaEm: number | undefined): void {
    if (recebidaEm === undefined || !this.deps.latencia) return;
    this.deps.latencia.registrar(tipo, this.agora() - recebidaEm);
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
    sinal: estado.sinalPerdido ? 'PERDIDO' : 'NORMAL',
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
