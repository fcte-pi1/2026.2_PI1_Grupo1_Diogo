import type { ErroHistorico, FiltroTipoLabirinto } from '../../dominio';
import type { SaudeBackend } from '../../estado';
import type { RespostaListaCorridas } from '../../protocolo';

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
