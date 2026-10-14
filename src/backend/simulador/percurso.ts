/**
 * Percurso do robô simulado: reproduz o `Navigator` do firmware.
 *
 * A cada passo, igual ao `Navigator::step()`:
 * 1. lê as paredes da frente, da esquerda e da direita da célula atual (sensores ToF);
 * 2. recalcula o flood fill até a chegada, tratando parede desconhecida como aberta;
 * 3. vai para a vizinha de distância estritamente menor, na ordem NORTE, LESTE, SUL, OESTE;
 * 4. gira, se precisar, e avança uma célula.
 *
 * Como o robô começa sem conhecer o labirinto, ele às vezes entra num caminho que parecia
 * aberto, descobre a parede e volta. As revisitas surgem daí, do mesmo jeito que no robô real.
 *
 * Ao entrar numa célula, os quatro lados ficam conhecidos: frente, esquerda e direita vêm dos
 * sensores, e a parede de trás é a aresta que o robô acabou de atravessar (aberta). Por isso a
 * mensagem `celula` sai com as paredes completas, como pede o protocolo.
 */
import type { Orientacao } from '../protocolo/tipos.js';
import {
  aDireita,
  aEsquerda,
  Arestas,
  DIRECOES,
  mesmaCelula,
  oposta,
  vizinho,
  type Coordenada,
  type Labirinto,
} from './labirinto.js';

type EstadoParede = 'desconhecida' | 'aberta' | 'parede';

/** Giro feito antes de avançar (`applyTurnTo` do firmware). */
export type Manobra = 'nenhuma' | 'direita' | 'esquerda' | 'meia_volta';

export interface Passo {
  manobra: Manobra;
  /** Célula em que o robô entrou ao fim do passo. */
  posicao: Coordenada;
  orientacao: Orientacao;
  /** Contador de células percorridas depois do passo (conta as revisitas). */
  celulas: number;
  revisita: boolean;
}

export interface Percurso {
  partida: Coordenada;
  orientacaoInicial: Orientacao;
  /** Cada passo é o avanço de uma célula. */
  passos: Passo[];
  chegou: boolean;
}

export interface OpcoesPercurso {
  /** Igual ao firmware: o robô sai virado para o NORTE. */
  orientacaoInicial?: Orientacao;
  /** Igual ao `guard` do firmware: linhas × colunas × 4. */
  limitePassos?: number;
}

const INALCANCAVEL = Number.POSITIVE_INFINITY;

export function explorar(labirinto: Labirinto, opcoes: OpcoesPercurso = {}): Percurso {
  const { colunas, linhas, partida, chegada } = labirinto;
  const orientacaoInicial = opcoes.orientacaoInicial ?? 'NORTE';
  const limite = opcoes.limitePassos ?? linhas * colunas * 4;

  // Mapa do robô: só o perímetro é conhecido de início (`initKnownPerimeter`).
  const mapa = new Arestas<EstadoParede>(colunas, linhas, 'desconhecida');
  for (let x = 0; x < colunas; x++) {
    mapa.definir({ x, y: 0 }, 'NORTE', 'parede');
    mapa.definir({ x, y: linhas - 1 }, 'SUL', 'parede');
  }
  for (let y = 0; y < linhas; y++) {
    mapa.definir({ x: 0, y }, 'OESTE', 'parede');
    mapa.definir({ x: colunas - 1, y }, 'LESTE', 'parede');
  }

  let posicao = partida;
  let orientacao = orientacaoInicial;
  let celulas = 0;
  const visitadas = new Set<string>([`${partida.x},${partida.y}`]);
  const passos: Passo[] = [];

  for (let tentativa = 0; tentativa < limite && !mesmaCelula(posicao, chegada); tentativa++) {
    for (const direcao of [orientacao, aEsquerda(orientacao), aDireita(orientacao)]) {
      mapa.definir(posicao, direcao, labirinto.temParede(posicao, direcao) ? 'parede' : 'aberta');
    }

    const distancias = floodFill(mapa, chegada);
    const proxima = proximaDirecao(mapa, distancias, posicao);
    if (proxima === null) continue;

    if (labirinto.temParede(posicao, proxima)) {
      // Não acontece: a aresta escolhida foi lida pelos sensores ou é a que o robô atravessou.
      throw new Error(`percurso atravessaria uma parede em (${posicao.x}, ${posicao.y})`);
    }

    const manobra = manobraPara(orientacao, proxima);
    orientacao = proxima;
    posicao = vizinho(posicao, proxima);
    celulas++;
    const chave = `${posicao.x},${posicao.y}`;
    const revisita = visitadas.has(chave);
    visitadas.add(chave);
    passos.push({ manobra, posicao, orientacao, celulas, revisita });
  }

  return { partida, orientacaoInicial, passos, chegou: mesmaCelula(posicao, chegada) };
}

/** Distância (em células) de cada célula até a chegada no mapa conhecido (BFS). */
function floodFill(mapa: Arestas<EstadoParede>, alvo: Coordenada): number[] {
  const indice = (c: Coordenada) => c.y * mapa.colunas + c.x;
  const distancias = new Array<number>(mapa.colunas * mapa.linhas).fill(INALCANCAVEL);
  distancias[indice(alvo)] = 0;
  const fila: Coordenada[] = [alvo];

  for (let i = 0; i < fila.length; i++) {
    const atual = fila[i]!;
    for (const direcao of DIRECOES) {
      if (mapa.obter(atual, direcao) === 'parede') continue;
      const adjacente = vizinho(atual, direcao);
      if (!mapa.contem(adjacente) || distancias[indice(adjacente)] !== INALCANCAVEL) continue;
      distancias[indice(adjacente)] = distancias[indice(atual)]! + 1;
      fila.push(adjacente);
    }
  }
  return distancias;
}

/** `FloodFill::nextDirection`: só avança para distância estritamente menor. */
function proximaDirecao(
  mapa: Arestas<EstadoParede>,
  distancias: number[],
  posicao: Coordenada,
): Orientacao | null {
  const distancia = (c: Coordenada) => distancias[c.y * mapa.colunas + c.x]!;
  let melhor: Orientacao | null = null;
  let melhorDistancia = distancia(posicao);
  if (melhorDistancia === 0 || melhorDistancia === INALCANCAVEL) return null;

  for (const direcao of DIRECOES) {
    if (mapa.obter(posicao, direcao) === 'parede') continue;
    const adjacente = vizinho(posicao, direcao);
    if (!mapa.contem(adjacente)) continue;
    if (distancia(adjacente) < melhorDistancia) {
      melhor = direcao;
      melhorDistancia = distancia(adjacente);
    }
  }
  return melhor;
}

function manobraPara(atual: Orientacao, alvo: Orientacao): Manobra {
  if (alvo === atual) return 'nenhuma';
  if (alvo === aDireita(atual)) return 'direita';
  if (alvo === aEsquerda(atual)) return 'esquerda';
  if (alvo === oposta(atual)) return 'meia_volta';
  throw new Error(`giro impossível de ${atual} para ${alvo}`);
}
