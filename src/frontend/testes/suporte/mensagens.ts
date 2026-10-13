import type {
  AoVivoPainel,
  CelulaMapa,
  ContinuoPainel,
  EventoCelulaPainel,
  EventoStatusPainel,
  KeepalivePainel,
  Metricas,
  Paredes,
  SinalPainel,
  SnapshotPainel,
} from '@protocolo';

/** Fábricas de mensagens Backend → Painel, tipadas pelo contrato (`MensagemPainelSaida`). */
export const CORRIDA = 'a1b2c3d4-0000-4000-8000-000000000001';

export const SEM_PAREDES: Paredes = { norte: false, leste: false, sul: false, oeste: false };

export function metricas(parcial: Partial<Metricas> = {}): Metricas {
  return {
    tempo_decorrido_ms: null,
    tempo_conclusao_ms: null,
    celulas_percorridas: 0,
    distancia_m: 0,
    velocidade_media_mps: null,
    tensao_v: null,
    corrente_a: null,
    potencia_w: null,
    carga_estimada_pct: null,
    delta_v: null,
    ...parcial,
  };
}

export function aoVivo(parcial: Partial<AoVivoPainel> = {}): AoVivoPainel {
  return {
    tipo: 'ao_vivo',
    corrida: CORRIDA,
    labirinto: '4x4',
    status: 'EM_ANDAMENTO',
    ...parcial,
  };
}

export function snapshot(parcial: Partial<SnapshotPainel> = {}): SnapshotPainel {
  return {
    tipo: 'snapshot',
    corrida: CORRIDA,
    labirinto: '4x4',
    sequencia_corte: 0,
    mapa: [],
    posicao: null,
    metricas: metricas(),
    status: 'EM_ANDAMENTO',
    motivo_termino: null,
    tempo_inicio_ms: 12000,
    ...parcial,
  };
}

export function celulaMapa(x: number, y: number, paredes: Partial<Paredes> = {}): CelulaMapa {
  return { x, y, paredes: { ...SEM_PAREDES, ...paredes } };
}

export function eventoCelula(
  sequencia: number,
  x: number,
  y: number,
  parcial: Partial<EventoCelulaPainel> = {},
): EventoCelulaPainel {
  return {
    tipo: 'evento',
    evento: 'celula',
    corrida: CORRIDA,
    sequencia,
    tempo_ms: 12000 + sequencia * 10,
    x,
    y,
    paredes: { ...SEM_PAREDES, oeste: true },
    revisita: false,
    metricas: metricas({ celulas_percorridas: 1 }),
    ...parcial,
  };
}

export function eventoStatus(
  status: EventoStatusPainel['status'],
  parcial: Partial<EventoStatusPainel> = {},
): EventoStatusPainel {
  return {
    tipo: 'evento',
    evento: 'status',
    corrida: CORRIDA,
    sequencia: 99,
    tempo_ms: 95500,
    status,
    motivo_termino: status === 'CONCLUIDA' ? 'SUCESSO' : null,
    detalhe: null,
    metricas: metricas(),
    ...parcial,
  };
}

export function continuo(parcial: Partial<ContinuoPainel> = {}): ContinuoPainel {
  return {
    tipo: 'continuo',
    corrida: CORRIDA,
    tempo_ms: 12100,
    posicao: null,
    energia: null,
    metricas: metricas(),
    ...parcial,
  };
}

export function sinal(estado: SinalPainel['estado'], corrida: string = CORRIDA): SinalPainel {
  return { tipo: 'sinal', corrida, estado };
}

export const keepalive: KeepalivePainel = { tipo: 'keepalive' };
