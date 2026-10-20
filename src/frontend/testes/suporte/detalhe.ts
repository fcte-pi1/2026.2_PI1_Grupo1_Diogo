import type { DetalheCorrida, MetricasCorrida, PassagemCorrida } from '@protocolo';

/**
 * Fábricas do detalhe de uma execução (`GET /api/corridas/:id`). Os mocks são tipados pelo
 * `DetalheCorrida` publicado em `@protocolo`: se o contrato mudar, o typecheck dos testes quebra.
 */
export const ID_DETALHE = '0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33';

type LeituraEnergia = DetalheCorrida['energia'][number];

/** `ordem` acompanha a `sequencia` (posição no trajeto), a menos que `parcial` diga o contrário. */
export function passagem(
  sequencia: number,
  x: number,
  y: number,
  paredes: Partial<PassagemCorrida['paredes']> = {},
  parcial: Partial<PassagemCorrida> = {},
): PassagemCorrida {
  return {
    sequencia,
    ordem: sequencia,
    x,
    y,
    paredes: { norte: false, leste: false, sul: false, oeste: false, ...paredes },
    tempo_ms: 12000 + sequencia * 10,
    revisita: false,
    ...parcial,
  };
}

export function metricasCorrida(parcial: Partial<MetricasCorrida> = {}): MetricasCorrida {
  return {
    tempo_decorrido_ms: 94500,
    tempo_conclusao_ms: 94500,
    celulas_percorridas: 45,
    distancia_m: 8.1,
    revisitas: 2,
    velocidade_media_mps: 0.09,
    tensao_inicial_v: 8.3,
    tensao_final_v: 7.9,
    delta_v: 0.4,
    carga_inicial_pct: 95,
    carga_final_pct: 72,
    ...parcial,
  };
}

export function detalheHttp(parcial: Partial<DetalheCorrida> = {}): DetalheCorrida {
  return {
    id: ID_DETALHE,
    corrida_robo: 'r9f3a1c-1',
    iniciada_em: '2026-10-17T14:30:05.000Z',
    encerrada_em: '2026-10-17T14:31:39.500Z',
    tipo_labirinto: '8x4',
    numero_tentativa: null,
    status: 'CONCLUIDA',
    motivo_termino: 'SUCESSO',
    detalhe_termino: null,
    tempo_conclusao_ms: 94500,
    anulada: false,
    ultima_sequencia_contigua: 2,
    sequencias_faltantes: 0,
    metricas: metricasCorrida(),
    // Fora de ordem de propósito: o detalhe deve ordenar por `sequencia`.
    trajeto: [passagem(2, 0, 2, { leste: true }), passagem(1, 0, 3, { oeste: true, sul: true })],
    energia: [],
    anulacao: null,
    ...parcial,
  };
}

/** `quantidade` leituras a 10 Hz (100 ms), com a tensão caindo de 8,4 V a 7,6 V. */
export function amostrasEnergia(quantidade: number): LeituraEnergia[] {
  return Array.from({ length: quantidade }, (_, i) => ({
    sequencia: i + 1,
    tempo_ms: 1000 + i * 100,
    tensao_v: 8.4 - (0.8 * i) / Math.max(quantidade - 1, 1),
    corrente_a: 0.5,
    potencia_w: 4,
  }));
}
