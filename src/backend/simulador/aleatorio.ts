/**
 * Números pseudoaleatórios do simulador.
 *
 * O `Math.random` não aceita semente, então duas execuções nunca dariam o mesmo labirinto.
 * O mulberry32 é um gerador de 32 bits pequeno e rápido: com a mesma semente, ele produz
 * sempre a mesma sequência. É isso que torna `--semente` reproduzível.
 *
 * O `boot` e a semente padrão vêm de `node:crypto`, porque precisam ser imprevisíveis.
 */
import { randomBytes, randomInt } from 'node:crypto';

/** Função que devolve um número em [0, 1). */
export type Aleatorio = () => number;

export const SEMENTE_MAXIMA = 0xffffffff;

export function criarAleatorio(semente: number): Aleatorio {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inteiro em [minimo, maximo], com os dois extremos incluídos. */
export function inteiroEntre(aleatorio: Aleatorio, minimo: number, maximo: number): number {
  return minimo + Math.floor(aleatorio() * (maximo - minimo + 1));
}

/** Número real em [minimo, maximo). */
export function realEntre(aleatorio: Aleatorio, minimo: number, maximo: number): number {
  return minimo + aleatorio() * (maximo - minimo);
}

/** Cópia embaralhada (Fisher–Yates). Não altera a lista original. */
export function embaralhar<T>(aleatorio: Aleatorio, itens: readonly T[]): T[] {
  const copia = [...itens];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = inteiroEntre(aleatorio, 0, i);
    [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  }
  return copia;
}

/** Semente usada quando `--semente` não é informada. */
export function sementeAleatoria(): number {
  return randomInt(0, SEMENTE_MAXIMA + 1);
}

/** Igual ao firmware: 6 dígitos hexadecimais aleatórios a cada boot (`esp_random`). */
export function gerarBoot(): string {
  return randomBytes(3).toString('hex');
}
