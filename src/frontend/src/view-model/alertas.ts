import type { StatusCorrida } from '../dominio';
import { usePainel } from '../estado';
import { rotuloMotivoTermino, tituloFalha } from '../formatacao';

/** Falha ou interrupção da execução, pronta para o aviso (HU-FE-13 CA2). */
export interface FalhaExecucao {
  titulo: string;
  motivo: string;
  detalhe: string | null;
}

/** `null` quando a execução não falhou nem foi interrompida. */
export function descreverFalha(
  status: StatusCorrida | null,
  motivoTermino: string | null,
  detalheFalha: string | null,
): FalhaExecucao | null {
  if (status !== 'FALHOU' && status !== 'INTERROMPIDA') return null;
  return {
    titulo: tituloFalha(status),
    motivo: rotuloMotivoTermino(motivoTermino),
    detalhe: detalheFalha !== null && detalheFalha.trim() !== '' ? detalheFalha : null,
  };
}

/**
 * Avisos da execução ao vivo: falha/interrupção, perda de sinal do robô e retomada (HU-FE-13).
 * Derivados direto da store, sem atraso: o aviso aparece no mesmo render do evento recebido.
 */
export function useAlertasAoVivo() {
  const status = usePainel((s) => s.aoVivo.status);
  const motivoTermino = usePainel((s) => s.aoVivo.motivoTermino);
  const detalheFalha = usePainel((s) => s.aoVivo.detalheFalha);
  const sinal = usePainel((s) => s.conexao.sinal);
  const retomadaEm = usePainel((s) => s.alertas.retomadaEm);

  const semSinal = sinal === 'PERDIDO';
  return {
    falha: descreverFalha(status, motivoTermino, detalheFalha),
    semSinal,
    sinalRetomado: !semSinal && retomadaEm !== null,
  };
}
