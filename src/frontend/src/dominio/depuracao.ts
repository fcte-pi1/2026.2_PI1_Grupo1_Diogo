/**
 * Teto de sensores ToF que o painel desenha (HU-FE-14 CA1). O painel mostra tantos sensores
 * quantos a leitura trouxer: o robô atual tem 3 (frente, esquerda e direita).
 */
export const MAXIMO_SENSORES_TOF = 7;

/**
 * Leitura bruta de depuração (HU-FE-14). Todo valor ausente ou inválido é `null`: nunca vira
 * zero, porque zero é uma leitura possível (CA4).
 */
export interface LeituraDepuracao {
  /** Distâncias dos sensores ToF, em mm, na ordem recebida (ToF 1 em diante). */
  tof: (number | null)[];
  /** Ângulo do MPU-6050, em graus. */
  anguloMpuGraus: number | null;
  /** Contagens acumuladas dos encoders. */
  encoderEsquerdo: number | null;
  encoderDireito: number | null;
  /** Instante da leitura no relógio do robô, em ms. */
  tempoMs: number | null;
}

function numeroFinito(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

function distanciaValida(valor: unknown): number | null {
  const numero = numeroFinito(valor);
  return numero !== null && numero >= 0 ? numero : null;
}

function contagemValida(valor: unknown): number | null {
  const numero = numeroFinito(valor);
  return numero !== null && Number.isInteger(numero) ? numero : null;
}

/**
 * Converte o bloco `depuracao` de uma mensagem contínua em `LeituraDepuracao`.
 * Formato esperado (snake_case, como o resto do contrato):
 * `{ tof_mm: number[1..7], mpu_angulo_graus: number, encoder_esquerdo: number, encoder_direito: number }`.
 * Devolve `null` só quando não há bloco de depuração; campos ruins viram `null` individualmente.
 */
export function lerDepuracao(bruto: unknown, tempoMs?: number | null): LeituraDepuracao | null {
  if (bruto === null || typeof bruto !== 'object') return null;
  const b = bruto as Record<string, unknown>;
  const tofBruto = Array.isArray(b['tof_mm']) ? (b['tof_mm'] as unknown[]) : [];
  return {
    tof: tofBruto.slice(0, MAXIMO_SENSORES_TOF).map(distanciaValida),
    anguloMpuGraus: numeroFinito(b['mpu_angulo_graus']),
    encoderEsquerdo: contagemValida(b['encoder_esquerdo']),
    encoderDireito: contagemValida(b['encoder_direito']),
    tempoMs: numeroFinito(tempoMs),
  };
}
