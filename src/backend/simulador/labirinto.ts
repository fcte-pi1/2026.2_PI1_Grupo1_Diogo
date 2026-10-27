/**
 * Labirinto do simulador.
 *
 * Convenções iguais às do protocolo v1 e do firmware (`MazeMap`, `DipDecoder`):
 * - `x` é a coluna e cresce para o LESTE; `y` é a linha e cresce para o SUL (y = 0 é a borda norte);
 * - o tipo `CxL` tem C colunas e L linhas (L é sempre 4);
 * - a partida é o canto (0, L−1) ou (C−1, L−1), e a chegada é o canto diagonal oposto, na linha 0.
 *
 * As paredes são guardadas por ARESTA, e não por célula, como no `MazeMap` do firmware. A parede
 * entre duas células vizinhas é uma única posição na memória, então o "leste" de uma célula e o
 * "oeste" da vizinha são sempre iguais. A consistência entre células adjacentes é garantida pela
 * própria estrutura de dados, e não por verificação.
 */
import type { Orientacao, Paredes, TipoLabirinto } from '../protocolo/tipos.js';
import { embaralhar, type Aleatorio } from './aleatorio.js';

export const TIPOS_LABIRINTO: readonly TipoLabirinto[] = ['4x4', '8x4', '12x4'];

/** Mesma ordem do `kScanOrder` do firmware: em empate, vence a primeira direção da lista. */
export const DIRECOES: readonly Orientacao[] = ['NORTE', 'LESTE', 'SUL', 'OESTE'];

export interface Coordenada {
  readonly x: number;
  readonly y: number;
}

/** Canto de partida, escolhido no robô pelo DIP 3. */
export type CantoPartida = 'oeste' | 'leste';

const DESLOCAMENTO: Record<Orientacao, Coordenada> = {
  NORTE: { x: 0, y: -1 },
  LESTE: { x: 1, y: 0 },
  SUL: { x: 0, y: 1 },
  OESTE: { x: -1, y: 0 },
};

export function vizinho(celula: Coordenada, direcao: Orientacao): Coordenada {
  const d = DESLOCAMENTO[direcao];
  return { x: celula.x + d.x, y: celula.y + d.y };
}

export function mesmaCelula(a: Coordenada, b: Coordenada): boolean {
  return a.x === b.x && a.y === b.y;
}

export function oposta(direcao: Orientacao): Orientacao {
  return DIRECOES[(DIRECOES.indexOf(direcao) + 2) % 4]!;
}

/** Giro de 90° no sentido horário. */
export function aDireita(direcao: Orientacao): Orientacao {
  return DIRECOES[(DIRECOES.indexOf(direcao) + 1) % 4]!;
}

/** Giro de 90° no sentido anti-horário. */
export function aEsquerda(direcao: Orientacao): Orientacao {
  return DIRECOES[(DIRECOES.indexOf(direcao) + 3) % 4]!;
}

export function ehTipoLabirinto(valor: unknown): valor is TipoLabirinto {
  return typeof valor === 'string' && (TIPOS_LABIRINTO as readonly string[]).includes(valor);
}

export function dimensoes(tipo: TipoLabirinto): { colunas: number; linhas: number } {
  const [colunas, linhas] = tipo.split('x').map(Number);
  return { colunas: colunas!, linhas: linhas! };
}

/** Partida e chegada, com a mesma regra do `DipDecoder::decode` do firmware. */
export function cantosDoLabirinto(
  tipo: TipoLabirinto,
  canto: CantoPartida = 'oeste',
): { partida: Coordenada; chegada: Coordenada } {
  const { colunas, linhas } = dimensoes(tipo);
  const partida = { x: canto === 'leste' ? colunas - 1 : 0, y: linhas - 1 };
  const chegada = { x: colunas - 1 - partida.x, y: linhas - 1 - partida.y };
  return { partida, chegada };
}

/**
 * Um valor por aresta da grade, como os vetores `horizontalEdges_` e `verticalEdges_` do
 * `MazeMap`. Arestas horizontais: (linhas + 1) × colunas. Verticais: linhas × (colunas + 1).
 */
export class Arestas<T> {
  private readonly horizontais: T[];
  private readonly verticais: T[];

  constructor(
    readonly colunas: number,
    readonly linhas: number,
    inicial: T,
  ) {
    this.horizontais = new Array<T>((linhas + 1) * colunas).fill(inicial);
    this.verticais = new Array<T>(linhas * (colunas + 1)).fill(inicial);
  }

  contem(celula: Coordenada): boolean {
    return celula.x >= 0 && celula.x < this.colunas && celula.y >= 0 && celula.y < this.linhas;
  }

  obter(celula: Coordenada, direcao: Orientacao): T {
    const [lista, i] = this.localizar(celula, direcao);
    return lista[i]!;
  }

