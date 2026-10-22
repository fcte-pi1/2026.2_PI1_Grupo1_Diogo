/** Formatos oferecidos na exportação de uma execução (HU-FE-15 CA1). */
export type FormatoExportacao = 'CSV' | 'JSON';

export const FORMATOS_EXPORTACAO: readonly FormatoExportacao[] = ['CSV', 'JSON'];

export const EXTENSAO_EXPORTACAO: Readonly<Record<FormatoExportacao, string>> = {
  CSV: 'csv',
  JSON: 'json',
};

/** Tipo de conteúdo do arquivo baixado (HU-FE-15 CA3). */
export const TIPO_CONTEUDO_EXPORTACAO: Readonly<Record<FormatoExportacao, string>> = {
  CSV: 'text/csv;charset=utf-8',
  JSON: 'application/json;charset=utf-8',
};
