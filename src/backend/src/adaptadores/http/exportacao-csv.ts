/**
 * Exportação de uma corrida em CSV (RF-98, HU-BE-27 CA2): uma linha por mensagem, com os
 * campos do payload achatados em colunas fixas. As colunas são a união dos campos de todos
 * os tipos de mensagem do protocolo v1; a mensagem que não tem o campo deixa a célula vazia.
 */
import type { ItemLinhaDoTempo } from '../../../protocolo/tipos.js';

/** Colunas do CSV, na ordem. As três primeiras são as do HU-BE-27 CA2. */
export const COLUNAS_CSV = [
  'seq',
  't_robo_ms',
  'tipo',
  'recebida_em',
  'labirinto',
  'x',
  'y',
  'orientacao',
  'celulas',
  'velocidade_media_mps',
  'parede_norte',
  'parede_leste',
  'parede_sul',
  'parede_oeste',
  'tensao_v',
  'corrente_a',
  'potencia_w',
  'estado',
  'resultado',
  'detalhe',
] as const;

/** Marca de ordem de bytes: faz a planilha abrir o arquivo como UTF-8 (acentos do `detalhe`). */
const BOM = '﻿';

/** O cabeçalho (com o BOM) e uma linha por item, à medida que os lotes chegam do banco. */
export async function* csv(itens: AsyncIterable<ItemLinhaDoTempo>): AsyncGenerator<string> {
  yield `${BOM}${COLUNAS_CSV.join(',')}\r\n`;
  for await (const item of itens) yield `${linhaCsv(item)}\r\n`;
}

export function linhaCsv(item: ItemLinhaDoTempo): string {
  const m = item.mensagem as unknown as Record<string, unknown>;
  const paredes = (m.paredes ?? {}) as Record<string, unknown>;
  const valores: Record<(typeof COLUNAS_CSV)[number], unknown> = {
    seq: item.sequencia,
    t_robo_ms: item.tempo_ms,
    tipo: item.tipo,
    recebida_em: item.recebida_em,
    labirinto: m.labirinto,
    x: m.x,
    y: m.y,
    orientacao: m.orientacao,
    celulas: m.celulas,
    velocidade_media_mps: m.velocidade_media_mps,
    parede_norte: paredes.norte,
    parede_leste: paredes.leste,
    parede_sul: paredes.sul,
    parede_oeste: paredes.oeste,
    tensao_v: m.tensao_v,
    corrente_a: m.corrente_a,
    potencia_w: m.potencia_w,
    estado: m.estado,
    resultado: m.resultado,
    detalhe: m.detalhe,
  };
  return COLUNAS_CSV.map((c) => celula(valores[c])).join(',');
}

/**
 * Uma célula do CSV (RFC 4180): aspas quando há vírgula, aspas ou quebra de linha. Texto que
 * começa com `=`, `+`, `-`, `@`, tabulação ou retorno ganha um `'` na frente, para a
 * planilha não o executar como fórmula (o `detalhe` é texto livre vindo do robô).
 */
function celula(valor: unknown): string {
  if (valor === undefined || valor === null) return '';
  if (typeof valor !== 'string') return String(valor);
  const texto = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return /[",\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}
