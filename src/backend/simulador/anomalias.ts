/**
 * Mensagens problemáticas para os testes de robustez do backend (CT-BE-05 a CT-BE-08 e CT-BE-17).
 *
 * Há dois usos:
 * - **Funções avulsas** (`semCampo`, `foraDoLabirinto`…): montam o texto de uma mensagem ruim a
 *   partir de uma válida. Os testes E2E enviam esse texto com `simulador.enviar()`, no ponto
 *   exato que o caso de teste pede.
 * - **`planejarEnvio`**: espalha as anomalias pedidas numa corrida gerada, para a linha de comando
 *   e as demonstrações. A corrida continua COMPLETA: cada mensagem inválida usa a `sequencia` de
 *   uma válida, que é enviada logo depois. Por isso o backend rejeita a inválida, aceita a válida
 *   e confirma a corrida inteira, sem lacunas. Função pura: a mesma semente dá o mesmo plano.
 */
import type { MensagemCorrida } from '../protocolo/tipos.js';
import { inteiroEntre, type Aleatorio } from './aleatorio.js';

export const TIPOS_ANOMALIA = [
  'duplicada',
  'fora-de-ordem',
  'sem-campo',
  'nao-json',
  'tipo-desconhecido',
  'labirinto-invalido',
  'fora-do-labirinto',
  'tensao-fora-da-faixa',
  'tempo-regredindo',
] as const;

export type TipoAnomalia = (typeof TIPOS_ANOMALIA)[number];

/** Atalhos aceitos em `--anomalias`. */
export const GRUPOS_ANOMALIA: Readonly<Record<string, readonly TipoAnomalia[]>> = {
  malformadas: ['sem-campo', 'nao-json', 'tipo-desconhecido', 'labirinto-invalido'],
  impossiveis: ['fora-do-labirinto', 'tensao-fora-da-faixa', 'tempo-regredindo'],
  todas: TIPOS_ANOMALIA,
};

/** O que o backend deve fazer com cada anomalia (motivo gravado em `mensagem_rejeitada`). */
export const REACAO_ESPERADA: Readonly<Record<TipoAnomalia, string>> = {
  duplicada: 'confirmada com ack, mas gravada e distribuída uma única vez',
  'fora-de-ordem': 'gravada, mas distribuída só depois de a lacuna fechar',
  'sem-campo': 'rejeitada: ESQUEMA_INVALIDO',
  'nao-json': 'rejeitada: JSON_INVALIDO',
  'tipo-desconhecido': 'rejeitada: TIPO_DESCONHECIDO',
  'labirinto-invalido': 'rejeitada: ESQUEMA_INVALIDO',
  'fora-do-labirinto': 'rejeitada: COORDENADA_FORA_DO_LABIRINTO',
  'tensao-fora-da-faixa': 'rejeitada (duas vezes): TENSAO_FORA_DA_FAIXA',
  'tempo-regredindo': 'rejeitada: TEMPO_REGRESSIVO',
};

export interface Anomalia {
  tipo: TipoAnomalia;
  /**
   * Mensagem válida usada como base. Sem ela, é sorteada no meio da corrida. Quando a mensagem
   * desta sequência não serve (ex.: `fora-do-labirinto` precisa de uma `celula`), vale a
   * primeira que serve depois dela.
   */
  sequencia?: number;
  /** `duplicada`: quantas cópias além da original. Padrão: 2 (três envios, como no CT-BE-08). */
  vezes?: number;
  /** `fora-de-ordem`: quantas mensagens passam na frente. Padrão: 2. */
  distancia?: number;
}

export interface AnomaliaPlanejada {
  tipo: TipoAnomalia;
  /** Sequência da mensagem válida usada como base. */
  sequencia: number;
  /** Mensagens inválidas ou repetidas que entram no envio. */
  injecoes: number;
}

export type PassoEnvio =
  | { acao: 'emitir'; mensagem: MensagemCorrida }
  | { acao: 'injetar'; texto: string; anomalia: TipoAnomalia; sequencia: number };

export interface PlanoEnvio {
  passos: PassoEnvio[];
  anomalias: AnomaliaPlanejada[];
}

export interface DimensoesLabirinto {
  colunas: number;
  linhas: number;
}

// ============================================================================
// Funções avulsas: uma mensagem válida → o texto de uma inválida
// ============================================================================

/** Campo obrigatório que `semCampo` tira, por tipo. Para a `celula`, é o do CT-BE-05. */
const CAMPO_OBRIGATORIO: Record<MensagemCorrida['tipo'], string> = {
  inicio_corrida: 'labirinto',
  celula: 'paredes',
  posicao: 'orientacao',
  energia: 'tensao_v',
  estado: 'estado',
  fim_corrida: 'resultado',
};

/** A mensagem sem um campo obrigatório (por padrão, `paredes` na `celula`). Falha no esquema. */
export function semCampo(mensagem: MensagemCorrida, campo?: string): string {
  const copia: Record<string, unknown> = { ...mensagem };
  delete copia[campo ?? CAMPO_OBRIGATORIO[mensagem.tipo]];
  return JSON.stringify(copia);
}

