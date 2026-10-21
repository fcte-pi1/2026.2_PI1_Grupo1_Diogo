/** Falha ao abrir uma execução do histórico: não existe, sem resposta ou resposta inválida. */
export type ErroDetalhe = 'NAO_ENCONTRADA' | 'REDE' | 'SERVIDOR';

export type SituacaoDetalhe = 'carregando' | 'pronto' | 'erro';
