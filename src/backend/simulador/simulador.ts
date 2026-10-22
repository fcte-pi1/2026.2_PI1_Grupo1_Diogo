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
 *   await sim.aguardarConfirmacao(corrida.mensagens);
 *   await sim.encerrar();
 *
 * REGRA DE OURO: como o robô real, o simulador é um EMISSOR UNIDIRECIONAL. O envio da corrida
 * nunca depende do que o backend responde. Os `ack` recebidos são guardados em `acks`, e só
 * `aguardarConfirmacao()` olha para eles, DEPOIS do envio, para quem usa o simulador (testes e
 * linha de comando) saber se o backend gravou tudo.
 *
 * Cenários de falha (Fase 2 da #322), com o mesmo comportamento do firmware (`telemetryTask` do
 * `main.cpp`): toda mensagem da corrida entra num buffer circular de 60 s (`buffer.ts`), e a
 * cada conexão o robô envia o `hello` e o buffer inteiro. Assim, depois de uma queda, o backend
 * recebe de novo o que já tinha (e descarta as duplicatas) e também o que se perdeu.
 */
import type {
  Ack,
  Hello,
  MensagemCorrida,
  MensagemRobo,
  TipoLabirinto,
} from '../protocolo/tipos.js';
import { VERSAO_PROTOCOLO } from '../protocolo/tipos.js';
import { criarAleatorio, gerarBoot, inteiroEntre, sementeAleatoria } from './aleatorio.js';
import {
  planejarEnvio,
  type Anomalia,
  type AnomaliaPlanejada,
  type PassoEnvio,
} from './anomalias.js';
import { BufferRetransmissao, type Marca, type OpcoesBuffer } from './buffer.js';
import { gerarCorrida, type CorridaGerada, type ResultadoCorrida } from './corrida.js';
import {
  criarSocketWs,
  FilaComAtraso,
  SOCKET_ABERTO,
  validarAtraso,
  type AtrasoRede,
  type SocketSimulador,
} from './enlace.js';
import { gerarLabirinto, type CantoPartida, type Labirinto } from './labirinto.js';
import { explorar, type Percurso } from './percurso.js';

export type { SocketSimulador } from './enlace.js';
export type { AtrasoRede } from './enlace.js';
export type { Anomalia, AnomaliaPlanejada, TipoAnomalia } from './anomalias.js';
export type { OpcoesBuffer } from './buffer.js';

export const URL_PADRAO = 'ws://localhost:8080/ws/telemetria';
/** Taxa do firmware: `posicao` + `energia` a cada 100 ms. */
export const TAXA_PADRAO = 20;

const SOCKET_CONECTANDO = 0;

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
  /** Buffer circular de retransmissão. Padrão: 60 000 ms e 4 000 mensagens, como no firmware. */
  buffer?: OpcoesBuffer;
  /**
   * Reenviar o buffer depois de cada `hello` (padrão: `true`, como o firmware). Com `false`, o
   * robô continua de onde está e o que se perdeu na queda fica como lacuna (CT-BE-04, variante).
   */
  reenviar?: boolean;
  /**
   * Atraso de rede artificial de cada mensagem, sorteado na faixa (CT-BE-15). Um número `n`
   * vale de 0 a `n` ms. A ordem das mensagens é mantida, como num TCP.
   */
  atrasoRede?: AtrasoRede | number;
  /** Tensões das mensagens `energia`, em degraus iguais ao longo da corrida (CT-BE-18 e 19). */
  tensoes?: readonly number[];
  /** Troca o WebSocket (testes). */
  criarSocket?: (url: string) => SocketSimulador;
}

/**
 * Uma interrupção do enlace durante `iniciarCorrida()`. Começa logo depois de o robô emitir a
 * mensagem de sequência `apos` e termina antes da primeira mensagem em que as duas condições
 * valem: já passou `duracaoMs` (se informado) e a próxima sequência é ≥ `retorno` (se
 * informado). Sem nenhuma das duas, volta já na mensagem seguinte. Se a corrida acabar antes,
 * o simulador espera o resto da duração e volta no fim, enviando o que ficou no buffer.
 */
export interface Interrupcao {
  apos: number;
  duracaoMs?: number;
  retorno?: number;
}

