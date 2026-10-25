/**
 * Instrumentos das medições de desempenho (CT-BE-32 a CT-BE-34, #373): o painel de teste (PNL
 * do roteiro de testes), o socket do simulador que cronometra cada envio, o cliente HTTP do
 * backend e a leitura das opções da linha de comando.
 *
 * O simulador e os painéis rodam no MESMO processo: o envio e a chegada são medidos com o
 * mesmo relógio (`performance.now()`), sem depender de sincronizar relógios (CT-BE-32).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { criarSocketWs, type SocketSimulador } from '../simulador/enlace.js';
import {
  contarSequenciasCsv,
  type ContagemSequencias,
  type IndiceEnvios,
  type Recepcao,
  type Resumo,
} from './estatistica.js';

export const URL_PADRAO = 'http://localhost:8080';

// -----------------------------------------------------------------------------
// Simulador: socket que registra o instante de cada envio
// -----------------------------------------------------------------------------

/**
 * Fábrica de socket para o `criarSimulador({ criarSocket })`: o socket padrão do simulador
 * (`ws`, com a queda sem fechamento e o pong controlado), com o instante de cada envio
 * registrado em `envios` antes de a mensagem sair.
 */
export function criarSocketCronometrado(envios: IndiceEnvios): (url: string) => SocketSimulador {
  return (url) => {
    const base = criarSocketWs(url);
    return {
      get readyState() {
        return base.readyState;
      },
      get bufferedAmount() {
        return base.bufferedAmount ?? 0;
      },
      send(dados) {
        const em = performance.now();
        base.send(dados);
        envios.registrarTexto(dados, em);
      },
      close: (codigo, motivo) => base.close(codigo, motivo),
      addEventListener: base.addEventListener,
      ...(base.terminate && { terminate: base.terminate }),
      ...(base.responderPing && { responderPing: base.responderPing }),
    };
  };
}

// -----------------------------------------------------------------------------
// Painel de teste (PNL)
// -----------------------------------------------------------------------------

type Mensagem = Record<string, unknown>;

/**
 * Cliente de painel de teste: conecta em `/ws/painel`, se inscreve no canal `ao_vivo` e, se
 * `inscreverAutomatico`, em cada corrida que começa. Grava cada evento de célula e cada
 * contínuo com o instante de chegada. É só leitura, como o painel de verdade (RNF-55).
 */
export class PainelTeste {
  /** Status de cada corrida anunciada no `ao_vivo`, pelo UUID, na ordem dos anúncios. */
  readonly corridas = new Map<string, string>();
  /** Conexões que caíram sem o painel pedir (o critério do CT-BE-33 é zero). */
  readonly fechamentosInesperados: { codigo: number; motivo: string }[] = [];
  mensagens = 0;
  private ws: WebSocket | null = null;
  private encerrando = false;
  private readonly inscritas = new Set<string>();
  private readonly aguardandoSnapshot = new Map<string, (snapshot: Mensagem) => void>();

  constructor(
    readonly indice: number,
    private readonly url: string,
    private readonly destino: Recepcao[],
    private readonly inscreverAutomatico = true,
  ) {}

  get conectado(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  conectar(): Promise<void> {
    this.encerrando = false;
    this.inscritas.clear();
    return new Promise((resolver, rejeitar) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.on('open', () => {
        ws.send(JSON.stringify({ tipo: 'inscrever', canal: 'ao_vivo' }));
        resolver();
      });
      ws.on('error', (erro) => {
        if (ws.readyState !== WebSocket.OPEN) rejeitar(erro);
      });
      ws.on('close', (codigo, motivo) => {
        if (!this.encerrando && this.ws === ws) {
          this.fechamentosInesperados.push({ codigo, motivo: motivo.toString() });
        }
      });
      ws.on('message', (dados) => this.aoReceber(dados.toString(), performance.now()));
    });
  }

