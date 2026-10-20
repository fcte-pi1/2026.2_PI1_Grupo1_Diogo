import type { ErroDetalhe, MotivoTermino, StatusCorrida } from '../dominio';

export function mensagemErroDetalhe(erro: ErroDetalhe): string {
  switch (erro) {
    case 'NAO_ENCONTRADA':
      return 'Esta execução não existe ou foi removida do histórico.';
    case 'REDE':
      return 'Não foi possível conectar ao servidor para carregar a execução.';
    case 'SERVIDOR':
      return 'O servidor não conseguiu retornar os dados desta execução.';
  }
}

// `Record<MotivoTermino, …>`: um motivo novo no backend sem rótulo aqui quebra o typecheck.
const MOTIVOS: Readonly<Record<MotivoTermino, string>> = {
  SUCESSO: 'Concluída com sucesso',
  FALHA_REPORTADA: 'Falha reportada pelo robô',
  SEM_SINAL: 'Perda de comunicação',
  REINICIO_ROBO: 'Reinício do robô',
};
const ROTULOS: Readonly<Record<string, string>> = MOTIVOS;

/** Motivo do término recebido do backend; códigos desconhecidos aparecem como vieram. */
export function rotuloMotivoTermino(motivo: string | null): string {
  if (motivo === null || motivo.trim() === '') return 'Motivo não informado';
  const rotulo = ROTULOS[motivo.trim().toUpperCase()];
  return rotulo ? `${rotulo} (${motivo})` : motivo;
}

export function tituloFalha(status: StatusCorrida): string {
  return status === 'INTERROMPIDA' ? 'Execução interrompida' : 'Execução falhou';
}
