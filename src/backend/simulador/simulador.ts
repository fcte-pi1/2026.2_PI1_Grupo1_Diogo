/**
 * Simulador de robô (RNF-53): API programática.
 *
 * Fala com `/ws/telemetria` exatamente como o robô (pela ponte BLE) fala: `hello` primeiro e,
 * depois, as mensagens da corrida. É usado pela linha de comando (`cli.ts`) e pode ser usado
 * direto pelos testes E2E e Playwright, sem subprocesso:
 *
 *   const sim = criarSimulador({ labirinto: '4x4', taxa: 0 });
 *   await sim.conectar();
 *   const corrida = await sim.iniciarCorrida();
 *   await sim.encerrar();
 *   expect(sim.acks.at(-1)?.sequencia).toBe(corrida.mensagens);
 *
 * REGRA DE OURO: como o robô real, o simulador é um EMISSOR UNIDIRECIONAL. Nenhum passo depende
 * do que o backend responde. Os `ack` recebidos são apenas guardados em `acks`, para os testes
 * poderem verificá-los.
 */
import type { Ack, Hello, MensagemRobo, TipoLabirinto } from '../protocolo/tipos.js';
import { VERSAO_PROTOCOLO } from '../protocolo/tipos.js';
import { criarAleatorio, gerarBoot, inteiroEntre, sementeAleatoria } from './aleatorio.js';
import { gerarCorrida, type CorridaGerada, type ResultadoCorrida } from './corrida.js';
import { gerarLabirinto, type CantoPartida, type Labirinto } from './labirinto.js';
import { explorar, type Percurso } from './percurso.js';

export const URL_PADRAO = 'ws://localhost:8080/ws/telemetria';
/** Taxa do firmware: `posicao` + `energia` a cada 100 ms. */
export const TAXA_PADRAO = 20;

/** Subconjunto da API WebSocket usado pelo simulador (compatível com o `WebSocket` do Node). */
export interface SocketSimulador {
  readonly readyState: number;
  send(dados: string): void;
  close(codigo?: number, motivo?: string): void;
  addEventListener(tipo: 'open', ouvinte: () => void): void;
  addEventListener(tipo: 'message', ouvinte: (evento: { data: unknown }) => void): void;
  addEventListener(
    tipo: 'close',
    ouvinte: (evento: { code: number; reason: string }) => void,
  ): void;
  addEventListener(tipo: 'error', ouvinte: () => void): void;
}

export interface OpcoesSimulador {
  url?: string;
  /** Padrão: `sim-01`, o dispositivo do ambiente de testes (seed). */
  dispositivo?: string;
  /** Padrão: `T-VALIDO`, o token do `sim-01` no seed. */
  token?: string;
  labirinto?: TipoLabirinto;
  /** Mensagens por segundo. `0` envia sem pausas (útil nos testes). */
  taxa?: number;
  resultado?: ResultadoCorrida;
  /** Define o labirinto e o percurso. Sem ela, usa uma semente aleatória (veja `semente`). */
  semente?: number;
  partida?: CantoPartida;
  /** Padrão: 6 dígitos hexadecimais aleatórios, como no firmware. */
  boot?: string;
  /** Troca o WebSocket (testes). */
  criarSocket?: (url: string) => SocketSimulador;
}

export interface Fechamento {
  codigo: number;
  motivo: string;
}

export interface ResumoCorrida {
  corrida: string;
  labirinto: TipoLabirinto;
  resultado: ResultadoCorrida;
  /** Mensagens da corrida enviadas (a última `sequencia`). */
  mensagens: number;
  passos: number;
  revisitas: number;
  /** Duração no relógio do robô. */
  duracaoMs: number;
}

export interface ProgressoCorrida {
  enviadas: number;
  total: number;
}

