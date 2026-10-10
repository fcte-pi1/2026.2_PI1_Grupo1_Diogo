import { usePainel } from '../estado';
import { rotuloConexao } from '../formatacao';

/** Rótulo e estado da conexão, prontos para o IndicadorConexao. */
export function useConexao() {
  const estado = usePainel((s) => s.conexao.estado);
  const sinal = usePainel((s) => s.conexao.sinal);
  return { estado, sinal, rotulo: rotuloConexao(estado, sinal) };
}

export function useSaudeBackend() {
  return usePainel((s) => s.conexao.saude);
}

export function useTelemetria() {
  return usePainel((s) => s.telemetria);
}