/** O que acontece durante uma corrida, além do envio normal. */
export interface Roteiro {
  aoProgredir?: (progresso: ProgressoCorrida) => void;
  /**
   * Quedas da conexão com o backend (o TCP cai, CT-BE-04 e CT-BE-13). Na volta, o simulador abre
   * uma conexão nova e envia `hello` (mesmo `boot`) e o buffer.
   */
  quedas?: readonly Interrupcao[];
  /**
   * Perdas de sinal com a conexão aberta (o Bluetooth cai e a ponte continua conectada,
   * CT-BE-03): o simulador para de enviar e de responder ao ping. Na volta, envia `hello`
   * (mesmo `boot`) e o buffer na mesma conexão.
   */
  silencios?: readonly Interrupcao[];
  /**
   * Reinicia o robô logo depois desta sequência (CT-BE-14): a corrida fica sem fim e o simulador
   * se conecta de novo com outro `boot`, depois de `duracaoReinicioMs`.
   */
  reinicioApos?: number;
  /**
   * Tempo entre a queda e a reconexão no `reinicioApos` (padrão: `DURACAO_REINICIO_MS`). Com 0,
   * o `hello` do boot novo chega enquanto o backend ainda processa o fim do boot antigo, o
   * cenário da #366. Só vale junto com `reinicioApos`.
   */
  duracaoReinicioMs?: number;
  /** Mensagens duplicadas, fora de ordem, malformadas ou impossíveis (`anomalias.ts`). */
  anomalias?: readonly Anomalia[];
}

export interface Fechamento {
  codigo: number;
  motivo: string;
}

export interface ResumoCorrida {
  corrida: string;
  labirinto: TipoLabirinto;
  resultado: ResultadoCorrida;
  /**
   * Mensagens da corrida emitidas pelo robô. Na corrida inteira, é a última `sequencia`, que é o
   * valor a passar para `aguardarConfirmacao()`.
   */
  mensagens: number;
  /** Mensagens da corrida que a corrida tem ao todo (igual a `mensagens`, salvo num reinício). */
  total: number;
  passos: number;
  revisitas: number;
  /** Duração no relógio do robô. */
  duracaoMs: number;
  /**
   * Maior sequência desta corrida que saiu pelo socket junto com todas as anteriores: é o maior
   * `ack` que o backend pode mandar. Com o reenvio desligado, uma queda deixa uma lacuna e este
   * valor fica abaixo de `mensagens`.
   */
  contiguaEnviada: number;
  /** Mensagens do buffer enviadas de novo nas voltas do enlace, durante esta corrida. */
  reenviadas: number;
  /** Quedas e silêncios que aconteceram. */
  interrupcoes: number;
  /** O robô reiniciou no meio da corrida (`reinicioApos`). */
  reiniciou: boolean;
  /** Anomalias aplicadas, com `injetadas` = 0 quando o enlace estava fora no momento. */
  anomalias: (AnomaliaPlanejada & { injetadas: number })[];
}

export interface ProgressoCorrida {
  enviadas: number;
  total: number;
}

export interface Simulador {
  /** `boot` atual: muda em `reiniciar()`. */
  readonly boot: string;
  readonly semente: number;
  readonly labirinto: Labirinto;
  /** `ack` recebidos, na ordem de chegada. */
  readonly acks: readonly Ack[];
  /** Tudo o que o backend enviou, como texto (inclui os `ack`). */
  readonly recebidas: readonly string[];
  /** Tudo o que saiu pelo socket, como texto, na ordem (inclui os `hello` e os reenvios). */
  readonly enviadas: readonly string[];
  /** Como terminou a conexão atual, ou `null` se ela está aberta (ou nunca abriu). */
  readonly fechamento: Fechamento | null;
  /** Como terminou cada conexão anterior, na ordem. */
  readonly fechamentos: readonly Fechamento[];
  /** Há uma conexão aberta com o backend. */
  readonly conectado: boolean;
  /** O sinal está cortado (`silenciar()`): o simulador não envia nem responde ao ping. */
  readonly silenciado: boolean;
  /** O que está no buffer de retransmissão agora, como texto, da mais antiga para a mais nova. */
  readonly buffer: readonly string[];