  /**
   * Pede um `snapshot` novo da corrida (cancela e refaz a inscrição) e devolve o snapshot.
   * Usado no CT-BE-34 para comparar o estado antes da queda com o reconstruído.
   */
  pedirSnapshot(corrida: string, prazoMs = 3000): Promise<Mensagem> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`painel ${this.indice} sem conexão`));
    }
    return new Promise((resolver, rejeitar) => {
      const temporizador = setTimeout(() => {
        this.aguardandoSnapshot.delete(corrida);
        rejeitar(new Error(`snapshot da corrida ${corrida} não chegou em ${prazoMs} ms`));
      }, prazoMs);
      this.aguardandoSnapshot.set(corrida, (snapshot) => {
        clearTimeout(temporizador);
        resolver(snapshot);
      });
      ws.send(JSON.stringify({ tipo: 'cancelar', corrida }));
      ws.send(JSON.stringify({ tipo: 'inscrever', corrida }));
      this.inscritas.add(corrida);
    });
  }

  encerrar(): Promise<void> {
    this.encerrando = true;
    const ws = this.ws;
    if (!ws || ws.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise((resolver) => {
      ws.once('close', () => resolver());
      ws.close(1000, 'painel de teste encerrado');
      setTimeout(() => {
        ws.terminate();
        resolver();
      }, 2000).unref();
    });
  }

  private aoReceber(texto: string, em: number): void {
    this.mensagens++;
    let m: Mensagem;
    try {
      m = JSON.parse(texto) as Mensagem;
    } catch {
      return;
    }
    const corrida = typeof m.corrida === 'string' ? m.corrida : null;
    switch (m.tipo) {
      case 'ao_vivo':
        if (!corrida) return;
        this.corridas.set(corrida, String(m.status));
        if (
          this.inscreverAutomatico &&
          m.status === 'EM_ANDAMENTO' &&
          !this.inscritas.has(corrida)
        ) {
          this.inscritas.add(corrida);
          this.ws?.send(JSON.stringify({ tipo: 'inscrever', corrida }));
        }
        return;
      case 'snapshot':
        if (corrida) {
          const aguardando = this.aguardandoSnapshot.get(corrida);
          this.aguardandoSnapshot.delete(corrida);
          aguardando?.(m);
        }
        return;
      case 'evento':
        if (m.evento !== 'celula' || !corrida) return;
        this.destino.push({
          painel: this.indice,
          tipo: 'evento',
          corrida,
          sequencia: Number(m.sequencia),
          tempoMs: Number(m.tempo_ms),
          em,
        });
        return;
      case 'continuo':
        if (!corrida) return;
        this.destino.push({
          painel: this.indice,
          tipo: 'continuo',
          corrida,
          sequencia: null,
          tempoMs: Number(m.tempo_ms),
          em,
        });
        return;
      default:
        return;
    }
  }
}

// -----------------------------------------------------------------------------
// Backend: HTTP
// -----------------------------------------------------------------------------

export interface Health {
  status: string;
  banco: string;
  uptime_s: number;
  event_loop_atraso_ms: { p50: number; p99: number };
  ingestao: {
    mensagens_aceitas: number;
    mensagens_duplicadas: number;
    mensagens_rejeitadas: number;
    conexoes_recusadas: number;
  };
  latencia_painel_ms?: { eventos: Resumo; continuos: Resumo };
}

export interface RespostaHealth {
  codigo: number;
  corpo: Health | null;
  /** Tempo de resposta do `/health`, em ms. */
  ms: number;
}

export class ClienteHttp {
  constructor(readonly base: string) {}

  /** Endereço WebSocket do mesmo backend (`http` → `ws`, `https` → `wss`). */
  ws(caminho: string): string {
    return this.base.replace(/^http/, 'ws') + caminho;
  }

  /** `GET /health`. Com o backend fora do ar, `codigo` é 0 e `corpo` é `null`. */
  async health(prazoMs = 2000): Promise<RespostaHealth> {
    const inicio = performance.now();
    try {
      const resposta = await fetch(`${this.base}/health`, {
        signal: AbortSignal.timeout(prazoMs),
      });
      const corpo = (await resposta.json()) as Health;
      return { codigo: resposta.status, corpo, ms: performance.now() - inicio };
    } catch {
      return { codigo: 0, corpo: null, ms: performance.now() - inicio };
    }
  }

  /** Consulta o `/health` até ele responder `200` e devolve o instante, ou `null` no prazo. */
  async aguardarPronto(prazoMs: number, intervaloMs = 100): Promise<number | null> {
    const limite = performance.now() + prazoMs;
    while (performance.now() < limite) {
      const { codigo } = await this.health(Math.min(1000, intervaloMs * 5));
      if (codigo === 200) return performance.now();
      await dormir(intervaloMs);
    }
    return null;
  }

