/**
 * Tipos do protocolo de telemetria v1 (arquitetura do backend, §2.5).
 * Compartilhados com o simulador e com o frontend (alias `@protocolo`).
 *
 * ATENÇÃO: este arquivo não pode importar nada — ele é compilado tanto pelo backend
 * quanto pelo bundler do frontend.
 *
 * As mensagens do robô e do painel para o backend são validadas pelos esquemas JSON em
 * `protocolo/v1/` (fonte da verdade, RNF-57). Mantenha os dois em sincronia: o teste
 * `testes/unit/protocolo/validador.test.ts` falha se um exemplo tipado aqui não passar
 * no esquema. Convenções (coordenadas, paredes, tempo) em `protocolo/v1/README.md`.
 */

export const VERSAO_PROTOCOLO = 1 as const;

/** Versões aceitas pelo backend: a atual e a anterior (RNF-57). */
export const VERSOES_SUPORTADAS: readonly number[] = [1];

export type TipoLabirinto = '4x4' | '8x4' | '12x4';

/** Norte, Leste, Sul, Oeste. */
export type Orientacao = 'N' | 'L' | 'S' | 'O';

/** Presença de parede em cada lado da célula. */
export interface Paredes {
  n: boolean;
  l: boolean;
  s: boolean;
  o: boolean;
}

export type EstadoNavegacao =
  'INICIALIZANDO' | 'AGUARDANDO' | 'MAPEANDO' | 'RESOLVENDO' | 'CONCLUIDO' | 'ERRO';

export type StatusCorrida = 'EM_ANDAMENTO' | 'CONCLUIDA' | 'FALHOU' | 'INTERROMPIDA';

export type MotivoTermino = 'SUCESSO' | 'FALHA_REPORTADA' | 'SEM_SINAL' | 'REINICIO_ROBO';

// ============================================================================
// Robô → Backend (/ws/telemetria)
// ============================================================================

export interface Hello {
  tipo: 'hello';
  v: typeof VERSAO_PROTOCOLO;
  dispositivo: string;
  token: string;
  /** Valor aleatório gerado a cada boot do ESP32. */
  boot: string;
}

/** Envelope comum a todas as mensagens do robô, exceto `hello`. */
export interface Envelope<T extends string> {
  v: typeof VERSAO_PROTOCOLO;
  tipo: T;
  /** Id da corrida gerado pelo robô (letras, dígitos, `_` e `-`; até 64 caracteres). */
  corrida: string;
  /** Inteiro ≥ 1, crescente por corrida. */
  seq: number;
  /** Milissegundos no relógio do robô (relógio oficial, RF-82). */
  t: number;
}

export interface InicioCorrida extends Envelope<'inicio_corrida'> {
  labirinto: TipoLabirinto;
}

/** Célula visitada com as paredes detectadas (evento discreto). */
export interface Celula extends Envelope<'celula'> {
  x: number;
  y: number;
  paredes: Paredes;
}

/** Posição atual (dado contínuo). */
export interface Posicao extends Envelope<'posicao'> {
  x: number;
  y: number;
  orientacao: Orientacao;
  /** Contador de células percorridas. */
  celulas: number;
  /** Informativo: a velocidade oficial é derivada pelo backend (RF-83). */
  velocidade_media_mps?: number;
}

/** Leitura do INA219 (dado contínuo). */
export interface Energia extends Envelope<'energia'> {
  tensao_v: number;
  corrente_a: number;
  potencia_w: number;
}

/** Estado de navegação, enviado a cada transição (evento discreto). */
export interface Estado extends Envelope<'estado'> {
  estado: EstadoNavegacao;
}

export interface FimCorrida extends Envelope<'fim_corrida'> {
  resultado: 'sucesso' | 'falha';
  detalhe?: string;
}

export type MensagemCorrida = InicioCorrida | Celula | Posicao | Energia | Estado | FimCorrida;

export type MensagemRobo = Hello | MensagemCorrida;

export type TipoMensagemRobo = MensagemCorrida['tipo'];

export const TIPOS_MENSAGEM_ROBO: readonly TipoMensagemRobo[] = [
  'inicio_corrida',
  'celula',
  'posicao',
  'energia',
  'estado',
  'fim_corrida',
];

// ============================================================================
// Backend → Robô
// ============================================================================

