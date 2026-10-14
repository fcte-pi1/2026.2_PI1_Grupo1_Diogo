import type { Contadores } from '../aplicacao/portas.js';

/** Contadores em memória expostos em /health (RNF-56). Zeram a cada reinício do backend. */
export function criarContadores(): Contadores {
  return {
    mensagensAceitas: 0,
    mensagensDuplicadas: 0,
    mensagensRejeitadas: 0,
    conexoesRecusadas: 0,
  };
}
