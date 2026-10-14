/**
 * Converte um percurso nas mensagens do protocolo v1, na ordem e com os tempos em que o robô
 * as enviaria. Função pura: o mesmo percurso, `boot`, `inicioMs` e semente geram sempre as
 * mesmas mensagens. O envio pela rede fica em `simulador.ts`.
 *
 * O formato segue o firmware (`main.cpp` e `TelemetryEmitter` da branch `feat/firmware-hardware`):
 * - id da corrida `r<boot>-<indice>`; `tempo_ms` é o relógio do robô (ms desde o boot);
 * - `inicio_corrida` (sequência 1) e `estado MAPEANDO`;
 * - a cada CICLO_TELEMETRIA_MS: `posicao` e `energia`, com a posição e a leitura do INA219
 *   naquele instante. A velocidade média não é enviada (`snapshot.speed.reset()` no firmware);
 * - a cada célula em que o robô entra: `celula`, com as quatro paredes;
 * - ao chegar: `fim_corrida sucesso`. Não há `estado CONCLUIDO`, porque no firmware a fase vira
 *   `Returning`, que também é `MAPEANDO`.
 *
 * Em `falha`, o robô para no meio do caminho e, depois de DETECCAO_FALHA_MS, envia `estado ERRO`
 * e `fim_corrida falha` com `detalhe`.
 */
import type {
  Celula,
  Energia,
  Estado,
  EstadoNavegacao,
  FimCorrida,
  InicioCorrida,
  MensagemCorrida,
  Orientacao,
  Posicao,
} from '../protocolo/tipos.js';
import { VERSAO_PROTOCOLO } from '../protocolo/tipos.js';
import { inteiroEntre, realEntre, type Aleatorio } from './aleatorio.js';
import type { Coordenada, Labirinto } from './labirinto.js';
import type { Manobra, Percurso } from './percurso.js';

export type ResultadoCorrida = 'sucesso' | 'falha';

/** Período da tarefa de telemetria do firmware (`vTaskDelay(pdMS_TO_TICKS(100))`). */
export const CICLO_TELEMETRIA_MS = 100;
/** Uma célula de 180 mm (`kWheels.cellSizeMm`) a cerca de 0,25 m/s. */
export const TEMPO_AVANCO_MS = 720;
export const TEMPO_GIRO_MS = 400;
export const TEMPO_MEIA_VOLTA_MS = 750;
/** Tempo entre o robô parar e declarar a falha. */
export const DETECCAO_FALHA_MS = 1500;

/** Faixa pedida na #322 para uma LiPo 2S ao longo da corrida (tensão em vazio). */
export const TENSAO_INICIAL_V = 8.2;
export const TENSAO_FINAL_V = 7.4;
/** Queda de tensão sob carga, para a tensão oscilar quando os motores ligam. */
const RESISTENCIA_INTERNA_OHM = 0.15;
const CORRENTE_A: Record<Atividade, number> = { parado: 0.12, andando: 0.38, girando: 0.45 };

type Atividade = 'parado' | 'andando' | 'girando';

export interface OpcoesCorrida {
  labirinto: Labirinto;
  percurso: Percurso;
  boot: string;
  /** Número da corrida desde o boot (o firmware usa 1). */
  indice?: number;
  /** Relógio do robô no `inicio_corrida`, em ms. */
  inicioMs: number;
  resultado: ResultadoCorrida;
  /** Ruído das leituras e ponto da falha. */
  aleatorio: Aleatorio;
  tensaoInicialV?: number;
  tensaoFinalV?: number;
}

export interface CorridaGerada {
  id: string;
  mensagens: MensagemCorrida[];
  resultado: ResultadoCorrida;
  /** Células percorridas (passos), incluindo as revisitas. */
  passos: number;
  revisitas: number;
  /** Duração no relógio do robô, do `inicio_corrida` ao `fim_corrida`. */
  duracaoMs: number;
}

/** Situação do robô a partir de um instante. */
interface Marco {
  t: number;
  posicao: Coordenada;
  orientacao: Orientacao;
  celulas: number;
  atividade: Atividade;
}

/** Mensagem ainda sem `sequencia`, que só é atribuída depois da ordenação. */
interface Item {
  t: number;
  /** Eventos discretos (0) saem antes do ciclo periódico (1) no mesmo instante, como no firmware. */
  prioridade: 0 | 1;
  criar: (sequencia: number) => MensagemCorrida;
}

