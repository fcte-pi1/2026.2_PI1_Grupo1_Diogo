/**
 * Estado vivo em memória, compartilhado pelo ServicoIngestao e pelo ServicoCorrida.
 * Só o event loop acessa estes objetos, então não há concorrência entre threads.
 */
import type { DerivacaoCorrida, SequenciaCorrida, TipoLabirinto } from '../dominio/index.js';
import type { Ack, MensagemCorrida } from '../../protocolo/tipos.js';

/** Uma corrida carregada em memória. */
export interface EstadoCorrida {
  id: string;
  dispositivoId: string;
  idRobo: string;
  /** `boot` do robô quando a corrida foi criada: um `boot` diferente indica reinício. */
  boot: string;
  /** Tipo de labirinto para as regras de domínio; `null` até o `inicio_corrida` chegar. */
  labirinto: TipoLabirinto | null;
  /** Idempotência e confirmação cumulativa (RF-74, RF-77). */
  sequencias: SequenciaCorrida;
  /** Métricas, status, trajeto e energia (RF-80 a RF-87). */
  derivacao: DerivacaoCorrida;
  /** Mensagens gravadas que esperam uma lacuna anterior ser preenchida para serem aplicadas. */
  retidas: Map<number, MensagemCorrida>;
  /** Próxima sequência a aplicar à derivação. */
  proximaAplicar: number;
  /** Quando chegou a última mensagem desta corrida, para a interrupção por silêncio (RF-81). */
  ultimaMensagemEm: number;
  /** Conexões que enviaram duplicata de uma mensagem ainda na fila de gravação. */
  aguardandoGravacao: Set<SessaoRobo>;
  /** Garante que os efeitos de uma corrida sejam gravados na ordem em que foram gerados. */
  efeitos: Promise<void>;
  temporizadorLacuna: ReturnType<typeof setTimeout> | null;
  progressoGravadoEm: number;
  temporizadorProgresso: ReturnType<typeof setTimeout> | null;
}

/** Uma conexão autenticada de um robô (ou do simulador, ou da ponte). */
export class SessaoRobo {
  /** Corrida em andamento nesta conexão: é a que o monitor de sinal acompanha. */
  corridaAtiva: EstadoCorrida | null = null;
  ultimaMensagemEm: number;
  sinalPerdido = false;
  readonly acksPendentes = new Set<EstadoCorrida>();

  constructor(
    readonly dispositivoId: string,
    readonly identificador: string,
    /** Muda quando o robô reinicia e se identifica de novo na mesma conexão. */
    public boot: string,
    public versaoProtocolo: number,
    /** Envia uma confirmação ao robô. É informativa: o robô pode ignorá-la. */
    readonly enviarAck: (ack: Ack) => void,
    agora: number,
  ) {
    this.ultimaMensagemEm = agora;
  }
}
