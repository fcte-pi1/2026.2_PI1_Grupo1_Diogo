export type TipoLabirinto = '4x4' | '8x4' | '12x4';
export type StatusCorrida = 'EM_ANDAMENTO' | 'CONCLUIDA' | 'FALHOU' | 'INTERROMPIDA';

export interface PontoTrajeto {
  seq: number;
  x: number;
  y: number;
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
  tipoLabirinto: TipoLabirinto | null;
  trajeto: PontoTrajeto[];
  velocidadeMediaMps: number | null;
  tempoMs: number | null;
  status: StatusCorrida | null;
  tensaoV: number | null;
  correnteA: number | null;
  potenciaW: number | null;
  cargaPct: number | null;
  energia: AmostraEnergia[];
}

export const execucaoInicial: DadosExecucao = {
  tipoLabirinto: null,
  trajeto: [],
  velocidadeMediaMps: null,
  tempoMs: null,
  status: null,
  tensaoV: null,
  correnteA: null,
  potenciaW: null,
  cargaPct: null,
  energia: [],
};