export function gerarCorrida(opcoes: OpcoesCorrida): CorridaGerada {
  const { labirinto, percurso, aleatorio, inicioMs: t0 } = opcoes;
  const id = `r${opcoes.boot}-${opcoes.indice ?? 1}`;
  const envelope = <T extends MensagemCorrida['tipo']>(tipo: T, sequencia: number, t: number) => ({
    versao: VERSAO_PROTOCOLO,
    tipo,
    corrida: id,
    sequencia,
    tempo_ms: Math.round(t),
  });

  // Em falha, o robô para entre 30 % e 70 % do caminho, sem chegar.
  let resultado = opcoes.resultado;
  let passos = percurso.passos;
  let detalhe: string | undefined;
  if (!percurso.chegou) resultado = 'falha';
  if (resultado === 'falha' && percurso.chegou) {
    const n = passos.length;
    const minimo = Math.max(1, Math.floor(n * 0.3));
    const maximo = Math.max(minimo, Math.floor(n * 0.7));
    passos = passos.slice(0, Math.min(n - 1, inteiroEntre(aleatorio, minimo, maximo)));
  }

  // Linha do tempo do movimento.
  const itens: Item[] = [];
  const discreto = (t: number, criar: Item['criar']) => itens.push({ t, prioridade: 0, criar });
  const celula = (t: number, posicao: Coordenada) =>
    discreto(t, (s): Celula => ({
      ...envelope('celula', s, t),
      ...posicao,
      paredes: labirinto.paredes(posicao),
    }));

  discreto(t0, (s): InicioCorrida => ({
    ...envelope('inicio_corrida', s, t0),
    labirinto: labirinto.tipo,
  }));
  discreto(t0, (s): Estado => ({ ...envelope('estado', s, t0), estado: 'MAPEANDO' }));
  celula(t0, percurso.partida);

  let atual: Marco = {
    t: t0,
    posicao: percurso.partida,
    orientacao: percurso.orientacaoInicial,
    celulas: 0,
    atividade: 'parado',
  };
  const marcos: Marco[] = [atual];
  const marcar = (mudanca: Partial<Marco> & { t: number }) => {
    atual = { ...atual, ...mudanca };
    marcos.push(atual);
  };

  let t = t0;
  for (const passo of passos) {
    if (passo.manobra !== 'nenhuma') {
      marcar({ t, atividade: 'girando' });
      t += duracaoGiro(passo.manobra);
      marcar({ t, orientacao: passo.orientacao, atividade: 'andando' });
    } else {
      marcar({ t, atividade: 'andando' });
    }
    t += TEMPO_AVANCO_MS;
    // A posição só muda ao terminar o avanço, como no `writeState` depois de `navigator.step()`.
    marcar({ t, posicao: passo.posicao, celulas: passo.celulas });
    celula(t, passo.posicao);
  }
  marcar({ t, atividade: 'parado' });

  let estadoFinal: EstadoNavegacao | null = null;
  if (resultado === 'falha') {
    t += DETECCAO_FALHA_MS;
    estadoFinal = 'ERRO';
    detalhe = percurso.chegou
      ? `falha simulada: robô parado em (${atual.posicao.x}, ${atual.posicao.y})`
      : `limite de passos atingido em (${atual.posicao.x}, ${atual.posicao.y})`;
  }
  const tFim = t;
  if (estadoFinal) {
    const estado = estadoFinal;
    discreto(tFim, (s): Estado => ({ ...envelope('estado', s, tFim), estado }));
  }
  discreto(tFim, (s): FimCorrida => {
    const fim: FimCorrida = { ...envelope('fim_corrida', s, tFim), resultado };
    if (detalhe !== undefined) fim.detalhe = detalhe;
    return fim;
  });

  // Ciclos periódicos de posição e energia, enquanto a corrida está em andamento.
  const vInicial = opcoes.tensaoInicialV ?? TENSAO_INICIAL_V;
  const vFinal = opcoes.tensaoFinalV ?? TENSAO_FINAL_V;
  const duracao = Math.max(tFim - t0, 1);
  let m = 0;
  for (let tc = t0; tc < tFim; tc += CICLO_TELEMETRIA_MS) {
    while (m + 1 < marcos.length && marcos[m + 1]!.t <= tc) m++;
    const marco = marcos[m]!;

    const corrente = Math.max(0, CORRENTE_A[marco.atividade] + realEntre(aleatorio, -0.02, 0.02));
    const emVazio = vInicial - (vInicial - vFinal) * ((tc - t0) / duracao);
    const tensao = limitar(
      emVazio - RESISTENCIA_INTERNA_OHM * corrente + realEntre(aleatorio, -0.005, 0.005),
      5,
      9,
    );
    const instante = tc;

    itens.push({
      t: instante,
      prioridade: 1,
      criar: (s): Posicao => ({
        ...envelope('posicao', s, instante),
        x: marco.posicao.x,
        y: marco.posicao.y,
        orientacao: marco.orientacao,
        celulas: marco.celulas,
      }),
    });
    itens.push({
      t: instante,
      prioridade: 1,
      criar: (s): Energia => ({
        ...envelope('energia', s, instante),
        tensao_v: arredondar(tensao),
        corrente_a: arredondar(corrente),
        potencia_w: arredondar(tensao * corrente),
      }),
    });
  }

  // `sort` é estável: no mesmo instante e prioridade, vale a ordem de inserção.
  itens.sort((a, b) => a.t - b.t || a.prioridade - b.prioridade);
  const mensagens = itens.map((item, i) => item.criar(i + 1));

  return {
    id,
    mensagens,
    resultado,
    passos: passos.length,
    revisitas: passos.filter((p) => p.revisita).length,
    duracaoMs: tFim - t0,
  };
}

function duracaoGiro(manobra: Exclude<Manobra, 'nenhuma'>): number {
  return manobra === 'meia_volta' ? TEMPO_MEIA_VOLTA_MS : TEMPO_GIRO_MS;
}

/** Três casas decimais, como a função `num()` do `ProtocolV1.cpp`. */
function arredondar(valor: number): number {
  return Math.round(valor * 1000) / 1000;
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}
