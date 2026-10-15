/**
 * Prazos de sinal compartilhados pela ingestão e pela corrida. Ficam aqui, e não em um dos
 * dois serviços, para que um não precise importar o outro.
 */

/** Tempo sem mensagens durante uma corrida para declarar o sinal perdido (RF-73). */
export const LIMITE_SILENCIO_MS = 3000;
/** Tempo depois da perda de sinal para marcar a corrida como interrompida (RF-81, CA4). */
export const INTERRUPCAO_APOS_PERDA_MS = 120_000;
