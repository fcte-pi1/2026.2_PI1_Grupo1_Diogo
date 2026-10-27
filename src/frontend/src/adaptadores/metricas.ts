import type { DadosExecucao } from '../dominio';
import type { Metricas, MetricasCorrida } from '../protocolo';

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

/** Só os valores presentes: `null` e `undefined` não sobrescrevem o que já estava na tela. */
function definidos<T extends object>(valores: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(valores).filter(([, valor]) => valor !== null && valor !== undefined),
  ) as Partial<T>;
}

/**
 * Métricas de uma corrida gravada (`MetricasCorrida`, detalhe do histórico) → dados da tela.
 * Diferente do canal ao vivo, o histórico traz a tensão e a carga **finais** da tentativa; a
 * corrente e a potência não vêm aqui (saem da última amostra de energia).
 */
export function dadosDasMetricasCorrida(
  metricas: MetricasCorrida | null | undefined,
): Partial<DadosExecucao> {
  if (!metricas) return {};
  // O tempo oficial é o de conclusão (relógio do robô, RF-82); sem ele, o decorrido.
  const tempo = metricas.tempo_conclusao_ms ?? metricas.tempo_decorrido_ms;
  return definidos({
    celulasPercorridas: metricas.celulas_percorridas,
    distanciaM: metricas.distancia_m,
    velocidadeMediaMps: metricas.velocidade_media_mps,
    deltaV: metricas.delta_v,
    tensaoV: metricas.tensao_final_v,
    cargaPct: metricas.carga_final_pct,
    tempoMs: tempo,
  });
}
