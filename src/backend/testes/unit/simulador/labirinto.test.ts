import { describe, expect, it } from 'vitest';
import { criarAleatorio, embaralhar, inteiroEntre } from '../../../simulador/aleatorio.js';
import {
  cantosDoLabirinto,
  DIRECOES,
  gerarLabirinto,
  oposta,
  TIPOS_LABIRINTO,
  vizinho,
  type Coordenada,
  type Labirinto,
} from '../../../simulador/labirinto.js';

const SEMENTES = Array.from({ length: 30 }, (_, i) => i * 7919 + 1);

function celulas(labirinto: Labirinto): Coordenada[] {
  const lista: Coordenada[] = [];
  for (let y = 0; y < labirinto.linhas; y++) {
    for (let x = 0; x < labirinto.colunas; x++) lista.push({ x, y });
  }
  return lista;
}

function alcancaveis(labirinto: Labirinto): number {
  const chave = (c: Coordenada) => `${c.x},${c.y}`;
  const vistas = new Set([chave(labirinto.partida)]);
  const fila = [labirinto.partida];
  for (let i = 0; i < fila.length; i++) {
    for (const direcao of DIRECOES) {
      if (labirinto.temParede(fila[i]!, direcao)) continue;
      const proxima = vizinho(fila[i]!, direcao);
      if (!vistas.has(chave(proxima))) {
        vistas.add(chave(proxima));
        fila.push(proxima);
      }
    }
  }
  return vistas.size;
}

describe('aleatorio', () => {
  it('a mesma semente gera a mesma sequência; sementes diferentes, sequências diferentes', () => {
    const a = criarAleatorio(42);
    const b = criarAleatorio(42);
    const c = criarAleatorio(43);
    const sa = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(sa);
    expect(Array.from({ length: 5 }, c)).not.toEqual(sa);
    expect(sa.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('inteiroEntre inclui os dois extremos e embaralhar não perde itens', () => {
    const aleatorio = criarAleatorio(1);
    const valores = new Set(Array.from({ length: 200 }, () => inteiroEntre(aleatorio, 2, 4)));
    expect([...valores].sort()).toEqual([2, 3, 4]);
    expect(embaralhar(aleatorio, [1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('labirinto', () => {
  it.each([
    ['4x4', 4, 4],
    ['8x4', 8, 4],
    ['12x4', 12, 4],
  ] as const)('%s tem %i colunas e %i linhas', (tipo, colunas, linhas) => {
    const labirinto = gerarLabirinto(tipo, criarAleatorio(1));
    expect(labirinto.colunas).toBe(colunas);
    expect(labirinto.linhas).toBe(linhas);
  });

  it('partida e chegada seguem o DipDecoder do firmware', () => {
    expect(cantosDoLabirinto('8x4', 'oeste')).toEqual({
      partida: { x: 0, y: 3 },
      chegada: { x: 7, y: 0 },
    });
    expect(cantosDoLabirinto('8x4', 'leste')).toEqual({
      partida: { x: 7, y: 3 },
      chegada: { x: 0, y: 0 },
    });
  });

  for (const tipo of TIPOS_LABIRINTO) {
    for (const canto of ['oeste', 'leste'] as const) {
      it(`${tipo}, partida a ${canto}: perímetro fechado, paredes consistentes e tudo alcançável`, () => {
        for (const semente of SEMENTES) {
          const labirinto = gerarLabirinto(tipo, criarAleatorio(semente), canto);
          for (const celula of celulas(labirinto)) {
            for (const direcao of DIRECOES) {
              const outra = vizinho(celula, direcao);
              if (!labirinto.contem(outra)) {
                expect(labirinto.temParede(celula, direcao)).toBe(true);
              } else {
                expect(labirinto.temParede(celula, direcao)).toBe(
                  labirinto.temParede(outra, oposta(direcao)),
                );
              }
            }
          }
          expect(alcancaveis(labirinto)).toBe(labirinto.colunas * labirinto.linhas);
        }
      });
    }
  }

  it('a partida é um canto sem saída, aberto só para o norte', () => {
    for (const semente of SEMENTES) {
      for (const canto of ['oeste', 'leste'] as const) {
        const labirinto = gerarLabirinto('12x4', criarAleatorio(semente), canto);
        expect(labirinto.paredes(labirinto.partida)).toEqual({
          norte: false,
          leste: true,
          sul: true,
          oeste: true,
        });
      }
    }
  });

  it('a mesma semente gera o mesmo labirinto', () => {
    const paredes = (semente: number) => {
      const labirinto = gerarLabirinto('8x4', criarAleatorio(semente));
      return celulas(labirinto).map((c) => labirinto.paredes(c));
    };
    expect(paredes(7)).toEqual(paredes(7));
    expect(paredes(7)).not.toEqual(paredes(8));
  });
});