/** Um texto que não é JSON (uma linha cortada no meio pelo BLE, por exemplo). */
export function textoNaoJson(): string {
  return '{"versao":1,"tipo":"celula","corrida": isto não é JSON';
}

/** A mensagem com um `tipo` que o protocolo não conhece (`teleporte`, como no CT-BE-05). */
export function tipoDesconhecido(mensagem: MensagemCorrida, tipo = 'teleporte'): string {
  return JSON.stringify({ ...mensagem, tipo });
}

/** Um `inicio_corrida` com um tipo de labirinto que não existe (`5x5`, como no CT-BE-07). */
export function labirintoInvalido(mensagem: MensagemCorrida, labirinto = '5x5'): string {
  return JSON.stringify({ ...mensagem, labirinto });
}

/**
 * Uma `celula` com coordenada que passa no esquema (0 a 11), mas não existe no labirinto da
 * corrida. Usa a coluna `colunas + 1` (no 4x4, `x = 5`, como no CT-BE-06) e, no 12x4, em que
 * não sobra coluna dentro do esquema, a linha `linhas + 1`.
 */
export function foraDoLabirinto(mensagem: MensagemCorrida, dimensoes: DimensoesLabirinto): string {
  const fora =
    dimensoes.colunas + 1 <= 11 ? { x: dimensoes.colunas + 1 } : { y: dimensoes.linhas + 1 };
  return JSON.stringify({ ...mensagem, ...fora });
}

/** Uma `energia` com outra tensão (para tensões fora de 5 a 9 V, como no CT-BE-07). */
export function comTensao(mensagem: MensagemCorrida, tensaoV: number): string {
  const potencia =
    'corrente_a' in mensagem ? { potencia_w: arredondar(tensaoV * mensagem.corrente_a) } : {};
  return JSON.stringify({ ...mensagem, tensao_v: tensaoV, ...potencia });
}

/** A mensagem com outro `tempo_ms` (para o tempo que regride, como no CT-BE-07). */
export function comTempo(mensagem: MensagemCorrida, tempoMs: number): string {
  return JSON.stringify({ ...mensagem, tempo_ms: tempoMs });
}

// ============================================================================
// Plano de envio de uma corrida com anomalias
// ============================================================================

/** Quanto antes da anterior fica o `tempo_ms` da anomalia `tempo-regredindo`. */
const RECUO_TEMPO_MS = 100;

/**
 * Monta a ordem de envio da corrida com as anomalias. As mensagens válidas aparecem todas,
 * cada uma uma única vez; as anomalias entram em volta delas.
 */
export function planejarEnvio(
  mensagens: readonly MensagemCorrida[],
  dimensoes: DimensoesLabirinto,
  anomalias: readonly Anomalia[],
  aleatorio: Aleatorio,
): PlanoEnvio {
  const ordenadas = [...mensagens].sort((a, b) => a.sequencia - b.sequencia);
  const porSequencia = new Map(ordenadas.map((m) => [m.sequencia, m]));
  const total = ordenadas.length;
  const ocupadas = new Set<number>();

  const antes = new Map<number, PassoEnvio[]>();
  const depois = new Map<number, PassoEnvio[]>();
  const inserir = (onde: Map<number, PassoEnvio[]>, sequencia: number, passo: PassoEnvio) => {
    const lista = onde.get(sequencia) ?? [];
    lista.push(passo);
    onde.set(sequencia, lista);
  };
  /** Sequências que passam na frente de cada uma (fora de ordem). */
  const adiadas = new Map<number, number>();

  // As de sequência fixa são posicionadas primeiro, para as sorteadas não ocuparem o lugar delas.
  const pedidos = [...anomalias].sort(
    (a, b) => Number(a.sequencia === undefined) - Number(b.sequencia === undefined),
  );
  const planejadas: AnomaliaPlanejada[] = [];

  for (const anomalia of pedidos) {
    validarAnomalia(anomalia);
    const distancia = anomalia.distancia ?? 2;
    const serve = (sequencia: number): boolean => {
      const base = porSequencia.get(sequencia);
      if (!base || !servePara(anomalia.tipo, base, total, distancia, porSequencia)) return false;
      // A janela da anomalia não pode encostar na de outra: uma mexeria no efeito da outra.
      const fim = anomalia.tipo === 'fora-de-ordem' ? sequencia + distancia : sequencia;
      for (let s = sequencia - 1; s <= fim + 1; s++) if (ocupadas.has(s)) return false;
      return true;
    };

    const sequencia = escolherSequencia(anomalia, total, serve, aleatorio);
    const fim = anomalia.tipo === 'fora-de-ordem' ? sequencia + distancia : sequencia;
    for (let s = sequencia; s <= fim; s++) ocupadas.add(s);

    const base = porSequencia.get(sequencia)!;
    const injetar = (texto: string, onde = antes) =>
      inserir(onde, sequencia, { acao: 'injetar', texto, anomalia: anomalia.tipo, sequencia });
    let injecoes = 1;

    switch (anomalia.tipo) {
      case 'duplicada':
        injecoes = anomalia.vezes ?? 2;
        for (let i = 0; i < injecoes; i++) injetar(JSON.stringify(base), depois);
        break;
      case 'fora-de-ordem':
        injecoes = 0;
        adiadas.set(sequencia, distancia);
        break;
      case 'sem-campo':
        injetar(semCampo(base));
        break;
      case 'nao-json':
        injetar(textoNaoJson());
        break;
      case 'tipo-desconhecido':
        injetar(tipoDesconhecido(base));
        break;
      case 'labirinto-invalido':
        injetar(labirintoInvalido(base));
        break;
      case 'fora-do-labirinto':
        injetar(foraDoLabirinto(base, dimensoes));
        break;
      case 'tensao-fora-da-faixa':
        injecoes = 2;
        injetar(comTensao(base, 4.9));
        injetar(comTensao(base, 9.1));
        break;
      case 'tempo-regredindo': {
        const anterior = porSequencia.get(sequencia - 1)!;
        injetar(comTempo(base, anterior.tempo_ms - RECUO_TEMPO_MS));
        break;
      }
    }
    planejadas.push({ tipo: anomalia.tipo, sequencia, injecoes });
  }

  // Ordem das válidas: cada adiada sai depois das `distancia` seguintes.
  const ordem: number[] = [];
  for (let i = 0; i < ordenadas.length; i++) {
    const sequencia = ordenadas[i]!.sequencia;
    const distancia = adiadas.get(sequencia);
    if (distancia === undefined) {
      ordem.push(sequencia);
      continue;
    }
    for (let j = 1; j <= distancia; j++) ordem.push(ordenadas[i + j]!.sequencia);
    ordem.push(sequencia);
    i += distancia;
  }

  const passos: PassoEnvio[] = ordem.flatMap((sequencia) => [
    ...(antes.get(sequencia) ?? []),
    { acao: 'emitir' as const, mensagem: porSequencia.get(sequencia)! },
    ...(depois.get(sequencia) ?? []),
  ]);
  planejadas.sort((a, b) => a.sequencia - b.sequencia);
  return { passos, anomalias: planejadas };
}

