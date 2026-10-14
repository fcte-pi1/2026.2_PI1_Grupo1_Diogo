import type { ErroHistorico, FiltroTipoLabirinto, StatusCorrida } from '../dominio';
import { rotuloStatus } from './execucao';

export function rotuloStatusCorrida(status: StatusCorrida): string {
  return rotuloStatus(status);
}

export function rotuloFiltroLabirinto(filtro: FiltroTipoLabirinto): string {
  return filtro === 'TODOS' ? 'Todos' : filtro;
}

export function mensagemErroHistorico(erro: ErroHistorico): string {
  return erro === 'REDE'
    ? 'Não foi possível conectar ao servidor para carregar o histórico.'
    : 'O servidor não conseguiu retornar o histórico de execuções.';
}

export function mensagemHistoricoVazio(filtro: FiltroTipoLabirinto): string {
  return filtro === 'TODOS'
    ? 'Nenhuma execução registrada.'
    : `Nenhuma execução registrada no labirinto ${filtro}.`;
}
