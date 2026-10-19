import type { ErroDetalhe, StatusCorrida } from '../dominio';

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

const MOTIVOS: Readonly<Record<string, string>> = {
  TIMEOUT: 'Tempo limite excedido',
  TEMPO_LIMITE: 'Tempo limite excedido',
  ESTOURO_TEMPO: 'Tempo limite excedido',
  ERRO_FIRMWARE: 'Erro do firmware',
  FIRMWARE: 'Erro do firmware',
  PERDA_COMUNICACAO: 'Perda de comunicação',
};

/** Motivo do término recebido do backend; códigos desconhecidos aparecem como vieram. */
export function rotuloMotivoTermino(motivo: string | null): string {
  if (motivo === null || motivo.trim() === '') return 'Motivo não informado';
  const rotulo = MOTIVOS[motivo.trim().toUpperCase()];
  return rotulo ? `${rotulo} (${motivo})` : motivo;
}

export function tituloFalha(status: StatusCorrida): string {
  return status === 'INTERROMPIDA' ? 'Execução interrompida' : 'Execução falhou';
}
