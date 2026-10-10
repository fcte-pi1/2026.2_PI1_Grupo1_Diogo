export type TipoLabirinto = '4x4' | '8x4' | '12x4';
export type StatusCorrida = 'EM_ANDAMENTO' | 'CONCLUIDA' | 'FALHOU' | 'INTERROMPIDA';

export interface PontoTrajeto {
  seq: number;
  x: number;
  y: number;
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
};