  definir(celula: Coordenada, direcao: Orientacao, valor: T): void {
    const [lista, i] = this.localizar(celula, direcao);
    lista[i] = valor;
  }

  private localizar(celula: Coordenada, direcao: Orientacao): [T[], number] {
    if (!this.contem(celula)) {
      throw new RangeError(`célula (${celula.x}, ${celula.y}) fora da grade`);
    }
    const { x, y } = celula;
    switch (direcao) {
      case 'NORTE':
        return [this.horizontais, y * this.colunas + x];
      case 'SUL':
        return [this.horizontais, (y + 1) * this.colunas + x];
      case 'OESTE':
        return [this.verticais, y * (this.colunas + 1) + x];
      case 'LESTE':
        return [this.verticais, y * (this.colunas + 1) + x + 1];
    }
  }
}

export interface Labirinto {
  readonly tipo: TipoLabirinto;
  readonly colunas: number;
  readonly linhas: number;
  readonly partida: Coordenada;
  readonly chegada: Coordenada;
  contem(celula: Coordenada): boolean;
  temParede(celula: Coordenada, direcao: Orientacao): boolean;
  /** As quatro paredes da célula, no formato da mensagem `celula`. */
  paredes(celula: Coordenada): Paredes;
}

/**
 * Gera um labirinto com a semente do `aleatorio` (algoritmo de Kruskal).
 *
 * 1. Começa com todas as paredes. Cada célula é um "grupo" separado.
 * 2. Percorre as paredes internas em ordem aleatória. Se as duas células da parede estão em
 *    grupos diferentes, derruba a parede e junta os grupos (union-find). Se já estão no mesmo
 *    grupo, a parede fica, porque derrubá-la criaria um ciclo. No fim, todas as células estão
 *    ligadas por exatamente um caminho, com bifurcações e becos espalhados pelo labirinto.
 * 3. A partida fica de fora do passo 2 e só se abre para o NORTE: é o "canto sem saída" de onde
 *    o robô sai virado para o norte, como no firmware.
 * 4. Derruba algumas das paredes que sobraram, criando poucos caminhos alternativos (ciclos).
 *
 * Por que Kruskal e não busca em profundidade: a busca em profundidade gera corredores longos,
 * com poucas bifurcações, e o flood fill do robô quase nunca entrava num beco (medimos 0 % de
 * revisitas em 900 labirintos). Com Kruskal, o robô entra em becos e volta na maioria das
 * corridas, como na exploração real.
 */
export function gerarLabirinto(
  tipo: TipoLabirinto,
  aleatorio: Aleatorio,
  canto: CantoPartida = 'oeste',
): Labirinto {
  const { colunas, linhas } = dimensoes(tipo);
  const { partida, chegada } = cantosDoLabirinto(tipo, canto);
  const paredes = new Arestas<boolean>(colunas, linhas, true);

  // Union-find: `grupo[i]` aponta para outra célula do mesmo grupo; a raiz aponta para si.
  const indice = (c: Coordenada) => c.y * colunas + c.x;
  const grupo = Array.from({ length: colunas * linhas }, (_, i) => i);
  const raiz = (i: number): number => {
    while (grupo[i] !== i) i = grupo[i] = grupo[grupo[i]!]!;
    return i;
  };

  const internas: [Coordenada, Orientacao][] = [];
  for (let y = 0; y < linhas; y++) {
    for (let x = 0; x < colunas; x++) {
      const celula = { x, y };
      for (const direcao of ['LESTE', 'SUL'] as const) {
        const outra = vizinho(celula, direcao);
        const tocaPartida = mesmaCelula(celula, partida) || mesmaCelula(outra, partida);
        if (paredes.contem(outra) && !tocaPartida) internas.push([celula, direcao]);
      }
    }
  }

  const sobras: [Coordenada, Orientacao][] = [];
  for (const [celula, direcao] of embaralhar(aleatorio, internas)) {
    const a = raiz(indice(celula));
    const b = raiz(indice(vizinho(celula, direcao)));
    if (a === b) {
      sobras.push([celula, direcao]);
      continue;
    }
    grupo[a] = b;
    paredes.definir(celula, direcao, false);
  }

  paredes.definir(partida, 'NORTE', false);

  const atalhos = Math.round((colunas * linhas) / 16);
  for (const [celula, direcao] of sobras.slice(0, atalhos)) {
    paredes.definir(celula, direcao, false);
  }

  return {
    tipo,
    colunas,
    linhas,
    partida,
    chegada,
    contem: (celula) => paredes.contem(celula),
    temParede: (celula, direcao) => paredes.obter(celula, direcao),
    paredes: (celula) => ({
      norte: paredes.obter(celula, 'NORTE'),
      leste: paredes.obter(celula, 'LESTE'),
      sul: paredes.obter(celula, 'SUL'),
      oeste: paredes.obter(celula, 'OESTE'),
    }),
  };
}
