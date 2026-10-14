export type TipoLabirinto = '4x4' | '8x4' | '12x4';
export type StatusCorrida = 'EM_ANDAMENTO' | 'CONCLUIDA' | 'FALHOU' | 'INTERROMPIDA';
export type Orientacao = 'NORTE' | 'LESTE' | 'SUL' | 'OESTE';

/**
 * Os tipos abaixo espelham, campo a campo, os de `protocolo/tipos.ts`. O dominio/ não pode
 * importar `@protocolo` (regra `dominio-isolado`); a compatibilidade estrutural é verificada
 * pelo compilador no adaptador, que passa os valores do contrato direto para a store.
 */
export interface PontoTrajeto {
  /** `sequencia` da mensagem de célula no backend: define a ordem do trajeto. */
  seq: number;
  x: number;
  y: number;
}

/** `true` = parede presente naquele lado (convenção do protocolo v1). */
export interface Paredes {
  norte: boolean;
  leste: boolean;
  sul: boolean;
  oeste: boolean;
}

export type DirecaoParede = keyof Paredes;

export interface CelulaMapa {
  x: number;
  y: number;
  paredes: Paredes;
}

export interface PosicaoRobo {
  x: number;
  y: number;
  orientacao: Orientacao;
}

export interface AmostraEnergia {
  seq: number | null;
  tempoMs: number | null;
  tensaoV: number;
  correnteA: number;
  potenciaW: number;
  cargaPct: number | null;
}

export interface DadosExecucao {
  /** Id (UUID) da corrida no backend; `null` enquanto nenhuma corrida foi acompanhada. */
  corrida: string | null;
  tipoLabirinto: TipoLabirinto | null;
  /** `true` quando o backend informou um tipo fora de 4x4/8x4/12x4 (HU-FE-06 CA3). */
  tipoInvalido: boolean;
  trajeto: PontoTrajeto[];
  posicao: PosicaoRobo | null;
  celulasPercorridas: number | null;
  velocidadeMediaMps: number | null;
  tempoMs: number | null;
  status: StatusCorrida | null;
  tensaoV: number | null;
  correnteA: number | null;
  potenciaW: number | null;
  cargaPct: number | null;
  energia: AmostraEnergia[];
  mapa: CelulaMapa[];
}

export const execucaoInicial: DadosExecucao = {
  corrida: null,
  tipoLabirinto: null,
  tipoInvalido: false,
  trajeto: [],
  posicao: null,
  celulasPercorridas: null,
  velocidadeMediaMps: null,
  tempoMs: null,
  status: null,
  tensaoV: null,
  correnteA: null,
  potenciaW: null,
  cargaPct: null,
  energia: [],
  mapa: [],
};
