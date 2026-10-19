import type { CelulaMapa, CorridaResumo, Metricas } from '@protocolo';

// Contrato de GET /api/corridas/:id (detalhe de uma execução do histórico, HU-FE-11).
// Mesma convenção da listagem (snake_case). Enquanto o backend não publicar este contrato em
// @protocolo, ele fica aqui; quando publicar, apague este arquivo e a linha em ./index.ts.

export interface PontoTrajetoHttp {
  /** Ordem da passagem pela célula (mesma `sequencia` do evento de célula). */
  sequencia: number;
  x: number;
  y: number;
}

export interface AmostraEnergiaHttp {
  tempo_ms: number | null;
  tensao_v: number;
  corrente_a: number;
  potencia_w: number;
  carga_estimada_pct: number | null;
}

export interface DetalheCorridaHttp {
  id: string;
  /** Instante de início, ISO 8601 (UTC). */
  iniciada_em: string;
  tipo_labirinto: string;
  status: CorridaResumo['status'];
  motivo_termino: string | null;
  detalhe: string | null;
  metricas: Metricas | null;
  mapa: CelulaMapa[];
  trajeto: PontoTrajetoHttp[];
  energia: AmostraEnergiaHttp[];
}
