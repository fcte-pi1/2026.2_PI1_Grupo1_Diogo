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
  /** Chegada (`performance.now()`) das retidas, até serem aplicadas (RNF-48, CT-BE-32). */
  recebidasEm: Map<number, number>;
  /**
   * Um `fim_corrida` já foi aceito (talvez ainda não aplicado): outro é rejeitado com
   * CORRIDA_FINALIZADA, mesmo antes de o primeiro mudar o status (CT-BE-20).
   */
  fimRecebido: boolean;
  /**
   * Sequências reaplicadas do banco na reconstrução e ainda não aplicadas (esperando uma
   * lacuna): quando forem aplicadas, os efeitos são regravados, mas não publicados.
   */
  reconstruidas: Set<number>;
  /** Próxima sequência a aplicar à derivação. */
  proximaAplicar: number;
  /** Quando chegou a última mensagem desta corrida, para a interrupção por silêncio (RF-81). */
  ultimaMensagemEm: number;
  /**
   * Quando o sinal foi declarado perdido: na desconexão, o próprio instante; no silêncio com
   * a conexão aberta, a última mensagem + 3 s. `null` enquanto há sinal.
   */
  sinalPerdidoEm: number | null;
  /** Conexões que enviaram duplicata de uma mensagem ainda na fila de gravação. */
  aguardandoGravacao: Set<SessaoRobo>;
  /**
   * Conexões abertas que enviaram mensagens desta corrida. Toda confirmação vai para todas:
   * depois de uma queda, a lacuna pode ser preenchida por uma mensagem que veio pela conexão
   * antiga, e a conexão nova também precisa do ack atualizado (RF-74, CT-BE-04).
   */
  sessoes: Set<SessaoRobo>;
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
  /** A conexão fechou: não recebe mais acks. */
  encerrada = false;
  readonly acksPendentes = new Set<EstadoCorrida>();
  /**
   * Corridas em cujo `sessoes` esta conexão entrou. No fechamento, ela sai de todas: uma
   * corrida que já terminou não grava mais nada e, sem isso, seguraria a sessão (e o socket,
   * pelo `enviarAck`) enquanto estiver carregada em memória.
   */
  readonly corridas = new Set<EstadoCorrida>();

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
