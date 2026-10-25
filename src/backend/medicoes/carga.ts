/**
 * Cenário de carga comum ao CT-BE-32 e ao CT-BE-33 (#373): 1 simulador numa taxa fixa e N
 * painéis de teste inscritos, durante pelo menos `duracaoS`. O simulador emite corridas
 * completas, uma atrás da outra, e a última sempre termina: a carga dura um pouco mais que
 * `duracaoS`, e a duração real vai no resultado.
 */
import type { TipoLabirinto } from '../protocolo/tipos.js';
import { criarSimulador, type Fechamento, type ResumoCorrida } from '../simulador/simulador.js';
import { IndiceEnvios, type Recepcao } from './estatistica.js';
import {
  criarSocketCronometrado,
  dormir,
  PainelTeste,
  registrar,
  type ClienteHttp,
} from './instrumentos.js';

export interface OpcoesCarga {
  http: ClienteHttp;
  taxa: number;
  paineis: number;
  duracaoS: number;
  labirinto: TipoLabirinto;
  semente?: number;
  dispositivo?: string;
  token?: string;
}

/** Visão da carga em andamento, para o que roda junto (o `/health` e as exportações do CT-BE-33). */
export interface ContextoCarga {
  readonly inicio: number;
  decorridoMs(): number;
  /** A carga terminou: o que roda junto deve parar. */
  terminou(): boolean;
  /** UUIDs das corridas já encerradas, na ordem dos anúncios do `ao_vivo`. */
  corridasEncerradas(): string[];
}

export interface ResultadoCarga {
  duracaoRealS: number;
  corridas: ResumoCorrida[];
  mensagensEmitidas: number;
  recepcoes: Recepcao[];
  envios: IndiceEnvios;
  paineis: PainelTeste[];
  /** Fechamentos da conexão do simulador. Numa carga normal, só o `1000` do fim. */
  fechamentosSimulador: readonly Fechamento[];
  boot: string;
  /** Semente usada (a informada ou a sorteada): repete o mesmo labirinto e percurso. */
  semente: number;
}

/** Depois da última corrida, espera os últimos contínuos (janela de 100 ms) chegarem. */
const ESPERA_FINAL_MS = 1500;
const PRAZO_ACK_MS = 10_000;

export async function executarCarga(
  opcoes: OpcoesCarga,
  emParalelo?: (contexto: ContextoCarga) => Promise<void>,
): Promise<ResultadoCarga> {
  const { http, taxa, duracaoS } = opcoes;
  const envios = new IndiceEnvios();
  const recepcoes: Recepcao[] = [];

  const paineis = Array.from(
    { length: opcoes.paineis },
    (_, i) => new PainelTeste(i + 1, http.ws('/ws/painel'), recepcoes),
  );
  await Promise.all(paineis.map((p) => p.conectar()));
  registrar(`${paineis.length} painéis de teste inscritos no canal ao_vivo`);

  const sim = criarSimulador({
    url: http.ws('/ws/telemetria'),
    labirinto: opcoes.labirinto,
    taxa,
    ...(opcoes.semente !== undefined && { semente: opcoes.semente }),
    ...(opcoes.dispositivo !== undefined && { dispositivo: opcoes.dispositivo }),
    ...(opcoes.token !== undefined && { token: opcoes.token }),
    criarSocket: criarSocketCronometrado(envios),
  });
  await sim.conectar();
  registrar(
    `simulador ${opcoes.dispositivo ?? 'sim-01'} conectado · boot ${sim.boot} · ` +
      `labirinto ${opcoes.labirinto} · semente ${sim.semente} · ${taxa} msg/s`,
  );

  const inicio = performance.now();
  let terminou = false;
  const contexto: ContextoCarga = {
    inicio,
    decorridoMs: () => performance.now() - inicio,
    terminou: () => terminou,
    corridasEncerradas: () =>
      [...paineis[0]!.corridas].filter(([, status]) => status !== 'EM_ANDAMENTO').map(([id]) => id),
  };
  const paralelo = emParalelo?.(contexto) ?? Promise.resolve();

  const corridas: ResumoCorrida[] = [];
  try {
    while (contexto.decorridoMs() < duracaoS * 1000) {
      const resumo = await sim.iniciarCorrida();
      await sim.aguardarConfirmacao(resumo.mensagens, PRAZO_ACK_MS);
      corridas.push(resumo);
      registrar(
        `corrida ${corridas.length} (${resumo.corrida}): ${resumo.mensagens} mensagens confirmadas · ` +
          `${Math.round(contexto.decorridoMs() / 1000)} s de ${duracaoS} s`,
      );
    }
  } finally {
    terminou = true;
  }
  const duracaoRealS = contexto.decorridoMs() / 1000;
  await paralelo;
  await dormir(ESPERA_FINAL_MS);
  await sim.encerrar();
  await Promise.all(paineis.map((p) => p.encerrar()));

  return {
    duracaoRealS,
    corridas,
    mensagensEmitidas: corridas.reduce((soma, c) => soma + c.mensagens, 0),
    recepcoes,
    envios,
    paineis,
    fechamentosSimulador: sim.fechamentos,
    boot: sim.boot,
    semente: sim.semente,
  };
}