  /** Abre a conexão e envia o `hello` e, se `reenviar`, o buffer. */
  conectar(): Promise<void>;
  /** Derruba a conexão (se aberta) e conecta de novo, com o mesmo `boot`. */
  reconectar(): Promise<void>;
  /**
   * Derruba o TCP sem o handshake de fechamento (o backend vê `1006`), como uma queda de rede.
   * O robô continua: o que for emitido vai só para o buffer.
   */
  derrubar(): Promise<void>;
  /** Para de enviar e de responder ao ping, com a conexão aberta (perda de sinal, CT-BE-03). */
  silenciar(): void;
  /** Volta do silêncio: envia `hello` (mesmo `boot`) e, se `reenviar`, o buffer. */
  retomar(): void;
  /**
   * Reinicia o robô (CT-BE-14): derruba a conexão, sorteia outro `boot` (ou usa o informado),
   * zera o relógio, o buffer e a contagem de corridas e, depois de `duracaoMs` (padrão:
   * `DURACAO_REINICIO_MS`, o tempo de o ESP32 ligar e o BLE reconectar), conecta de novo.
   */
  reiniciar(opcoes?: { boot?: string; duracaoMs?: number }): Promise<void>;

  /** Gera as mensagens da próxima corrida, sem enviar. */
  gerarCorrida(): CorridaGerada;
  /**
   * Gera e envia uma corrida, de `inicio_corrida` a `fim_corrida`, no ritmo de `taxa`, com as
   * falhas do roteiro. Aceita também só a função de progresso, como na Fase 1.
   */
  iniciarCorrida(
    roteiro?: Roteiro | ((progresso: ProgressoCorrida) => void),
  ): Promise<ResumoCorrida>;
  /**
   * Espera o `ack` da `sequencia` (ou de uma maior) da corrida, que por padrão é a última
   * gerada. Rejeita com `ErroSimulador` se a conexão fechar antes, por exemplo com o `hello`
   * recusado (4001, 4002, 4003), ou se o prazo acabar.
   */
  aguardarConfirmacao(sequencia: number, prazoMs?: number, corrida?: string): Promise<void>;
  /**
   * Emite uma mensagem da corrida como o robô: ela entra no buffer e sai pelo socket se o
   * enlace estiver no ar. Devolve `false` quando ficou só no buffer (queda ou silêncio).
   */
  emitir(mensagem: MensagemCorrida): boolean;
  /**
   * Envia direto pelo socket, sem passar pelo buffer: um objeto do protocolo ou qualquer texto,
   * até inválido (mensagens malformadas). Falha se a conexão não estiver aberta.
   */
  enviar(mensagem: MensagemRobo | string): void;
  /** Maior sequência da corrida que saiu pelo socket junto com todas as anteriores. */
  contiguaEnviada(corrida?: string): number;
  /** Espera sair o que está no atraso de rede e fecha a conexão (código 1000). */
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

const ESPERA_FECHAMENTO_MS = 2000;
const ESPERA_ESCOAMENTO_MS = 1000;
/** O backend confirma depois de gravar o lote (até 10 ms mais a gravação); 5 s dá folga. */
export const PRAZO_CONFIRMACAO_MS = 5000;
const PADRAO_BOOT = /^[A-Za-z0-9_-]{1,48}$/;
/**
 * Tempo entre o robô cair e se conectar de novo depois de um reinício: o ESP32 liga, o BLE volta
 * a anunciar e a ponte reconecta. Na prática passa de 1 s; com 0, o `hello` novo pode chegar
 * enquanto o backend ainda processa as últimas mensagens do boot anterior.
 */
export const DURACAO_REINICIO_MS = 1000;
/** Código da queda quando o socket não sabe derrubar o TCP (`terminate`). */
const CODIGO_QUEDA_SIMULADA = 4000;

export function criarSimulador(opcoes: OpcoesSimulador = {}): Simulador {
  const url = opcoes.url ?? URL_PADRAO;
  const dispositivo = opcoes.dispositivo ?? 'sim-01';
  const token = opcoes.token ?? 'T-VALIDO';
  const tipo = opcoes.labirinto ?? '4x4';
  const taxa = opcoes.taxa ?? TAXA_PADRAO;
  const resultado = opcoes.resultado ?? 'sucesso';
  const semente = opcoes.semente ?? sementeAleatoria();
  const reenviar = opcoes.reenviar ?? true;
  const tensoes = opcoes.tensoes;
  const atraso =
    typeof opcoes.atrasoRede === 'number'
      ? { minimoMs: 0, maximoMs: opcoes.atrasoRede }
      : (opcoes.atrasoRede ?? null);
  const criarSocket = opcoes.criarSocket ?? criarSocketWs;
  let boot = opcoes.boot ?? gerarBoot();

  if (!Number.isFinite(taxa) || taxa < 0) throw new RangeError(`taxa inválida: ${taxa}`);
  // O id da corrida é `r<boot>-<n>` e só aceita letras, dígitos, `_` e `-`.
  validarBoot(boot);
  if (atraso) validarAtraso(atraso);
  if (tensoes) {
    if (tensoes.length === 0) throw new RangeError('a lista de tensões está vazia');
    for (const tensao of tensoes) {
      // Fora de 5 a 9 V o backend rejeita a mensagem (RF-76): para isso, use a anomalia.
      if (!(Number.isFinite(tensao) && tensao >= 5 && tensao <= 9)) {
        throw new RangeError(
          `tensão ${tensao} fora de 5 a 9 V: use a anomalia tensao-fora-da-faixa para isso`,
        );
      }
    }
  }

  // A semente define o labirinto (fixo, como o labirinto físico), o percurso e o ruído.
  const aleatorio = criarAleatorio(semente);
  const labirinto = gerarLabirinto(tipo, aleatorio, opcoes.partida ?? 'oeste');
  const percurso: Percurso = explorar(labirinto);
  // O atraso de rede tem o seu próprio gerador: ligar o atraso não muda o labirinto nem a corrida.
  const aleatorioRede = criarAleatorio((semente ^ 0x5bd1e995) >>> 0);

  // Relógio do robô: ms desde o boot (`esp_timer_get_time() / 1000` no firmware). O robô
  // liga alguns segundos antes de o operador apertar o botão.
  let relogioBase = 0;
  const ligar = () => {
    relogioBase = performance.now() - inteiroEntre(aleatorio, 2000, 8000);
  };
  ligar();
  const relogio = () => Math.round(performance.now() - relogioBase);
  let fimUltimaCorrida = 0;
  let corridas = 0;
  let ultimaCorrida: string | null = null;

  const buffer = new BufferRetransmissao(opcoes.buffer);
  const acks: Ack[] = [];
  const recebidas: string[] = [];
  const enviadas: string[] = [];
  /** Sequências de cada corrida que já saíram pelo socket (para `contiguaEnviada`). */
  const escritas = new Map<string, Set<number>>();
  const fechamentos: Fechamento[] = [];

  let socket: SocketSimulador | null = null;
  let fechamento: Fechamento | null = null;
  let silenciado = false;
  let aoFechar: (() => void)[] = [];
  /** Quem está em `aguardarConfirmacao()`: reavaliado a cada `ack` que chega. */
  const aoReceberAck = new Set<() => void>();
  /** Mensagens do buffer reenviadas desde a criação (o resumo da corrida usa a diferença). */
  let totalReenviadas = 0;

  const aberto = () => socket !== null && socket.readyState === SOCKET_ABERTO;
  const noAr = () => aberto() && !silenciado;

  /** Chamada pela fila quando chega a hora de cada mensagem sair. Nunca lança. */
  function escrever(texto: string, marca: Marca | undefined): void {
    // Uma queda no meio do atraso: o que estava "na rede" se perde (e continua no buffer).
    if (!socket || socket.readyState !== SOCKET_ABERTO) return;
    socket.send(texto);
    enviadas.push(texto);
    if (marca) {
      const conjunto = escritas.get(marca.corrida) ?? new Set<number>();
      conjunto.add(marca.sequencia);
      escritas.set(marca.corrida, conjunto);
    }
  }
  const fila = new FilaComAtraso(atraso, aleatorioRede, escrever);

  /** Envio direto (sem buffer). Lança se a conexão não estiver aberta. */
  function enviarTexto(texto: string): void {
    if (!aberto()) {
      throw new ErroSimulador(descreverFechamento('a conexão não está aberta'), fechamento);
    }
    fila.colocar(texto);
  }

  /** O que o robô faz a cada conexão (ou volta do sinal): `hello` e, depois, o buffer. */
  function apresentar(): void {
    const hello: Hello = { tipo: 'hello', versao: VERSAO_PROTOCOLO, dispositivo, token, boot };
    fila.colocar(JSON.stringify(hello));
    if (!reenviar) return;
    for (const entrada of buffer.conteudo()) {
      fila.colocar(entrada.texto, entrada.marca);
      totalReenviadas++;
    }
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
        for (const verificar of [...aoReceberAck]) verificar();
      }
    } catch {
      // Texto que não é JSON: fica só em `recebidas`.
    }
  }

  /** Resolve quando o evento `close` chegar (ou depois de ESPERA_FECHAMENTO_MS, por segurança). */
  function esperarFechamento(): Promise<void> {
    if (fechamento || !socket) return Promise.resolve();
    return new Promise<void>((resolver) => {
      aoFechar.push(resolver);
      setTimeout(resolver, ESPERA_FECHAMENTO_MS).unref();
    });
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
      ...(tensoes && { tensoes }),
    });
    fimUltimaCorrida = inicioMs + corrida.duracaoMs;
    ultimaCorrida = corrida.id;
    return corrida;
  }

  /** Maior sequência confirmada da corrida (o `ack` é cumulativo). */
  function confirmada(corrida: string): number {
    let maior = 0;
    for (const ack of acks)
      if (ack.corrida === corrida && ack.sequencia > maior) maior = ack.sequencia;
    return maior;
  }

  function contiguaEnviada(corrida = ultimaCorrida ?? ''): number {
    const conjunto = escritas.get(corrida);
    let n = 0;
    while (conjunto?.has(n + 1)) n++;
    return n;
  }

  function emitir(mensagem: MensagemCorrida): boolean {
    const texto = JSON.stringify(mensagem);
    const marca = { corrida: mensagem.corrida, sequencia: mensagem.sequencia };
    buffer.adicionar(mensagem.tempo_ms, texto, marca);
    if (!noAr()) return false;
    fila.colocar(texto, marca);
    return true;
  }

  function conectar(): Promise<void> {
    if (
      socket &&
      (socket.readyState === SOCKET_ABERTO || socket.readyState === SOCKET_CONECTANDO)
    ) {
      return Promise.reject(new ErroSimulador('o simulador já está conectado'));
    }
    return new Promise<void>((resolver, rejeitar) => {
      let abriu = false;
      fechamento = null;
      silenciado = false;
      const atual = criarSocket(url);
      socket = atual;

      atual.addEventListener('open', () => {
        if (socket !== atual) return;
        abriu = true;
        apresentar();
        resolver();
      });
      const terminar = (codigo: number, motivo: string) => {
        // Eventos de uma conexão que já foi substituída não valem para a atual.
        if (socket !== atual || fechamento) return;
        fechamento = { codigo, motivo };
        fechamentos.push(fechamento);
        fila.descartar();
        if (!abriu) {
          rejeitar(new ErroSimulador(descreverFechamento(`sem conexão com ${url}`), fechamento));
        }
        const pendentes = aoFechar;
        aoFechar = [];
        for (const avisar of pendentes) avisar();
      };
      atual.addEventListener('message', (evento) => {
        if (socket === atual) registrarRecebida(evento.data);
      });
      atual.addEventListener('close', (evento) => terminar(evento.code, evento.reason));
      atual.addEventListener('error', () => {
        // Com a conexão aberta, o `close` vem em seguida. Mas, quando a conexão é recusada,
        // o WebSocket do Node 22 só dispara `error` e nunca `close`: sem isto, `conectar()`
        // ficaria esperando para sempre.
        if (!abriu) terminar(1006, 'falha ao conectar');
      });
    });
  }

  async function derrubar(): Promise<void> {
    if (!socket || fechamento) return;
    // "Queda depois da sequência N" quer dizer que o backend recebeu até a N: antes de cortar,
    // espera sair o que já foi enviado (inclusive o que está no atraso de rede). Sem isso, um
    // envio rápido (`taxa: 0`) perderia mensagens ainda no socket e a lacuna não seria a pedida.
    await fila.esvaziar();
    await esperarEscoamento();
    if (!socket || fechamento) return;
    const fechou = esperarFechamento();
    if (socket.terminate) socket.terminate();
    else socket.close(CODIGO_QUEDA_SIMULADA, 'queda simulada');
    await fechou;
  }

  /** Espera o socket entregar ao sistema operacional o que já foi enviado (até 1 s). */
  async function esperarEscoamento(): Promise<void> {
    const limite = performance.now() + ESPERA_ESCOAMENTO_MS;
    while (socket && aberto() && (socket.bufferedAmount ?? 0) > 0 && performance.now() < limite) {
      await dormir(2);
    }
  }

  function silenciar(): void {
    if (!aberto()) {
      throw new ErroSimulador(descreverFechamento('a conexão não está aberta'), fechamento);
    }
    if (!socket!.responderPing) {
      throw new ErroSimulador('este socket não permite silenciar o pong (use o socket padrão)');
    }
    silenciado = true;
    socket!.responderPing(false);
  }

  function retomar(): void {
    if (!silenciado) return;
    silenciado = false;
    socket?.responderPing?.(true);
    if (aberto()) apresentar();
  }

  async function reiniciar(novo: { boot?: string; duracaoMs?: number } = {}): Promise<void> {
    const proximo = novo.boot ?? gerarBoot();
    validarBoot(proximo);
    const duracao = novo.duracaoMs ?? DURACAO_REINICIO_MS;
    if (!(Number.isFinite(duracao) && duracao >= 0)) {
      throw new RangeError(`duração do reinício inválida: ${duracao}`);
    }
    await derrubar();
    boot = proximo;
    // O reinício apaga a RAM: buffer, relógio e a contagem de corridas começam de novo.
    buffer.limpar();
    ligar();
    fimUltimaCorrida = 0;
    corridas = 0;
    ultimaCorrida = null;
    if (duracao > 0) await dormir(duracao);
    await conectar();
  }

  async function iniciarCorrida(
    entrada?: Roteiro | ((progresso: ProgressoCorrida) => void),
  ): Promise<ResumoCorrida> {
    const roteiro: Roteiro =
      typeof entrada === 'function' ? { aoProgredir: entrada } : (entrada ?? {});
    if (!aberto()) {
      throw new ErroSimulador(descreverFechamento('chame conectar() antes'), fechamento);
    }
    const estadoAntes = { corridas, fimUltimaCorrida, ultimaCorrida };
    const corrida = gerarProxima();
    const total = corrida.mensagens.length;
    let plano: ReturnType<typeof planejarEnvio>;
    let pendentes: ReturnType<typeof ordenarInterrupcoes>;
    try {
      plano = planejarEnvio(corrida.mensagens, labirinto, roteiro.anomalias ?? [], aleatorio);
      pendentes = ordenarInterrupcoes(roteiro, total);
      validarSequencia('reinicioApos', roteiro.reinicioApos, total);
      validarDuracaoReinicio(roteiro);
    } catch (erro) {
      // Roteiro inválido: a corrida não aconteceu, e a próxima mantém o número.
      ({ corridas, fimUltimaCorrida, ultimaCorrida } = estadoAntes);
      throw erro;
    }

    const passos = plano.passos;
    const intervaloMs = taxa > 0 ? 1000 / taxa : 0;
    const inicio = performance.now();
    const reenviadasAntes = totalReenviadas;
    const injetadas = new Map<string, number>();
    let emitidas = 0;
    let interrupcoes = 0;
    let reiniciou = false;

    /** Interrupção em curso e as que já deviam ter começado, na ordem. */
    let ativa: (Interrupcao & { tipo: 'queda' | 'silencio'; voltaEm: number }) | null = null;
    const devidas: (Interrupcao & { tipo: 'queda' | 'silencio' })[] = [];

    // A conexão pode estar "fechando" (o backend já pediu o fechamento) sem que o evento
    // `close`, que traz o código, tenha chegado. Nesse intervalo, espera o `close` para o erro
    // dizer o motivo (ex.: 4001) em vez de um genérico "a conexão não está aberta". Durante uma
    // queda simulada, a conexão fechada é esperada.
    const falharSeFechada = async (contexto: string) => {
      if (ativa?.tipo === 'queda') return;
      if (!fechamento && aberto()) return;
      await esperarFechamento();
      throw new ErroSimulador(descreverFechamento(contexto), fechamento);
    };

    const comecar = async (interrupcao: Interrupcao & { tipo: 'queda' | 'silencio' }) => {
      interrupcoes++;
      ativa = { ...interrupcao, voltaEm: performance.now() + (interrupcao.duracaoMs ?? 0) };
      if (interrupcao.tipo === 'queda') await derrubar();
      else silenciar();
    };
    const voltar = async () => {
      const atual = ativa!;
      ativa = null;
      if (atual.tipo === 'queda') {
        try {
          await conectar();
        } catch (erro) {
          throw new ErroSimulador(
            `não foi possível reconectar depois da queda: ${(erro as Error).message}`,
            fechamento,
          );
        }
      } else {
        retomar();
      }
      const proxima = devidas.shift();
      if (proxima) await comecar(proxima);
    };
    const podeVoltar = (proximaSequencia: number) =>
      ativa !== null &&
      performance.now() >= ativa.voltaEm &&
      (ativa.retorno === undefined || proximaSequencia >= ativa.retorno);

    for (let i = 0; i < passos.length; i++) {
      if (intervaloMs > 0) {
        const espera = inicio + i * intervaloMs - performance.now();
        if (espera > 0) await dormir(espera);
      } else if (i % 200 === 0) {
        // Sem pausa, cede a vez de tempos em tempos para os `ack` serem lidos.
        await new Promise((resolver) => setImmediate(resolver));
      }

      const passo: PassoEnvio = passos[i]!;
      const sequencia = passo.acao === 'emitir' ? passo.mensagem.sequencia : passo.sequencia;
      while (podeVoltar(sequencia)) await voltar();
      await falharSeFechada(`conexão encerrada depois de ${emitidas} de ${total} mensagens`);

      if (passo.acao === 'injetar') {
        // A anomalia é uma mensagem avulsa, sem buffer: com o enlace fora, ela se perde.
        if (noAr()) {
          enviarTexto(passo.texto);
          const chave = `${passo.anomalia}:${passo.sequencia}`;
          injetadas.set(chave, (injetadas.get(chave) ?? 0) + 1);
        }
        continue;
      }

      emitir(passo.mensagem);
      emitidas++;
      roteiro.aoProgredir?.({ enviadas: emitidas, total });

      if (roteiro.reinicioApos === sequencia) {
        reiniciou = true;
        await reiniciar(
          roteiro.duracaoReinicioMs === undefined ? {} : { duracaoMs: roteiro.duracaoReinicioMs },
        );
        break;
      }
      for (const interrupcao of pendentes.filter((p) => p.apos === sequencia)) {
        devidas.push(interrupcao);
      }
      if (!ativa && devidas.length > 0) await comecar(devidas.shift()!);
    }

    // A corrida acabou com o enlace fora: espera o fim da interrupção e envia o buffer.
    while (ativa !== null) {
      const espera = (ativa as { voltaEm: number }).voltaEm - performance.now();
      if (espera > 0) await dormir(espera);
      await voltar();
    }

    // Com `taxa: 0`, tudo pode ter sido enviado antes de uma recusa do `hello` chegar. Este
    // teste só pega o caso em que ela já chegou; para ter certeza, use `aguardarConfirmacao()`.
    await falharSeFechada('conexão encerrada durante o envio da corrida');
    // Com atraso de rede, parte da corrida ainda está na fila: `contiguaEnviada` só vale depois
    // que ela sair (no máximo `maximoMs` depois).
    await fila.esvaziar();

    return {
      corrida: corrida.id,
      labirinto: tipo,
      resultado: corrida.resultado,
      mensagens: emitidas,
      total,
      passos: corrida.passos,
      revisitas: corrida.revisitas,
      duracaoMs: corrida.duracaoMs,
      contiguaEnviada: contiguaEnviada(corrida.id),
      reenviadas: totalReenviadas - reenviadasAntes,
      interrupcoes,
      reiniciou,
      anomalias: plano.anomalias.map((a) => ({
        ...a,
        injetadas:
          a.tipo === 'fora-de-ordem' ? 0 : (injetadas.get(`${a.tipo}:${a.sequencia}`) ?? 0),
      })),
    };
  }

  function aguardarConfirmacao(
    sequencia: number,
    prazoMs = PRAZO_CONFIRMACAO_MS,
    corrida = ultimaCorrida ?? '',
  ): Promise<void> {
    if (!corrida) {
      return Promise.reject(new ErroSimulador('nenhuma corrida foi gerada ainda'));
    }
    const erroFechamento = () =>
      new ErroSimulador(
        descreverFechamento(`conexão encerrada antes do ack da sequência ${sequencia}`),
        fechamento,
      );
    // Já confirmada (ou já sem conexão): responde na hora.
    if (confirmada(corrida) >= sequencia) return Promise.resolve();
    if (fechamento) return Promise.reject(erroFechamento());

    return new Promise<void>((resolver, rejeitar) => {
      const concluir = (erro?: ErroSimulador) => {
        clearTimeout(temporizador);
        aoReceberAck.delete(verificar);
        aoFechar = aoFechar.filter((avisar) => avisar !== aoFecharAntes);
        if (erro) rejeitar(erro);
        else resolver();
      };
      const verificar = () => {
        if (confirmada(corrida) >= sequencia) concluir();
      };
      const aoFecharAntes = () => concluir(erroFechamento());

      aoReceberAck.add(verificar);
      aoFechar.push(aoFecharAntes);
      const temporizador = setTimeout(() => {
        const ultimo = confirmada(corrida) || 'nenhum';
        concluir(
          new ErroSimulador(
            `prazo de ${prazoMs} ms esgotado sem o ack da sequência ${sequencia} ` +
              `da corrida ${corrida} (último ack: ${ultimo})`,
          ),
        );
      }, prazoMs);
    });
  }

  return {
    get boot() {
      return boot;
    },
    semente,
    labirinto,
    acks,
    recebidas,
    enviadas,
    get fechamento() {
      return fechamento;
    },
    fechamentos,
    get conectado() {
      return aberto();
    },
    get silenciado() {
      return silenciado;
    },
    get buffer() {
      return buffer.mensagens();
    },

    conectar,
    async reconectar() {
      await derrubar();
      await conectar();
    },
    derrubar,
    silenciar,
    retomar,
    reiniciar,
    gerarCorrida: gerarProxima,
    iniciarCorrida,
    aguardarConfirmacao,
    emitir,
    contiguaEnviada,

    enviar(mensagem) {
      enviarTexto(typeof mensagem === 'string' ? mensagem : JSON.stringify(mensagem));
    },

    async encerrar() {
      if (!socket || fechamento) return;
      await fila.esvaziar();
      if (!socket || fechamento) return;
      const fechou = esperarFechamento();
      socket.close(1000, 'simulador encerrado');
      await fechou;
    },
  };
}

