import { describe, expect, it } from 'vitest';
import { criarAleatorio } from '../../../simulador/aleatorio.js';
import {
  gerarLabirinto,
  mesmaCelula,
  TIPOS_LABIRINTO,
  vizinho,
  type CantoPartida,
} from '../../../simulador/labirinto.js';
import { explorar } from '../../../simulador/percurso.js';

const SEMENTES = Array.from({ length: 40 }, (_, i) => i * 104729 + 3);

describe('percurso (flood fill do firmware)', () => {
  for (const tipo of TIPOS_LABIRINTO) {
    for (const canto of ['oeste', 'leste'] as CantoPartida[]) {
      it(`${tipo}, partida a ${canto}: chega, anda só entre vizinhas e nunca atravessa parede`, () => {
        for (const semente of SEMENTES) {
          const labirinto = gerarLabirinto(tipo, criarAleatorio(semente), canto);
          const percurso = explorar(labirinto);

          expect(percurso.chegou).toBe(true);
          expect(percurso.partida).toEqual(labirinto.partida);
          expect(mesmaCelula(percurso.passos.at(-1)!.posicao, labirinto.chegada)).toBe(true);

          let anterior = percurso.partida;
          percurso.passos.forEach((passo, i) => {
            // A orientação depois do passo é a direção em que o robô andou.
            expect(passo.posicao).toEqual(vizinho(anterior, passo.orientacao));
            expect(labirinto.temParede(anterior, passo.orientacao)).toBe(false);
            expect(passo.celulas).toBe(i + 1);
            anterior = passo.posicao;
          });
        }
      });
    }
  }

  it('sai virado para o norte, como o firmware', () => {
    const labirinto = gerarLabirinto('4x4', criarAleatorio(1));
    const percurso = explorar(labirinto);
    expect(percurso.orientacaoInicial).toBe('NORTE');
    // A partida só se abre para o norte, então o primeiro passo é para lá, sem girar.
    expect(percurso.passos[0]).toMatchObject({ manobra: 'nenhuma', orientacao: 'NORTE' });
  });

  it('a maioria das corridas no 12x4 tem revisitas (o robô entra em becos e volta)', () => {
    const comRevisita = SEMENTES.filter((semente) =>
      explorar(gerarLabirinto('12x4', criarAleatorio(semente))).passos.some((p) => p.revisita),
    );
    expect(comRevisita.length).toBeGreaterThan(SEMENTES.length / 2);
  });

  it('é determinístico: o mesmo labirinto gera o mesmo percurso', () => {
    const percurso = () => explorar(gerarLabirinto('8x4', criarAleatorio(99)));
    expect(percurso()).toEqual(percurso());
  });

  it('desiste ao atingir o limite de passos', () => {
    const labirinto = gerarLabirinto('12x4', criarAleatorio(5));
    const percurso = explorar(labirinto, { limitePassos: 3 });
    expect(percurso.chegou).toBe(false);
    expect(percurso.passos.length).toBeLessThanOrEqual(3);
  });
});
