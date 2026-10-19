import type { DadosExecucao } from '../dominio';
import type { Metricas } from '../protocolo';

/**
 * Métricas derivadas pelo backend → dados da tela. O tempo vem do backend (relógio oficial,
 * RF-82): `tempo_conclusao_ms` quando a corrida terminou com sucesso, senão o decorrido.
 * Compartilhado pelo canal ao vivo (WebSocket) e pelo detalhe do histórico (HTTP).
 */
export function dadosDasMetricas(metricas: Metricas | null | undefined): Partial<DadosExecucao> {
  if (!metricas) return {};
  const tempo = metricas.tempo_conclusao_ms ?? metricas.tempo_decorrido_ms;
  return {
    celulasPercorridas: metricas.celulas_percorridas,
    distanciaM: metricas.distancia_m,
    velocidadeMediaMps: metricas.velocidade_media_mps,
    tensaoV: metricas.tensao_v,
    correnteA: metricas.corrente_a,
    potenciaW: metricas.potencia_w,
    cargaPct: metricas.carga_estimada_pct,
    deltaV: metricas.delta_v,
    ...(tempo !== null && tempo !== undefined ? { tempoMs: tempo } : {}),
  };
}
