import { useEffect, useState } from 'react';
import { usePainel } from '../estado';

export function useExecucaoAoVivo() {
  return usePainel((estado) => estado.aoVivo);
}

/** Mantém o cronômetro visual entre amostras sem substituir o tempo oficial do backend. */
export function useCronometroTentativa() {
  const { status, tempoMs } = useExecucaoAoVivo();
  const [tempoLocal, definirTempoLocal] = useState(0);

  useEffect(() => {
    if (status !== 'EM_ANDAMENTO') return;

    const base = tempoMs ?? 0;
    const inicio = Date.now();
    const id = setInterval(() => {
      definirTempoLocal((atual) => Math.max(atual, base + Date.now() - inicio));
    }, 100);

    return () => clearInterval(id);
  }, [status, tempoMs]);

  if (status === 'EM_ANDAMENTO') return Math.max(tempoMs ?? 0, tempoLocal);
  return tempoMs ?? (tempoLocal > 0 ? tempoLocal : null);
}

export function formatarNumero(valor: number | null, unidade: string): string {
  return valor === null
    ? '—'
    : `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${unidade}`;
}

export function formatarTempo(tempoMs: number | null): string {
  if (tempoMs === null) return '—';
  const totalSegundos = tempoMs / 1000;
  const minutos = Math.floor(totalSegundos / 60);
  const segundos = (totalSegundos % 60).toFixed(1).padStart(4, '0');
  return `${String(minutos).padStart(2, '0')}:${segundos}`;
}

export function rotuloStatus(status: ReturnType<typeof useExecucaoAoVivo>['status']): string {
  switch (status) {
    case 'EM_ANDAMENTO':
      return 'Em andamento';
    case 'CONCLUIDA':
      return 'Cumprida';
    case 'FALHOU':
      return 'Falhou';
    case 'INTERROMPIDA':
      return 'Interrompida';
    default:
      return '—';
  }
}
