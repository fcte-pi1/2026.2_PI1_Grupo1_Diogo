import type { DadosExecucao, FormatoExportacao } from '../dominio';
import { EXTENSAO_EXPORTACAO } from '../dominio';

/** Execução do histórico pronta para exportar: os dados da tela e o instante de início (ISO). */
export interface ExecucaoExportavel {
  dados: DadosExecucao;
  iniciadaEm: string | null;
}

function metricas(d: DadosExecucao) {
  return {
    tempo_ms: d.tempoMs,
    celulas_percorridas: d.celulasPercorridas,
    distancia_m: d.distanciaM,
    velocidade_media_mps: d.velocidadeMediaMps,
    tensao_v: d.tensaoV,
    corrente_a: d.correnteA,
    potencia_w: d.potenciaW,
    carga_estimada_pct: d.cargaPct,
    delta_v: d.deltaV,
  };
}

/** JSON com identificação, tipo, status, métricas, mapa, trajeto e energia (HU-FE-15 CA2). */
export function montarJsonExecucao({ dados: d, iniciadaEm }: ExecucaoExportavel): string {
  return JSON.stringify(
    {
      id: d.corrida,
      iniciada_em: iniciadaEm,
      tipo_labirinto: d.tipoLabirinto,
      status: d.status,
      motivo_termino: d.motivoTermino,
      detalhe: d.detalheFalha,
      metricas: metricas(d),
      mapa: d.mapa,
      trajeto: d.trajeto.map((p) => ({ sequencia: p.seq, x: p.x, y: p.y })),
      energia: d.energia.map((a) => ({
        tempo_ms: a.tempoMs,
        tensao_v: a.tensaoV,
        corrente_a: a.correnteA,
        potencia_w: a.potenciaW,
        carga_estimada_pct: a.cargaPct,
      })),
    },
    null,
    2,
  );
}

type ValorCsv = string | number | null | undefined;

const CABECALHO_CSV = [
  'secao',
  'id_execucao',
  'campo',
  'valor',
  'sequencia',
  'x',
  'y',
  'tempo_ms',
  'tensao_v',
  'corrente_a',
  'potencia_w',
  'carga_estimada_pct',
] as const;

function celulaCsv(valor: ValorCsv): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : '';
  // Texto vindo do firmware não pode virar fórmula ao abrir o arquivo em uma planilha.
  const texto = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function linhaCsv(valores: readonly ValorCsv[]): string {
  return valores.map(celulaCsv).join(',');
}

/**
 * CSV em formato longo, separador `,` e ponto decimal: uma tabela só, com a coluna `secao`
 * (`resumo`, `metrica`, `trajeto` ou `energia`) dizendo como ler cada linha (HU-FE-15 CA2).
 */
export function montarCsvExecucao({ dados: d, iniciadaEm }: ExecucaoExportavel): string {
  const id = d.corrida;
  const linhas: string[] = [linhaCsv(CABECALHO_CSV)];

  const resumo: [string, ValorCsv][] = [
    ['iniciada_em', iniciadaEm],
    ['tipo_labirinto', d.tipoLabirinto],
    ['status', d.status],
    ['motivo_termino', d.motivoTermino],
    ['detalhe', d.detalheFalha],
  ];
  for (const [campo, valor] of resumo) linhas.push(linhaCsv(['resumo', id, campo, valor]));

  for (const [campo, valor] of Object.entries(metricas(d))) {
    linhas.push(linhaCsv(['metrica', id, campo, valor]));
  }
  for (const p of d.trajeto) {
    linhas.push(linhaCsv(['trajeto', id, '', '', p.seq, p.x, p.y]));
  }
  for (const a of d.energia) {
    linhas.push(
      linhaCsv([
        'energia',
        id,
        '',
        '',
        '',
        '',
        '',
        a.tempoMs,
        a.tensaoV,
        a.correnteA,
        a.potenciaW,
        a.cargaPct,
      ]),
    );
  }
  // BOM para que o Excel reconheça o UTF-8; RFC 4180 usa CRLF entre linhas.
  return `\uFEFF${linhas.join('\r\n')}\r\n`;
}

export function nomeArquivoExportacao(id: string | null, formato: FormatoExportacao): string {
  const seguro = (id ?? '').replace(/[^A-Za-z0-9_-]/g, '_');
  return `execucao${seguro ? `-${seguro}` : ''}.${EXTENSAO_EXPORTACAO[formato]}`;
}

export function mensagemErroExportacao(formato: FormatoExportacao): string {
  return `Não foi possível exportar a execução em ${formato}. Os dados exibidos foram mantidos.`;
}
