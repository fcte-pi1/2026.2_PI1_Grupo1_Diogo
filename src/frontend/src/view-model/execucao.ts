import { useEffect, useState } from 'react';
import { usePainel } from '../estado';

export { formatarNumero, formatarTempo, rotuloDesafio, rotuloStatus } from '../formatacao';

export function useExecucaoAoVivo() {
  return usePainel((estado) => estado.aoVivo);
}

/**
 * Mantém o cronômetro visual entre amostras sem substituir o tempo oficial do backend.
 * O tempo local pertence a uma corrida: ao trocar de corrida ele recomeça do zero.
 */
export function useCronometroTentativa() {
  const { corrida, status, tempoMs } = useExecucaoAoVivo();
  const [local, definirLocal] = useState<{ corrida: string | null; ms: number }>({
    corrida,
    ms: 0,
  });
  const tempoLocal = local.corrida === corrida ? local.ms : 0;

  useEffect(() => {
    if (status !== 'EM_ANDAMENTO') return;

    const base = tempoMs ?? 0;
    const inicio = Date.now();
    const id = setInterval(() => {
      definirLocal((atual) => ({
        corrida,
        ms: Math.max(atual.corrida === corrida ? atual.ms : 0, base + Date.now() - inicio),
      }));
    }, 100);

    return () => clearInterval(id);
  }, [corrida, status, tempoMs]);

  if (status === 'EM_ANDAMENTO') return Math.max(tempoMs ?? 0, tempoLocal);
  return tempoMs ?? (tempoLocal > 0 ? tempoLocal : null);
}
