import { useState } from 'react';
import { baixarArquivo } from '../adaptadores/exportacao';
import type { DadosExecucao, FormatoExportacao } from '../dominio';
import { TIPO_CONTEUDO_EXPORTACAO } from '../dominio';
import {
  mensagemErroExportacao,
  montarCsvExecucao,
  montarJsonExecucao,
  nomeArquivoExportacao,
} from '../formatacao';

/**
 * Exportação da execução aberta no detalhe (HU-FE-15). O erro fica só neste estado local:
 * falhar ao exportar nunca mexe nos dados exibidos (CA4).
 */
export function useExportacao(dados: DadosExecucao, iniciadaEm: string | null) {
  const [erro, definirErro] = useState<string | null>(null);

  function exportar(formato: FormatoExportacao) {
    try {
      const execucao = { dados, iniciadaEm };
      const conteudo =
        formato === 'JSON' ? montarJsonExecucao(execucao) : montarCsvExecucao(execucao);
      baixarArquivo(
        nomeArquivoExportacao(dados.corrida, formato),
        conteudo,
        TIPO_CONTEUDO_EXPORTACAO[formato],
      );
      definirErro(null);
    } catch {
      definirErro(mensagemErroExportacao(formato));
    }
  }

  return { exportar, erro };
}
