import { useEffect, useMemo, useState } from 'react';
import { ErroConsultaCorridas, listarCorridas } from '../adaptadores/http';
import type { FiltroTipoLabirinto, StatusCorrida, TipoLabirinto } from '../dominio';
import { FILTROS_LABIRINTO, totalDePaginas } from '../dominio';
import { usePainel } from '../estado';
import {
  formatarDataHora,
  formatarTempoCorrida,
  mensagemErroHistorico,
  mensagemHistoricoVazio,
  rotuloFiltroLabirinto,
  rotuloStatusCorrida,
} from '../formatacao';
import type { CorridaResumo } from '../protocolo';

/** Linha da tabela já formatada para exibição. */
export interface LinhaHistorico {
  id: string;
  dataHora: string;
  labirinto: TipoLabirinto | null;
  tempo: string;
  status: StatusCorrida;
  rotuloStatus: string;
  /** Destino ao abrir a linha (HU-FE-11). */
  rota: string;
}

export interface OpcaoFiltro {
  valor: FiltroTipoLabirinto;
  rotulo: string;
}

export type SituacaoHistorico = 'carregando' | 'erro' | 'vazio' | 'pronto';

const OPCOES_FILTRO: readonly OpcaoFiltro[] = FILTROS_LABIRINTO.map((valor) => ({
  valor,
  rotulo: rotuloFiltroLabirinto(valor),
}));

function paraLinha(corrida: CorridaResumo): LinhaHistorico {
  return {
    id: corrida.id,
    dataHora: formatarDataHora(corrida.iniciada_em),
    labirinto: corrida.tipo_labirinto,
    tempo: formatarTempoCorrida(corrida.tempo_conclusao_ms),
    status: corrida.status,
    rotuloStatus: rotuloStatusCorrida(corrida.status),
    rota: `/historico/${corrida.id}`,
  };
}

/** Filtro, paginação e linhas formatadas da tela de histórico (HU-FE-09, HU-FE-10). */
export function useHistorico() {
  const { filtro, pagina, tamanhoPagina, itens, total, carregando, erro } = usePainel(
    (s) => s.historico,
  );
  const acoes = usePainel((s) => s.acoes);
  const [tentativa, definirTentativa] = useState(0);

  // Cada mudança de filtro/página/tentativa dispara uma consulta; a anterior é abortada
  // e uma resposta atrasada nunca sobrescreve a atual.
  useEffect(() => {
    const controle = new AbortController();
    listarCorridas({ labirinto: filtro, pagina, tamanhoPagina }, controle.signal)
      .then((resposta) => {
        if (!controle.signal.aborted) acoes.receberHistorico(resposta);
      })
      .catch((falha: unknown) => {
        if (controle.signal.aborted) return;
        acoes.falharHistorico(falha instanceof ErroConsultaCorridas ? falha.tipo : 'REDE');
      });
    return () => controle.abort();
  }, [filtro, pagina, tamanhoPagina, tentativa, acoes]);

  // Ao sair da tela, nada do histórico fica na store para aparecer como atual na próxima visita.
  useEffect(() => () => acoes.reiniciarHistorico(), [acoes]);

  const totalPaginas = totalDePaginas(total, tamanhoPagina);

  // Página fora do intervalo (ex.: registros removidos): volta para a última existente.
  const paginaInexistente = !carregando && !erro && itens.length === 0 && total > 0;
  useEffect(() => {
    if (paginaInexistente) acoes.definirPaginaHistorico(Math.max(1, totalPaginas));
  }, [paginaInexistente, totalPaginas, acoes]);

  const linhas = useMemo(() => itens.map(paraLinha), [itens]);

  const situacao: SituacaoHistorico = erro
    ? 'erro'
    : carregando || paginaInexistente
      ? 'carregando'
      : linhas.length === 0
        ? 'vazio'
        : 'pronto';

  return {
    filtro,
    opcoesFiltro: OPCOES_FILTRO,
    pagina,
    totalPaginas,
    total,
    linhas,
    situacao,
    mensagemErro: erro ? mensagemErroHistorico(erro) : null,
    mensagemVazio: mensagemHistoricoVazio(filtro),
    mudarFiltro: (novo: FiltroTipoLabirinto) => {
      if (novo !== filtro) acoes.definirFiltroHistorico(novo);
    },
    irParaPagina: (nova: number) => {
      if (nova >= 1 && nova <= totalPaginas && nova !== pagina) acoes.definirPaginaHistorico(nova);
    },
    tentarNovamente: () => {
      acoes.reconsultarHistorico();
      definirTentativa((n) => n + 1);
    },
  };
}
