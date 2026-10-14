import { celulaDentroDoLabirinto, type TipoLabirinto } from './labirinto.js';
import type { SequenciaCorrida } from './sequencia-corrida.js';

/** Faixa de tensão fisicamente possível para a bateria do robô (RF-76). */
export const TENSAO_MINIMA_V = 5.0;
export const TENSAO_MAXIMA_V = 9.0;

export type CodigoRegra =
  'COORDENADA_FORA_DO_LABIRINTO' | 'TENSAO_FORA_DA_FAIXA' | 'TEMPO_REGRESSIVO';

export interface ViolacaoRegra {
  codigo: CodigoRegra;
  detalhe: string;
}

/** Campos de uma mensagem que as regras de domínio examinam. */
export interface DadosParaRegras {
  tipo: string;
  sequencia: number;
  tempo_ms: number;
  x?: number;
  y?: number;
  tensao_v?: number;
}

/**
 * Regras de domínio (RF-76): rejeita dados fisicamente impossíveis. A forma da mensagem
 * já foi validada pelo esquema do protocolo antes de chegar aqui.
 */
export function verificarRegras(
  dados: DadosParaRegras,
  labirinto: TipoLabirinto | null,
  sequencias: SequenciaCorrida,
): ViolacaoRegra | null {
  if (dados.x !== undefined && dados.y !== undefined) {
    if (!celulaDentroDoLabirinto(labirinto, dados.x, dados.y)) {
      return {
        codigo: 'COORDENADA_FORA_DO_LABIRINTO',
        detalhe: `(${dados.x}, ${dados.y}) não existe no labirinto ${labirinto ?? 'ainda desconhecido'}`,
      };
    }
  }
  if (dados.tensao_v !== undefined) {
    if (dados.tensao_v < TENSAO_MINIMA_V || dados.tensao_v > TENSAO_MAXIMA_V) {
      return {
        codigo: 'TENSAO_FORA_DA_FAIXA',
        detalhe: `${dados.tensao_v} V está fora de ${TENSAO_MINIMA_V} a ${TENSAO_MAXIMA_V} V`,
      };
    }
  }
  if (!sequencias.tempoCoerente(dados.sequencia, dados.tempo_ms)) {
    return {
      codigo: 'TEMPO_REGRESSIVO',
      detalhe: `tempo_ms ${dados.tempo_ms} contradiz as sequências vizinhas da ${dados.sequencia}`,
    };
  }
  return null;
}
