import { useEffect, useState } from 'react';
import { ErroConsultaCorrida, obterCorrida } from '../adaptadores/http';
import type { DadosExecucao, SituacaoDetalhe } from '../dominio';
import { execucaoInicial } from '../dominio';
import { usePainel } from '../estado';
import { formatarDataHora, mensagemErroDetalhe } from '../formatacao';
import { descreverFalha } from './alertas';

/** Execução passada aberta em `/historico/:id` (HU-FE-11). */
export function useDetalheExecucao(id: string | undefined) {
  const detalhe = usePainel((s) => s.detalhe);
  const acoes = usePainel((s) => s.acoes);
  const [tentativa, definirTentativa] = useState(0);

  // Cada id/tentativa dispara uma consulta; a anterior é abortada e uma resposta atrasada
  // nunca sobrescreve a execução aberta agora.
  useEffect(() => {
    if (!id) return;
    const controle = new AbortController();
    acoes.iniciarDetalhe(id);
    obterCorrida(id, controle.signal)
      .then((resultado) => {
        if (!controle.signal.aborted) acoes.receberDetalhe(id, resultado);
      })
      .catch((falha: unknown) => {
        if (controle.signal.aborted) return;
        acoes.falharDetalhe(id, falha instanceof ErroConsultaCorrida ? falha.tipo : 'REDE');
      });
    return () => controle.abort();
  }, [id, tentativa, acoes]);

  // Ao sair da tela, a execução passada não fica na store para aparecer como atual na próxima.
  useEffect(() => () => acoes.reiniciarDetalhe(), [acoes]);

  // Entre trocar o id e o efeito rodar, o estado ainda é o da execução anterior: não o exibe.
  const atual = id !== undefined && detalhe.corrida === id ? detalhe : null;
  const situacao: SituacaoDetalhe = id === undefined ? 'erro' : (atual?.situacao ?? 'carregando');
  const execucao: DadosExecucao = atual?.dados ?? execucaoInicial;
  const erro = id === undefined ? 'NAO_ENCONTRADA' : (atual?.erro ?? null);

  return {
    situacao,
    execucao,
    iniciadaEm: atual?.iniciadaEm ? formatarDataHora(atual.iniciadaEm) : null,
    falha: descreverFalha(execucao.status, execucao.motivoTermino, execucao.detalheFalha),
    mensagemErro: erro ? mensagemErroDetalhe(erro) : null,
    /** Execução inexistente não melhora ao repetir a consulta. */
    podeTentarNovamente: erro !== 'NAO_ENCONTRADA',
    tentarNovamente: () => definirTentativa((n) => n + 1),
  };
}
