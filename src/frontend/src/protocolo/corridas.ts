// Tipos da resposta de GET /api/corridas (listagem do histórico).
// Ficam no frontend porque o backend ainda não publica este contrato em @protocolo;
// quando publicar, apague este arquivo e a linha correspondente em ./index.ts.

/** Resumo de uma corrida na listagem do histórico. */
export interface CorridaResumo {
  id: number;
  /** Instante de início da corrida, ISO 8601 (UTC). */
  iniciadaEm: string;
  labirinto: '4x4' | '8x4' | '12x4';
  /** Tempo oficial de execução em ms; `null` se a corrida não registrou tempo. */
  tempoMs: number | null;
  status: 'EM_ANDAMENTO' | 'CONCLUIDA' | 'FALHOU' | 'INTERROMPIDA';
}

/** Resposta paginada de `GET /api/corridas?labirinto=&pagina=&tamanhoPagina=`. */
export interface RespostaListaCorridas {
  itens: CorridaResumo[];
  /** Total de corridas que satisfazem o filtro (todas as páginas). */
  total: number;
  pagina: number;
  tamanhoPagina: number;
}