function validarBoot(boot: string): void {
  if (!PADRAO_BOOT.test(boot)) throw new RangeError(`boot inválido: ${boot}`);
}

function validarSequencia(nome: string, valor: number | undefined, total: number): void {
  if (valor === undefined) return;
  if (!(Number.isInteger(valor) && valor >= 1 && valor <= total)) {
    throw new RangeError(`${nome} deve ser uma sequência de 1 a ${total} (a corrida tem ${total})`);
  }
}

/**
 * Valida a duração do reinício antes de a corrida começar: um erro aqui não deixa a corrida
 * pela metade, como aconteceria se ele só aparecesse no `reiniciar()`.
 */
function validarDuracaoReinicio({ reinicioApos, duracaoReinicioMs }: Roteiro): void {
  if (duracaoReinicioMs === undefined) return;
  if (reinicioApos === undefined) {
    throw new RangeError('duracaoReinicioMs só vale junto com reinicioApos');
  }
  if (!(Number.isFinite(duracaoReinicioMs) && duracaoReinicioMs >= 0)) {
    throw new RangeError(`duracaoReinicioMs inválida: ${duracaoReinicioMs}`);
  }
}

/** Quedas e silêncios do roteiro, validados e na ordem em que começam. */
function ordenarInterrupcoes(
  roteiro: Roteiro,
  total: number,
): (Interrupcao & { tipo: 'queda' | 'silencio' })[] {
  const todas = [
    ...(roteiro.quedas ?? []).map((q) => ({ ...q, tipo: 'queda' as const })),
    ...(roteiro.silencios ?? []).map((s) => ({ ...s, tipo: 'silencio' as const })),
  ];
  for (const interrupcao of todas) {
    validarSequencia(`apos (${interrupcao.tipo})`, interrupcao.apos, total);
    const { duracaoMs, retorno } = interrupcao;
    if (duracaoMs !== undefined && !(Number.isFinite(duracaoMs) && duracaoMs >= 0)) {
      throw new RangeError(`duracaoMs (${interrupcao.tipo}) inválida: ${duracaoMs}`);
    }
    if (retorno !== undefined && !(Number.isInteger(retorno) && retorno > interrupcao.apos)) {
      throw new RangeError(`retorno (${interrupcao.tipo}) deve ser maior que apos`);
    }
  }
  return todas.sort((a, b) => a.apos - b.apos);
}

function dormir(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}