/** Confirmação cumulativa. Informativa: o robô não é obrigado a processá-la (RF-74). */
export interface Ack {
  tipo: 'ack';
  corrida: string;
  /** Maior seq contíguo gravado. */
  seq: number;
}

/** Códigos de fechamento enviados ao robô. */
export const CodigoFechamento = {
  TOKEN_INVALIDO: 4001,
  VERSAO_NAO_SUPORTADA: 4002,
} as const;

// ============================================================================
// Painel → Backend (/ws/painel) — somente leitura (RNF-55)
// ============================================================================

export type MensagemPainelEntrada =
  | { tipo: 'inscrever' | 'cancelar'; corrida: string }
  | { tipo: 'inscrever' | 'cancelar'; canal: 'ao_vivo' };

// ============================================================================
// Backend → Painel (/ws/painel)
// ============================================================================
// `corrida` aqui é sempre o id (UUID) da corrida no backend, não o id gerado pelo robô.

/** Métricas derivadas pelo backend. `null` quando ainda não há amostra (nunca 0 por omissão). */
export interface Metricas {
  tempo_decorrido_ms: number | null;
  /** Definido só quando a corrida termina com sucesso (RF-82). */
  tempo_conclusao_ms: number | null;
  celulas_percorridas: number;
  distancia_m: number;
  velocidade_media_mps: number | null;
  tensao_v: number | null;
  corrente_a: number | null;
  potencia_w: number | null;
  carga_estimada_pct: number | null;
  delta_v: number | null;
}

export interface CelulaMapa {
  x: number;
  y: number;
  paredes: Paredes;
}

export interface PosicaoRobo {
  x: number;
  y: number;
  orientacao: Orientacao;
}

/** Estado completo na entrada do painel ou na reconexão (RF-89). Substitui, não mescla. */
export interface SnapshotPainel {
  tipo: 'snapshot';
  corrida: string;
  labirinto: TipoLabirinto;
  /** Eventos com seq ≤ seq_corte já estão refletidos neste snapshot. */
  seq_corte: number;
  /** Células conhecidas, com as paredes detectadas. */
  mapa: CelulaMapa[];
  posicao: PosicaoRobo | null;
  metricas: Metricas;
  status: StatusCorrida;
  motivo_termino: MotivoTermino | null;
  /** Tempo do robô no início da corrida, âncora do cronômetro do painel. */
  t_inicio: number;
}

export interface EventoCelulaPainel {
  tipo: 'evento';
  evento: 'celula';
  corrida: string;
  seq: number;
  t: number;
  x: number;
  y: number;
  paredes: Paredes;
  revisita: boolean;
  metricas: Metricas;
}

export interface EventoStatusPainel {
  tipo: 'evento';
  evento: 'status';
  corrida: string;
  seq: number;
  t: number;
  status: StatusCorrida;
  motivo_termino: MotivoTermino | null;
  detalhe: string | null;
  metricas: Metricas;
}

/** Última posição e energia, no máximo 10/s por corrida (RF-90). */
export interface ContinuoPainel {
  tipo: 'continuo';
  corrida: string;
  t: number;
  posicao: PosicaoRobo | null;
  energia: { tensao_v: number; corrente_a: number; potencia_w: number } | null;
  metricas: Metricas;
}

export interface SinalPainel {
  tipo: 'sinal';
  corrida: string;
  estado: 'PERDIDO' | 'RETOMADO';
}

export interface AlertaPainel {
  tipo: 'alerta';
  corrida: string;
  alerta: 'TENSAO_BAIXA';
  tensao_v: number;
}

/** Resumo de início, fim e status de qualquer corrida (canal `ao_vivo`). */
export interface AoVivoPainel {
  tipo: 'ao_vivo';
  corrida: string;
  labirinto: TipoLabirinto;
  status: StatusCorrida;
}

export interface LeaderboardPainel {
  tipo: 'leaderboard';
  labirinto: TipoLabirinto;
}

/**
 * Enviada a cada 1 s, também fora das corridas, para o watchdog de conexão do painel
 * (a API WebSocket do navegador não expõe ping/pong).
 */
export interface KeepalivePainel {
  tipo: 'keepalive';
}

export type MensagemPainelSaida =
  | SnapshotPainel
  | EventoCelulaPainel
  | EventoStatusPainel
  | ContinuoPainel
  | SinalPainel
  | AlertaPainel
  | AoVivoPainel
  | LeaderboardPainel
  | KeepalivePainel;