export interface Simulador {
  readonly boot: string;
  readonly semente: number;
  readonly labirinto: Labirinto;
  /** `ack` recebidos, na ordem de chegada. */
  readonly acks: readonly Ack[];
  /** Tudo o que o backend enviou, como texto (inclui os `ack`). */
  readonly recebidas: readonly string[];
  /** Tudo o que o simulador enviou, como texto (inclui o `hello`). */
  readonly enviadas: readonly string[];
  /** Como a conexão terminou, ou `null` se ainda está aberta (ou nunca abriu). */
  readonly fechamento: Fechamento | null;
  /** Abre a conexão e envia o `hello`. */
  conectar(): Promise<void>;
  /** Gera as mensagens da próxima corrida, sem enviar. */
  gerarCorrida(): CorridaGerada;
  /** Gera e envia uma corrida completa, de `inicio_corrida` a `fim_corrida`, no ritmo de `taxa`. */
  iniciarCorrida(aoProgredir?: (progresso: ProgressoCorrida) => void): Promise<ResumoCorrida>;
  /** Envia uma mensagem qualquer: um objeto do protocolo ou um texto (até inválido). */
  enviar(mensagem: MensagemRobo | string): void;
  /** Fecha a conexão (código 1000) e espera o fechamento. */
  encerrar(): Promise<void>;
}

export class ErroSimulador extends Error {
  constructor(
    mensagem: string,
    readonly fechamento: Fechamento | null = null,
  ) {
    super(mensagem);
    this.name = 'ErroSimulador';
  }
}

const SOCKET_ABERTO = 1;
const ESPERA_FECHAMENTO_MS = 2000;
const PADRAO_BOOT = /^[A-Za-z0-9_-]{1,48}$/;

