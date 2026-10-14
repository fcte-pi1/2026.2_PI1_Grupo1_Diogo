import { formatarTempoCorrida } from './tempo';
import type { StatusCorrida } from '../dominio';

export function formatarNumero(valor: number | null, unidade: string): string {
  return valor === null
    ? '—'
    : `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${unidade}`;
}

export function formatarTempo(tempoMs: number | null): string {
  return formatarTempoCorrida(tempoMs);
}

export function rotuloStatus(status: StatusCorrida | null): string {
  switch (status) {
    case 'EM_ANDAMENTO':
      return 'Em andamento';
    case 'CONCLUIDA':
      return 'Concluída';
    case 'FALHOU':
      return 'Falhou';
    case 'INTERROMPIDA':
      return 'Interrompida';
    default:
      return '—';
  }
}

export function rotuloDesafio(status: StatusCorrida | null): string {
  switch (status) {
    case 'CONCLUIDA':
      return 'Concluído';
    case 'EM_ANDAMENTO':
      return 'Em andamento';
    case 'FALHOU':
      return 'Falhou';
    case 'INTERROMPIDA':
      return 'Interrompido';
    default:
      return '—';
  }
}
