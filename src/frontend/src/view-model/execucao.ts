import { usePainel } from '../estado';

export function useExecucaoAoVivo() {
  return usePainel((estado) => estado.aoVivo);
}

export function formatarNumero(valor: number | null, unidade: string): string {
  return valor === null ? '—' : `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${unidade}`;
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
    case 'EM_ANDAMENTO': return 'Em andamento';
    case 'CONCLUIDA': return 'Cumprida';
    case 'FALHOU': return 'Falhou';
    case 'INTERROMPIDA': return 'Interrompida';
    default: return '—';
  }
}