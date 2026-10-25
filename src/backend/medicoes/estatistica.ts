/**
 * Estatística e pareamento das medições de desempenho (CT-BE-32 a CT-BE-34, #373).
 *
 * Funções puras, sem rede: os testes unitários em `testes/unit/medicoes/` as verificam.
 */

/** Percentis de uma amostra, em ms com duas casas. Sem amostras, os valores são `null`. */
export interface Resumo {
  amostras: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
}

/**
 * Percentil pelo método do posto mais próximo (*nearest rank*): o menor valor que deixa pelo
 * menos `p`% das amostras abaixo dele ou iguais a ele. É sempre um valor que foi medido, sem
 * interpolação. `ordenadas` precisa estar em ordem crescente.
 */
export function percentil(ordenadas: readonly number[], p: number): number | null {
  if (!(p > 0 && p <= 100)) throw new RangeError(`percentil inválido: ${p}`);
  if (ordenadas.length === 0) return null;
  const posto = Math.ceil((p / 100) * ordenadas.length);
  return ordenadas[Math.max(0, posto - 1)]!;
}

export function resumir(valores: readonly number[]): Resumo {
  const ordenadas = [...valores].sort((a, b) => a - b);
  const duasCasas = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
  return {
    amostras: ordenadas.length,
    p50: duasCasas(percentil(ordenadas, 50)),
    p95: duasCasas(percentil(ordenadas, 95)),
    p99: duasCasas(percentil(ordenadas, 99)),
    max: duasCasas(ordenadas.at(-1) ?? null),
  };
}

// -----------------------------------------------------------------------------
// Pareamento envio do simulador → chegada ao painel (latência ponta a ponta)
// -----------------------------------------------------------------------------

/** O que o simulador enviou, com o instante (`performance.now()`) da PRIMEIRA saída. */
export interface Envio {
  corrida: string;
  sequencia: number;
  tipo: string;
  tempoMs: number;
  em: number;
}

/**
 * Índices dos envios do simulador, preenchidos durante a medição.
 * - `porSequencia`: `corrida|sequencia`, para os eventos (`celula`), que trazem a sequência.
 * - `porCiclo`: `corrida|tempo_ms` das mensagens `posicao` e `energia`, para os contínuos. O
 *   contínuo não traz a sequência, só o `tempo_ms` da mensagem mais recente. O robô emite as
 *   duas do mesmo ciclo de telemetria com o mesmo `tempo_ms`; vale a primeira que saiu, o que
 *   é conservador (a latência medida nunca é menor que a real).
 */
export class IndiceEnvios {
  readonly porSequencia = new Map<string, Envio>();
  readonly porCiclo = new Map<string, number>();
  /** Envios repetidos (reenvio do buffer depois de uma reconexão): não mudam o instante. */
  repetidos = 0;

  registrar(envio: Envio): void {
    const chave = `${envio.corrida}|${envio.sequencia}`;
    if (this.porSequencia.has(chave)) {
      this.repetidos++;
      return;
    }
    this.porSequencia.set(chave, envio);
    if (envio.tipo === 'posicao' || envio.tipo === 'energia') {
      const ciclo = `${envio.corrida}|${envio.tempoMs}`;
      if (!this.porCiclo.has(ciclo)) this.porCiclo.set(ciclo, envio.em);
    }
  }

  /**
   * Lê uma mensagem que o simulador colocou no socket. Ignora o que não é mensagem de corrida
   * (o `hello`, ou um texto inválido de anomalia).
   */
  registrarTexto(texto: string, em: number): void {
    let mensagem: unknown;
    try {
      mensagem = JSON.parse(texto);
    } catch {
      return;
    }
    if (typeof mensagem !== 'object' || mensagem === null) return;
    const { corrida, sequencia, tipo, tempo_ms: tempoMs } = mensagem as Record<string, unknown>;
    if (
      typeof corrida !== 'string' ||
      typeof sequencia !== 'number' ||
      typeof tipo !== 'string' ||
      typeof tempoMs !== 'number'
    ) {
      return;
    }
    this.registrar({ corrida, sequencia, tipo, tempoMs, em });
  }
}

/** Uma mensagem de corrida recebida por um painel de teste, com o instante da chegada. */
export interface Recepcao {
  painel: number;
  tipo: 'evento' | 'continuo';
  /** UUID da corrida no backend. */
  corrida: string;
  /** Só nos eventos de célula. */
  sequencia: number | null;
  tempoMs: number;
  em: number;
}

export interface LatenciasPontaAPonta {
  eventos: number[];
  continuos: number[];
  /** Recepções sem envio correspondente (por exemplo, um contínuo montado na recuperação). */
  semPar: number;
}

/**
 * Latência ponta a ponta de cada recepção: chegada ao painel − saída do simulador. Uma amostra
 * por painel e por mensagem. `corridaRobo` traduz o UUID do backend para o id do robô.
 */
