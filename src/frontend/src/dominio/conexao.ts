/** Estado da conexão painel ↔ backend (arquitetura do frontend, §3.4). */
export type EstadoConexao = 'CONECTANDO' | 'CONECTADO' | 'RECONECTANDO' | 'DESCONECTADO';

/** Sinal robô ↔ backend, informado pela mensagem `sinal`. */
export type SinalRobo = 'DESCONHECIDO' | 'OK' | 'PERDIDO';

const ATRASOS_BACKOFF_MS = [250, 500, 1000, 2000] as const;

/**
 * Atraso antes da próxima tentativa de reconexão: 0,25 → 0,5 → 1 → 2 s, com teto de 2 s
 * para manter a reconexão dentro dos 5 s do RNF-39.
 * @param tentativa índice da tentativa, começando em 0
 */
export function atrasoBackoffMs(tentativa: number): number {
  const indice = Math.min(Math.max(0, Math.floor(tentativa)), ATRASOS_BACKOFF_MS.length - 1);
  return ATRASOS_BACKOFF_MS[indice]!;
}
