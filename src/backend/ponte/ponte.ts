/**
 * Ponte Bluetooth → backend.
 *
 * O robô envia a telemetria por Bluetooth Clássico (SPP), uma mensagem JSON por linha.
 * A ponte roda no notebook do operador, FORA do Docker (o container não enxerga o
 * Bluetooth do host), e repassa cada linha, sem alterar, para `/ws/telemetria`.
 * Para o backend, a ponte é indistinguível de um robô conectado por WebSocket.
 *
 * Este arquivo não conhece porta serial nem rede: recebe as linhas por `linha()` e usa a
 * fábrica de socket injetada. Assim, toda a lógica é testada sem hardware.
 */
import { CodigoFechamento } from '../protocolo/tipos.js';

/** Subconjunto da API WebSocket usado pela ponte (compatível com o WebSocket global do Node). */
export interface SocketPonte {
  readonly readyState: number;
  send(dados: string): void;
  close(codigo?: number, motivo?: string): void;
  addEventListener(tipo: 'open', ouvinte: () => void): void;
  addEventListener(tipo: 'message', ouvinte: (evento: { data: unknown }) => void): void;
  addEventListener(tipo: 'close', ouvinte: (evento: { code: number }) => void): void;
  addEventListener(tipo: 'error', ouvinte: () => void): void;
}

export interface Registro {
  info(mensagem: string): void;
  aviso(mensagem: string): void;
  erro(mensagem: string): void;
}

export interface OpcoesPonte {
  criarSocket: () => SocketPonte;
  registro: Registro;
  /** Máximo de linhas guardadas enquanto o backend está fora do ar. */
  capacidadeBuffer?: number;
  /** Atrasos entre as tentativas de reconexão com o backend, em ms. */
  atrasosReconexaoMs?: readonly number[];
}

export interface ContadoresPonte {
  linhasRecebidas: number;
  linhasEnviadas: number;
  /** Linhas recebidas antes do `hello` da sessão: o backend as recusaria. */
  linhasSemHello: number;
  /** Linhas perdidas porque o buffer encheu com o backend fora do ar. */
  linhasPerdidas: number;
  acksRecebidos: number;
}

const SOCKET_ABERTO = 1;
/** 20 mensagens/s por 60 s, com folga. */
const CAPACIDADE_PADRAO = 2000;
const ATRASOS_PADRAO_MS = [250, 500, 1000, 2000] as const;

export class Ponte {
  readonly contadores: ContadoresPonte = {
    linhasRecebidas: 0,
    linhasEnviadas: 0,
    linhasSemHello: 0,
    linhasPerdidas: 0,
    acksRecebidos: 0,
  };

  private socket: SocketPonte | null = null;
  private sessaoAtiva = false;
  /** O `hello` da sessão Bluetooth atual, reenviado se a conexão com o backend cair. */
  private hello: string | null = null;
  private helloEnviado = false;
  /** O backend recusou o `hello` (token ou versão): não adianta insistir nesta sessão. */
  private recusado = false;
  private buffer: string[] = [];
  private tentativa = 0;
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  private readonly capacidade: number;
  private readonly atrasos: readonly number[];

  constructor(private readonly opcoes: OpcoesPonte) {
    this.capacidade = opcoes.capacidadeBuffer ?? CAPACIDADE_PADRAO;
    this.atrasos = opcoes.atrasosReconexaoMs ?? ATRASOS_PADRAO_MS;
  }

  /** A porta serial Bluetooth abriu: o robô vai enviar `hello` e reenviar o que reteve. */
  iniciarSessao(): void {
    this.encerrarSessao();
    this.sessaoAtiva = true;
    this.opcoes.registro.info('Bluetooth conectado, aguardando o hello do robô');
  }

  /**
   * A porta serial fechou: o robô saiu do alcance ou desligou. Fechar a conexão com o
   * backend faz com que ele registre a perda de sinal na hora (RF-73).
   */
  encerrarSessao(): void {
    if (this.sessaoAtiva) this.opcoes.registro.aviso('Bluetooth desconectado');
    this.sessaoAtiva = false;
    this.hello = null;
    this.helloEnviado = false;
    this.recusado = false;
    this.buffer = [];
    this.tentativa = 0;
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, 'bluetooth desconectado');
  }

  /** Recebe uma linha completa vinda do robô. */
  linha(linha: string): void {
    if (!this.sessaoAtiva) return;
    this.contadores.linhasRecebidas++;

    if (ehHello(linha)) {
      // Novo hello na mesma sessão: o robô reiniciou sem derrubar o Bluetooth.
      if (this.hello !== null) this.reiniciarConexaoBackend();
      this.hello = linha;
      this.conectar();
      return;
    }
    if (this.hello === null) {
      if (this.contadores.linhasSemHello++ === 0) {
        this.opcoes.registro.aviso('mensagem recebida antes do hello: descartada');
      }
      return;
    }
    if (this.recusado) return;
    this.enviar(linha);
  }

  private enviar(linha: string): void {
    if (this.helloEnviado && this.socket?.readyState === SOCKET_ABERTO) {
      this.socket.send(linha);
      this.contadores.linhasEnviadas++;
      return;
    }
    if (this.buffer.length >= this.capacidade) {
      this.buffer.shift();
      this.contadores.linhasPerdidas++;
    }
    this.buffer.push(linha);
  }

  private conectar(): void {
    if (!this.sessaoAtiva || this.recusado || this.hello === null) return;
    const socket = this.opcoes.criarSocket();
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.socket !== socket || this.hello === null) return;
      this.tentativa = 0;
      socket.send(this.hello);
      this.helloEnviado = true;
      const pendentes = this.buffer;
      this.buffer = [];
      for (const linha of pendentes) socket.send(linha);
      this.contadores.linhasEnviadas += pendentes.length;
      this.opcoes.registro.info(
        `conectado ao backend` +
          (pendentes.length > 0 ? ` (${pendentes.length} mensagens retidas enviadas)` : ''),
      );
    });

    // O robô é emissor unidirecional: o ack é apenas contado, nunca repassado ao robô.
    socket.addEventListener('message', () => {
      this.contadores.acksRecebidos++;
    });

    socket.addEventListener('error', () => {
      // O evento `close` vem em seguida e trata a reconexão.
    });

    socket.addEventListener('close', ({ code }) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.helloEnviado = false;

      if (
        code === CodigoFechamento.TOKEN_INVALIDO ||
        code === CodigoFechamento.VERSAO_NAO_SUPORTADA
      ) {
        this.recusado = true;
        this.buffer = [];
        this.opcoes.registro.erro(
          code === CodigoFechamento.TOKEN_INVALIDO
            ? 'o backend recusou o hello: dispositivo ou token inválido (4001)'
            : 'o backend recusou o hello: versão do protocolo não suportada (4002)',
        );
        return;
      }
      if (!this.sessaoAtiva) return;
      const atraso = this.atrasos[Math.min(this.tentativa++, this.atrasos.length - 1)]!;
      this.opcoes.registro.aviso(`backend indisponível, nova tentativa em ${atraso} ms`);
      this.temporizador = setTimeout(() => this.conectar(), atraso);
    });
  }

  private reiniciarConexaoBackend(): void {
    this.recusado = false;
    this.helloEnviado = false;
    this.buffer = [];
    this.tentativa = 0;
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, 'novo hello');
  }
}

function ehHello(linha: string): boolean {
  if (!linha.includes('"hello"')) return false;
  try {
    return (JSON.parse(linha) as { tipo?: unknown } | null)?.tipo === 'hello';
  } catch {
    return false;
  }
}
