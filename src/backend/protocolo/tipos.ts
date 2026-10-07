/**
 * Tipos do protocolo de telemetria v1 (arquitetura do backend, §2.5).
 * Compartilhados com o simulador e com o frontend (alias `@protocolo`).
 *
 * ATENÇÃO: este arquivo não pode importar nada — ele é compilado tanto pelo backend
 * quanto pelo bundler do frontend.
 *
 * Esqueleto: contém o envelope e os nomes das mensagens. Os campos definitivos
 * dependem do alinhamento com o firmware (pontos em aberto da arquitetura, item 4)
 * e devem acompanhar os esquemas JSON em `protocolo/v1/`.
 */

export const VERSAO_PROTOCOLO = 1 as const;

export type TipoLabirinto = '4x4' | '8x4' | '12x4';

export type StatusCorrida = 'EM_ANDAMENTO' | 'CONCLUIDA' | 'FALHOU' | 'INTERROMPIDA';

export type MotivoTermino = 'SUCESSO' | 'FALHA_REPORTADA' | 'SEM_SINAL' | 'REINICIO_ROBO';

// ---------- Robô → Backend (/ws/telemetria) ----------

export type TipoMensagemRobo =
  'inicio_corrida' | 'celula' | 'posicao' | 'energia' | 'estado' | 'fim_corrida';

/** Envelope comum a todas as mensagens do robô, exceto `hello`. */
export interface Envelope<T extends TipoMensagemRobo = TipoMensagemRobo> {
  v: typeof VERSAO_PROTOCOLO;
  tipo: T;
  /** Id da corrida gerado pelo robô. */
  corrida: string;
  /** Inteiro ≥ 1, crescente por corrida. */
  seq: number;
  /** Milissegundos no relógio do robô (relógio oficial, RF-82). */
  t: number;
}

export interface Hello {
  tipo: 'hello';
  dispositivo: string;
  token: string;
  /** Valor aleatório gerado a cada boot do ESP32. */
  boot: string;
}

/** Códigos de fechamento enviados ao robô. */
export const CodigoFechamento = {
  TOKEN_INVALIDO: 4001,
  VERSAO_NAO_SUPORTADA: 4002,
} as const;

// ---------- Painel ↔ Backend (/ws/painel) ----------

export type TipoMensagemPainelEntrada = 'inscrever' | 'cancelar';

export type TipoMensagemPainelSaida =
  'snapshot' | 'evento' | 'continuo' | 'sinal' | 'alerta' | 'ao_vivo' | 'leaderboard';

export type MensagemPainelEntrada =
  | { tipo: TipoMensagemPainelEntrada; corrida: string }
  | { tipo: TipoMensagemPainelEntrada; canal: 'ao_vivo' };
