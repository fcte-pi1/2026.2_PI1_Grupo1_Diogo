import type { AmostraEnergiaHttp, DetalheCorridaHttp } from '../../src/protocolo';
import { celulaMapa, metricas } from './mensagens';

/** Fábricas do detalhe de uma execução (`GET /api/corridas/:id`), no contrato snake_case. */
export const ID_DETALHE = '0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33';

export function detalheHttp(parcial: Partial<DetalheCorridaHttp> = {}): DetalheCorridaHttp {
  return {
    id: ID_DETALHE,
    iniciada_em: '2026-10-17T14:30:05.000Z',
    tipo_labirinto: '8x4',
    status: 'CONCLUIDA',
    motivo_termino: 'SUCESSO',
    detalhe: null,
    metricas: metricas({
      tempo_conclusao_ms: 94500,
      celulas_percorridas: 45,
      distancia_m: 8.1,
      velocidade_media_mps: 0.09,
      tensao_v: 7.9,
      corrente_a: 0.5,
      potencia_w: 3.95,
      carga_estimada_pct: 72,
      delta_v: 0.4,
    }),
    mapa: [celulaMapa(0, 3, { oeste: true, sul: true })],
    // Fora de ordem de propósito: o detalhe deve ordenar por `sequencia`.
    trajeto: [
      { sequencia: 2, x: 0, y: 2 },
      { sequencia: 1, x: 0, y: 3 },
    ],
    energia: [],
    ...parcial,
  };
}

/** `quantidade` amostras a 10 Hz (100 ms), com a tensão caindo de 8,4 V a 7,6 V. */
export function amostrasEnergia(quantidade: number): AmostraEnergiaHttp[] {
  return Array.from({ length: quantidade }, (_, i) => ({
    tempo_ms: 1000 + i * 100,
    tensao_v: 8.4 - (0.8 * i) / Math.max(quantidade - 1, 1),
    corrente_a: 0.5,
    potencia_w: 4,
    carga_estimada_pct: 100,
  }));
}
