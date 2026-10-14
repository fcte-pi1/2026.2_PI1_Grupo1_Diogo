// Contrato provisório da listagem GET /api/corridas.
// Mantido no frontend para que esta alteração não modifique arquivos do backend.
// Quando o contrato for publicado pelo backend, este arquivo poderá ser removido.

import type { MotivoTermino, StatusCorrida, TipoLabirinto } from '@protocolo';

export interface FiltrosListaCorridas {
  tipo?: TipoLabirinto;
  status?: StatusCorrida;
  de?: string;
  ate?: string;
  pagina?: number;
  tamanho?: number;
}

export interface CorridaResumo {
  id: string;
  iniciada_em: string;
  tipo_labirinto: TipoLabirinto | null;
  numero_tentativa: number;
  status: StatusCorrida;
  motivo_termino: MotivoTermino | null;
  tempo_conclusao_ms: number | null;
  anulada: boolean;
}

export interface RespostaListaCorridas {
  itens: CorridaResumo[];
  total: number;
  pagina: number;
  tamanho: number;
}

export const TAMANHO_PAGINA_PADRAO = 20;
export const TAMANHO_PAGINA_MAXIMO = 100;
