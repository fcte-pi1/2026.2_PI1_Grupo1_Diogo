/**
 * Histogramas da latência recepção → envio ao painel (RNF-48, CT-BE-32). Ficam em memória,
 * com tamanho fixo, desde o início do processo: para uma medição limpa, reinicie o backend
 * antes da corrida de medição.
 */
import { createHistogram, type RecordableHistogram } from 'node:perf_hooks';
import type { RegistroLatencia } from '../aplicacao/portas.js';

export interface ResumoLatencia {
  amostras: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
}

export class HistogramasLatencia implements RegistroLatencia {
  // Em microssegundos: o histograma só guarda inteiros ≥ 1.
  private readonly eventos: RecordableHistogram = createHistogram();
  private readonly continuos: RecordableHistogram = createHistogram();

  registrar(tipo: 'evento' | 'continuo', ms: number): void {
    const histograma = tipo === 'evento' ? this.eventos : this.continuos;
    histograma.record(Math.max(1, Math.round(ms * 1000)));
  }

  /** Percentis em ms, com duas casas. Sem amostras, os valores são `null`. */
  resumo(): { eventos: ResumoLatencia; continuos: ResumoLatencia } {
    return { eventos: resumir(this.eventos), continuos: resumir(this.continuos) };
  }
}

function resumir(histograma: RecordableHistogram): ResumoLatencia {
  const amostras = histograma.count;
  const ms = (us: number) => (amostras === 0 ? null : Math.round(us / 10) / 100);
  return {
    amostras,
    p50: ms(histograma.percentile(50)),
    p95: ms(histograma.percentile(95)),
    p99: ms(histograma.percentile(99)),
    max: ms(histograma.max),
  };
}
