/** Replay sem corridas, para montar o app nos testes que não usam a linha do tempo. */
import { ServicoLinhaDoTempo } from '../../src/aplicacao/index.js';

export const linhaDoTempoVazia = () =>
  new ServicoLinhaDoTempo({ corridaExiste: async () => false, mensagensDepoisDe: async () => [] });
