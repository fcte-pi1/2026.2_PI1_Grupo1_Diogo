import { usePainel } from '../../estado';
import { obterSaude } from './cliente-api';

/** Consulta /health periodicamente e atualiza a store. Retorna a função de parada. */
export function iniciarMonitorSaude(intervaloMs = 5000): () => void {
  const verificar = async () => usePainel.getState().acoes.definirSaude(await obterSaude());
  void verificar();
  const id = setInterval(verificar, intervaloMs);
  return () => clearInterval(id);
}