export function criarSimulador(opcoes: OpcoesSimulador = {}): Simulador {
  const url = opcoes.url ?? URL_PADRAO;
  const dispositivo = opcoes.dispositivo ?? 'sim-01';
  const token = opcoes.token ?? 'T-VALIDO';
  const tipo = opcoes.labirinto ?? '4x4';
  const taxa = opcoes.taxa ?? TAXA_PADRAO;
  const resultado = opcoes.resultado ?? 'sucesso';
  const semente = opcoes.semente ?? sementeAleatoria();
  const boot = opcoes.boot ?? gerarBoot();
  const criarSocket =
    opcoes.criarSocket ?? ((endereco: string) => new WebSocket(endereco) as SocketSimulador);

  if (!Number.isFinite(taxa) || taxa < 0) throw new RangeError(`taxa inválida: ${taxa}`);
  // O id da corrida é `r<boot>-<n>` e só aceita letras, dígitos, `_` e `-`.
  if (!PADRAO_BOOT.test(boot)) throw new RangeError(`boot inválido: ${boot}`);

  // A semente define o labirinto (fixo, como o labirinto físico), o percurso e o ruído.
  const aleatorio = criarAleatorio(semente);
  const labirinto = gerarLabirinto(tipo, aleatorio, opcoes.partida ?? 'oeste');
  const percurso: Percurso = explorar(labirinto);

  // Relógio do robô: ms desde o boot (`esp_timer_get_time() / 1000` no firmware). O robô
  // liga alguns segundos antes de o operador apertar o botão.
  const relogioBase = performance.now() - inteiroEntre(aleatorio, 2000, 8000);
  const relogio = () => Math.round(performance.now() - relogioBase);
  let fimUltimaCorrida = 0;
  let corridas = 0;

  const acks: Ack[] = [];
  const recebidas: string[] = [];
  const enviadas: string[] = [];
  let socket: SocketSimulador | null = null;
  let fechamento: Fechamento | null = null;
  let aoFechar: (() => void)[] = [];

  function enviarTexto(texto: string): void {
    if (!socket || socket.readyState !== SOCKET_ABERTO) {
      throw new ErroSimulador(descreverFechamento('a conexão não está aberta'), fechamento);
    }
    socket.send(texto);
    enviadas.push(texto);
  }

  function registrarRecebida(dados: unknown): void {
    const texto = typeof dados === 'string' ? dados : String(dados);
    recebidas.push(texto);
    try {
      const mensagem = JSON.parse(texto) as Partial<Ack> | null;
      if (
        mensagem?.tipo === 'ack' &&
        typeof mensagem.corrida === 'string' &&
        typeof mensagem.sequencia === 'number'
      ) {
        acks.push({ tipo: 'ack', corrida: mensagem.corrida, sequencia: mensagem.sequencia });
      }
    } catch {
      // Texto que não é JSON: fica só em `recebidas`.
    }
  }

  function descreverFechamento(contexto: string): string {
    if (!fechamento) return contexto;
    const motivo = fechamento.motivo ? `: ${fechamento.motivo}` : '';
    return `${contexto} (fechada com o código ${fechamento.codigo}${motivo})`;
  }

  function gerarProxima(): CorridaGerada {
    corridas++;
    const inicioMs = Math.max(relogio(), fimUltimaCorrida + 1000);
    const corrida = gerarCorrida({
      labirinto,
      percurso,
      boot,
      indice: corridas,
      inicioMs,
      resultado,
      aleatorio,
    });
    fimUltimaCorrida = inicioMs + corrida.duracaoMs;
    return corrida;
  }

  return {
    boot,
    semente,
    labirinto,
    acks,
    recebidas,
    enviadas,
    get fechamento() {
      return fechamento;
    },

    conectar() {
      if (socket) return Promise.reject(new ErroSimulador('o simulador já se conectou'));
      return new Promise<void>((resolver, rejeitar) => {
        let aberto = false;
        const atual = criarSocket(url);
        socket = atual;

        atual.addEventListener('open', () => {
          aberto = true;
          const hello: Hello = {
            tipo: 'hello',
            versao: VERSAO_PROTOCOLO,
            dispositivo,
            token,
            boot,
          };
          enviarTexto(JSON.stringify(hello));
          resolver();
        });
        const terminar = (codigo: number, motivo: string) => {
          if (fechamento) return;
          fechamento = { codigo, motivo };
          if (!aberto) {
            rejeitar(new ErroSimulador(descreverFechamento(`sem conexão com ${url}`), fechamento));
          }
          const pendentes = aoFechar;
          aoFechar = [];
          for (const avisar of pendentes) avisar();
        };
        atual.addEventListener('message', (evento) => registrarRecebida(evento.data));
        atual.addEventListener('close', (evento) => terminar(evento.code, evento.reason));
        atual.addEventListener('error', () => {
          // Com a conexão aberta, o `close` vem em seguida. Mas, quando a conexão é recusada,
          // o WebSocket do Node 22 só dispara `error` e nunca `close`: sem isto, `conectar()`
          // ficaria esperando para sempre.
          if (!aberto) terminar(1006, 'falha ao conectar');
        });
      });
    },

    gerarCorrida: gerarProxima,

    async iniciarCorrida(aoProgredir) {
      if (!socket || socket.readyState !== SOCKET_ABERTO) {
        throw new ErroSimulador(descreverFechamento('chame conectar() antes'), fechamento);
      }
      const corrida = gerarProxima();
      const total = corrida.mensagens.length;
      const intervaloMs = taxa > 0 ? 1000 / taxa : 0;
      const inicio = performance.now();

      for (let i = 0; i < total; i++) {
        if (intervaloMs > 0) {
          const espera = inicio + i * intervaloMs - performance.now();
          if (espera > 0) await dormir(espera);
        } else if (i % 200 === 0) {
          // Sem pausa, cede a vez de tempos em tempos para os `ack` serem lidos.
          await new Promise((resolver) => setImmediate(resolver));
        }
        if (fechamento) {
          throw new ErroSimulador(
            descreverFechamento(`conexão encerrada depois de ${i} de ${total} mensagens`),
            fechamento,
          );
        }
        enviarTexto(JSON.stringify(corrida.mensagens[i]));
        aoProgredir?.({ enviadas: i + 1, total });
      }

      return {
        corrida: corrida.id,
        labirinto: tipo,
        resultado: corrida.resultado,
        mensagens: total,
        passos: corrida.passos,
        revisitas: corrida.revisitas,
        duracaoMs: corrida.duracaoMs,
      };
    },

    enviar(mensagem) {
      enviarTexto(typeof mensagem === 'string' ? mensagem : JSON.stringify(mensagem));
    },

    async encerrar() {
      if (!socket || fechamento) return;
      const fechou = new Promise<void>((resolver) => {
        aoFechar.push(resolver);
        setTimeout(resolver, ESPERA_FECHAMENTO_MS).unref();
      });
      socket.close(1000, 'simulador encerrado');
      await fechou;
    },
  };
}

function dormir(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}