function validarAnomalia(anomalia: Anomalia): void {
  if (!(TIPOS_ANOMALIA as readonly string[]).includes(anomalia.tipo)) {
    throw new RangeError(`anomalia desconhecida: ${String(anomalia.tipo)}`);
  }
  for (const campo of ['vezes', 'distancia'] as const) {
    const valor = anomalia[campo];
    if (valor !== undefined && !(Number.isInteger(valor) && valor >= 1)) {
      throw new RangeError(`${campo} da anomalia ${anomalia.tipo} deve ser um inteiro ≥ 1`);
    }
  }
}

/** A mensagem `base` pode receber esta anomalia? */
function servePara(
  tipo: TipoAnomalia,
  base: MensagemCorrida,
  total: number,
  distancia: number,
  porSequencia: ReadonlyMap<number, MensagemCorrida>,
): boolean {
  const s = base.sequencia;
  switch (tipo) {
    case 'labirinto-invalido':
      return base.tipo === 'inicio_corrida';
    case 'sem-campo':
    case 'fora-do-labirinto':
      return base.tipo === 'celula' && s > 1;
    case 'tensao-fora-da-faixa':
      return base.tipo === 'energia';
    case 'tempo-regredindo': {
      const anterior = porSequencia.get(s - 1);
      return anterior !== undefined && anterior.tempo_ms >= RECUO_TEMPO_MS;
    }
    case 'fora-de-ordem':
      // Nem o início nem o fim trocam de lugar: o fim tem de ser a última mensagem válida.
      return s > 1 && s + distancia < total;
    case 'duplicada':
    case 'nao-json':
    case 'tipo-desconhecido':
      return s > 1;
  }
}

function escolherSequencia(
  anomalia: Anomalia,
  total: number,
  serve: (sequencia: number) => boolean,
  aleatorio: Aleatorio,
): number {
  if (anomalia.sequencia !== undefined) {
    for (let s = anomalia.sequencia; s <= total; s++) if (serve(s)) return s;
    throw new RangeError(
      `nenhuma mensagem a partir da sequência ${anomalia.sequencia} serve para a anomalia ${anomalia.tipo}`,
    );
  }
  // Sorteia no meio da corrida (de 20 % a 80 %), onde o robô já está andando.
  const meio: number[] = [];
  const todas: number[] = [];
  for (let s = 1; s <= total; s++) {
    if (!serve(s)) continue;
    todas.push(s);
    if (s >= total * 0.2 && s <= total * 0.8) meio.push(s);
  }
  const candidatas = meio.length > 0 ? meio : todas;
  if (candidatas.length === 0) {
    throw new RangeError(`a corrida não tem mensagem que sirva para a anomalia ${anomalia.tipo}`);
  }
  return candidatas[inteiroEntre(aleatorio, 0, candidatas.length - 1)]!;
}

function arredondar(valor: number): number {
  return Math.round(valor * 1000) / 1000;
}
