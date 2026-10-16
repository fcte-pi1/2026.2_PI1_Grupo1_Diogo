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
    sequencia: number | null;
    metricas: Metricas;
  };
  'alerta-tensao': { corridaId: string; tensaoV: number };
}

export interface PublicadorEventos {
  publicar<K extends keyof MapaEventos>(evento: K, dados: MapaEventos[K]): void;
}
