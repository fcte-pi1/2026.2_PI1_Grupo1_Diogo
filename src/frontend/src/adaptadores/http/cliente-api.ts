import type { DadosExecucao, ErroDetalhe, ErroHistorico, FiltroTipoLabirinto } from '../../dominio';
import { LIMITE_AMOSTRAS_ENERGIA, ehTipoLabirinto, execucaoInicial } from '../../dominio';
import type { ResultadoDetalhe, SaudeBackend } from '../../estado';
import type { DetalheCorridaHttp, RespostaListaCorridas } from '../../protocolo';
import { dadosDasMetricas } from '../metricas';

export async function obterSaude(sinal?: AbortSignal): Promise<SaudeBackend> {
  try {
    const resposta = await fetch('/health', { signal: sinal ?? null });
    const corpo = (await resposta.json()) as { banco?: string };
    return { backend: 'ok', banco: corpo.banco === 'ok' ? 'ok' : 'indisponivel' };
  } catch {
    return { backend: 'indisponivel', banco: 'desconhecido' };
  }
}

export interface FiltrosCorridas {
  labirinto: FiltroTipoLabirinto;
  pagina: number;
  tamanhoPagina: number;
}

export class ErroConsultaCorridas extends Error {
  readonly tipo: ErroHistorico;

  constructor(tipo: ErroHistorico) {
    super(`Falha ao consultar corridas (${tipo})`);
    this.name = 'ErroConsultaCorridas';
    this.tipo = tipo;
  }
}

export async function listarCorridas(
  filtros: FiltrosCorridas,
  sinal?: AbortSignal,
): Promise<RespostaListaCorridas> {
  const consulta = new URLSearchParams({
    pagina: String(filtros.pagina),
    tamanho: String(filtros.tamanhoPagina),
  });
  if (filtros.labirinto !== 'TODOS') consulta.set('tipo', filtros.labirinto);

  let resposta: Response;
  try {
    resposta = await fetch(`/api/corridas?${consulta.toString()}`, { signal: sinal ?? null });
  } catch (erro) {
    if (sinal?.aborted) throw erro;
    throw new ErroConsultaCorridas('REDE');
  }
  if (!resposta.ok) throw new ErroConsultaCorridas('SERVIDOR');

  try {
    const corpo = (await resposta.json()) as RespostaListaCorridas;
    if (
      !Array.isArray(corpo.itens) ||
      typeof corpo.total !== 'number' ||
      typeof corpo.pagina !== 'number' ||
      typeof corpo.tamanho !== 'number'
    ) {
      throw new ErroConsultaCorridas('SERVIDOR');
    }
    return corpo;
  } catch (erro) {
    if (sinal?.aborted) throw erro;
    throw erro instanceof ErroConsultaCorridas ? erro : new ErroConsultaCorridas('SERVIDOR');
  }
}

export class ErroConsultaCorrida extends Error {
  readonly tipo: ErroDetalhe;

  constructor(tipo: ErroDetalhe) {
    super(`Falha ao consultar a corrida (${tipo})`);
    this.name = 'ErroConsultaCorrida';
    this.tipo = tipo;
  }
}

const STATUS_VALIDOS: ReadonlySet<string> = new Set([
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'FALHOU',
  'INTERROMPIDA',
]);

/**
 * Abre uma execução do histórico (HU-FE-11): `GET /api/corridas/:id`.
 * 404 → `NAO_ENCONTRADA`; sem resposta → `REDE`; HTTP de erro ou corpo inválido → `SERVIDOR`.
 */
export async function obterCorrida(id: string, sinal?: AbortSignal): Promise<ResultadoDetalhe> {
  let resposta: Response;
  try {
    resposta = await fetch(`/api/corridas/${encodeURIComponent(id)}`, { signal: sinal ?? null });
  } catch (erro) {
    if (sinal?.aborted) throw erro;
    throw new ErroConsultaCorrida('REDE');
  }
  if (resposta.status === 404) throw new ErroConsultaCorrida('NAO_ENCONTRADA');
  if (!resposta.ok) throw new ErroConsultaCorrida('SERVIDOR');

  try {
    const corpo = (await resposta.json()) as DetalheCorridaHttp;
    if (
      corpo === null ||
      typeof corpo !== 'object' ||
      typeof corpo.id !== 'string' ||
      typeof corpo.iniciada_em !== 'string' ||
      !STATUS_VALIDOS.has(corpo.status)
    ) {
      throw new ErroConsultaCorrida('SERVIDOR');
    }
    return { dados: paraDadosExecucao(corpo), iniciadaEm: corpo.iniciada_em };
  } catch (erro) {
    if (sinal?.aborted) throw erro;
    throw erro instanceof ErroConsultaCorrida ? erro : new ErroConsultaCorrida('SERVIDOR');
  }
}

/** Detalhe do backend → mesma estrutura de dados que a tela ao vivo usa (HU-FE-11 CA1). */
function paraDadosExecucao(corpo: DetalheCorridaHttp): DadosExecucao {
  const tipo: unknown = corpo.tipo_labirinto;
  const trajeto = (Array.isArray(corpo.trajeto) ? corpo.trajeto : [])
    .map((ponto) => ({ seq: ponto.sequencia, x: ponto.x, y: ponto.y }))
    .sort((a, b) => a.seq - b.seq);
  const energia = (Array.isArray(corpo.energia) ? corpo.energia : [])
    .map((amostra) => ({
      seq: null,
      tempoMs: amostra.tempo_ms,
      tensaoV: amostra.tensao_v,
      correnteA: amostra.corrente_a,
      potenciaW: amostra.potencia_w,
      cargaPct: amostra.carga_estimada_pct,
    }))
    .slice(-LIMITE_AMOSTRAS_ENERGIA);
  const ultima = energia.at(-1);

  return {
    ...execucaoInicial,
    // Sem leitura nas métricas, o último valor da série é o valor final da tentativa.
    ...(ultima
      ? {
          tensaoV: ultima.tensaoV,
          correnteA: ultima.correnteA,
          potenciaW: ultima.potenciaW,
          cargaPct: ultima.cargaPct,
        }
      : {}),
    ...dadosDasMetricas(corpo.metricas),
    corrida: corpo.id,
    tipoLabirinto: ehTipoLabirinto(tipo) ? tipo : null,
    tipoInvalido: !ehTipoLabirinto(tipo),
    status: corpo.status,
    motivoTermino: corpo.motivo_termino ?? null,
    detalheFalha: corpo.detalhe ?? null,
    mapa: Array.isArray(corpo.mapa) ? corpo.mapa : [],
    trajeto,
    // O histórico não traz a posição final: o mapa usa a última passagem do trajeto.
    energia,
  };
}
