import type { TipoLabirinto } from './execucao';

/** Filtro da tela de histórico: um tipo de labirinto ou todos (HU-FE-10). */
export type FiltroTipoLabirinto = TipoLabirinto | 'TODOS';

export const FILTROS_LABIRINTO: readonly FiltroTipoLabirinto[] = ['TODOS', '4x4', '8x4', '12x4'];

/** Falha da consulta: `REDE` (sem resposta) ou `SERVIDOR` (resposta inválida ou HTTP de erro). */
export type ErroHistorico = 'REDE' | 'SERVIDOR';

/** 20 por página: 200 execuções (caso de uso 9, CA3) cabem em 10 páginas. */
export const TAMANHO_PAGINA_HISTORICO = 20;

export function totalDePaginas(total: number, tamanhoPagina: number): number {
  return total <= 0 || tamanhoPagina <= 0 ? 0 : Math.ceil(total / tamanhoPagina);
}