export function parear(
  recepcoes: readonly Recepcao[],
  envios: IndiceEnvios,
  corridaRobo: ReadonlyMap<string, string>,
): LatenciasPontaAPonta {
  const resultado: LatenciasPontaAPonta = { eventos: [], continuos: [], semPar: 0 };
  for (const r of recepcoes) {
    const robo = corridaRobo.get(r.corrida);
    if (robo === undefined) {
      resultado.semPar++;
      continue;
    }
    const enviadaEm =
      r.tipo === 'evento'
        ? envios.porSequencia.get(`${robo}|${r.sequencia}`)?.em
        : envios.porCiclo.get(`${robo}|${r.tempoMs}`);
    if (enviadaEm === undefined) {
      resultado.semPar++;
      continue;
    }
    (r.tipo === 'evento' ? resultado.eventos : resultado.continuos).push(r.em - enviadaEm);
  }
  return resultado;
}

// -----------------------------------------------------------------------------
// Exportação CSV (RF-98): contagem das mensagens gravadas sem acesso ao banco
// -----------------------------------------------------------------------------

/** Equivalente, pelo CSV da exportação, ao `count(*)`, `count(DISTINCT seq)` e `max(seq)`. */
export interface ContagemSequencias {
  linhas: number;
  distintas: number;
  maxima: number | null;
}

/**
 * Conta as linhas de dados de um CSV da exportação. A primeira coluna é sempre a `seq`, e a
 * exportação tem uma linha por mensagem aceita (uma linha da tabela `mensagem`).
 */
export function contarSequenciasCsv(csv: string): ContagemSequencias {
  const linhas = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
  const sequencias: number[] = [];
  // A primeira linha é o cabeçalho. A coluna `seq` é numérica e nunca vem entre aspas.
  for (const linha of linhas.slice(1)) {
    if (linha === '') continue;
    const seq = Number(linha.slice(0, linha.indexOf(',')));
    if (Number.isInteger(seq)) sequencias.push(seq);
  }
  return {
    linhas: sequencias.length,
    distintas: new Set(sequencias).size,
    maxima: sequencias.length === 0 ? null : Math.max(...sequencias),
  };
}

// -----------------------------------------------------------------------------
// Comparação de snapshots (CT-BE-34: estado reconstruído = estado antes da queda)
// -----------------------------------------------------------------------------

/**
 * JSON com as chaves dos objetos em ordem alfabética: dois valores iguais dão o mesmo texto,
 * qualquer que seja a ordem das chaves. O `jsonb` do PostgreSQL não guarda a ordem em que as
 * chaves chegaram, então o estado relido do banco pode vir com outra ordem.
 */
export function jsonCanonico(valor: unknown): string {
  const ordenar = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(ordenar);
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, ordenar((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(ordenar(valor)) ?? 'undefined';
}

/**
 * Campos do `snapshot` que diferem entre `antes` e `depois`. O estado do sinal fica de fora:
 * depois de um reinício do backend ele é `PERDIDO` até o robô voltar, por projeto (RF-92).
 * O mapa é comparado sem depender da ordem das células, e nenhum valor depende da ordem das
 * chaves.
 */
export function diferencasSnapshot(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
): string[] {
  const diferentes: string[] = [];
  const campos = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  campos.delete('sinal');
  for (const campo of campos) {
    const va = antes[campo];
    const vd = depois[campo];
    if (campo === 'metricas' && isObjeto(va) && isObjeto(vd)) {
      for (const m of new Set([...Object.keys(va), ...Object.keys(vd)])) {
        if (jsonCanonico(va[m]) !== jsonCanonico(vd[m])) {
          diferentes.push(`metricas.${m}: ${jsonCanonico(va[m])} → ${jsonCanonico(vd[m])}`);
        }
      }
      continue;
    }
    if (campo === 'mapa' && Array.isArray(va) && Array.isArray(vd)) {
      const celulas = (mapa: unknown[]) => mapa.map((c) => jsonCanonico(c)).sort();
      const ca = celulas(va);
      const cd = celulas(vd);
      if (jsonCanonico(ca) !== jsonCanonico(cd)) {
        const soAntes = ca.filter((c) => !cd.includes(c)).length;
        const soDepois = cd.filter((c) => !ca.includes(c)).length;
        diferentes.push(
          `mapa: ${va.length} → ${vd.length} células (${soAntes} só antes, ${soDepois} só depois)`,
        );
      }
      continue;
    }
    if (jsonCanonico(va) !== jsonCanonico(vd)) {
      diferentes.push(`${campo}: ${jsonCanonico(va)} → ${jsonCanonico(vd)}`);
    }
  }
  return diferentes;
}

function isObjeto(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