  async detalhe(corrida: string): Promise<Record<string, unknown>> {
    const resposta = await fetch(`${this.base}/api/corridas/${corrida}`);
    if (!resposta.ok) throw new Error(`GET /api/corridas/${corrida}: ${resposta.status}`);
    return (await resposta.json()) as Record<string, unknown>;
  }

  /** Exportação CSV (RF-98) e a contagem das sequências gravadas. */
  async exportarCsv(
    corrida: string,
  ): Promise<{ codigo: number; ms: number; bytes: number; contagem: ContagemSequencias }> {
    const inicio = performance.now();
    const resposta = await fetch(`${this.base}/api/corridas/${corrida}/exportacao?formato=csv`);
    const texto = await resposta.text();
    return {
      codigo: resposta.status,
      ms: performance.now() - inicio,
      bytes: Buffer.byteLength(texto),
      contagem: contarSequenciasCsv(texto),
    };
  }

  /** UUID da corrida no backend → id gerado pelo robô (`corrida_robo` do detalhe). */
  async mapearCorridas(uuids: Iterable<string>): Promise<Map<string, string>> {
    const mapa = new Map<string, string>();
    for (const uuid of new Set(uuids)) {
      const detalhe = await this.detalhe(uuid);
      mapa.set(uuid, String(detalhe.corrida_robo));
    }
    return mapa;
  }
}

/**
 * Os histogramas do `/health` valem desde o início do processo. Para a medição valer, o
 * backend tem de estar recém-reiniciado e sem nenhuma mensagem ainda. Devolve o problema
 * encontrado, ou `null`.
 */
export function problemaBackendNaoLimpo(health: Health): string | null {
  const latencia = health.latencia_painel_ms;
  if (!latencia) return 'o /health não tem latencia_painel_ms: o backend é anterior ao PR #390';
  const amostras = latencia.eventos.amostras + latencia.continuos.amostras;
  if (health.ingestao.mensagens_aceitas > 0 || amostras > 0) {
    return (
      `o backend já recebeu ${health.ingestao.mensagens_aceitas} mensagens desde que subiu ` +
      `(${health.uptime_s} s), e os histogramas do /health valem desde o início do processo`
    );
  }
  return null;
}

// -----------------------------------------------------------------------------
// Critérios, saída e opções
// -----------------------------------------------------------------------------

export interface Criterio {
  nome: string;
  limite: string;
  medido: string;
  ok: boolean;
}

export function ms(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? '—' : `${valor.toFixed(2)} ms`;
}

export function tabelaCriterios(criterios: readonly Criterio[]): string {
  const linhas = criterios.map(
    (c) => `| ${c.nome} | ${c.limite} | ${c.medido} | ${c.ok ? 'atendido' : '**não atendido**'} |`,
  );
  return ['| Critério | Limite | Medido | Resultado |', '|:--|:--|:--|:--|', ...linhas].join('\n');
}

export function tabelaResumos(linhas: readonly [string, Resumo | null | undefined][]): string {
  const corpo = linhas.map(
    ([nome, r]) =>
      `| ${nome} | ${r?.amostras ?? 0} | ${ms(r?.p50)} | ${ms(r?.p95)} | ${ms(r?.p99)} | ${ms(r?.max)} |`,
  );
  return [
    '| Medida | Amostras | p50 | p95 | p99 | máx. |',
    '|:--|--:|--:|--:|--:|--:|',
    ...corpo,
  ].join('\n');
}

const PASTA_RESULTADOS = fileURLToPath(new URL('./resultados/', import.meta.url));

/** Grava o resultado em `medicoes/resultados/<caso>-<data>.json` e devolve o caminho. */
export async function salvarResultado(caso: string, dados: unknown): Promise<string> {
  await mkdir(PASTA_RESULTADOS, { recursive: true });
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const caminho = `${PASTA_RESULTADOS}${caso.toLowerCase()}-${carimbo}.json`;
  await writeFile(caminho, `${JSON.stringify(dados, null, 2)}\n`);
  return caminho;
}

export function registrar(mensagem: string): void {
  const hora = new Date().toISOString().slice(11, 23);
  console.log(`${hora} ${mensagem}`);
}

export function inteiroPositivo(nome: string, valor: string | undefined, padrao: number): number {
  if (valor === undefined) return padrao;
  const n = Number(valor);
  if (!(Number.isFinite(n) && n > 0)) throw new RangeError(`--${nome} inválido: ${valor}`);
  return n;
}

export function dormir(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}
