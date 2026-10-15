/**
 * Eventos que a aplicação publica no barramento em memória (arquitetura do backend, §2.2).
 * A distribuição aos painéis (#327) assina estes eventos.
 */
import type { Metricas, MotivoTermino, StatusCorrida, TipoLabirinto } from '../dominio/index.js';
import type { MensagemCorrida } from '../../protocolo/tipos.js';

export interface MapaEventos {
  /** Uma mensagem foi aplicada ao estado da corrida, em ordem de sequência. */
  'mensagem-aplicada': {
    corridaId: string;
    labirinto: TipoLabirinto | null;
    mensagem: MensagemCorrida;
    revisita: boolean;
    metricas: Metricas;
  };
  'status-alterado': {
    corridaId: string;
    labirinto: TipoLabirinto | null;
    status: StatusCorrida;
    motivo: MotivoTermino | null;
    detalhe: string | null;
    /** `null` numa interrupção, que não vem de uma mensagem do robô. */
    sequencia: number | null;
    tempoMs: number | null;
    metricas: Metricas;
  };
  'alerta-tensao': { corridaId: string; tensaoV: number };
  /**
   * Uma corrida CONCLUIDA teve o encerramento gravado: o ranking do labirinto pode ter
   * mudado (RF-95). Sai depois da gravação, e não junto com o `status-alterado`, para quem
   * consultar o ranking ao receber o aviso já encontrar a corrida no banco.
   */
  'ranking-alterado': { corridaId: string; labirinto: TipoLabirinto };
  /** O robô parou de enviar durante a corrida, ou voltou (RF-73, RF-92). */
  'sinal-alterado': { corridaId: string; estado: 'PERDIDO' | 'RETOMADO' };
}

export interface PublicadorEventos {
  publicar<K extends keyof MapaEventos>(evento: K, dados: MapaEventos[K]): void;
}
