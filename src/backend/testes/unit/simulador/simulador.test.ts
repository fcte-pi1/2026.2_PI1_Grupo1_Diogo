/**
 * API programática do simulador contra um servidor WebSocket local (Fastify +
 * @fastify/websocket, as mesmas bibliotecas do backend). O servidor faz o papel mínimo do
 * backend: recebe as mensagens e responde `ack` com a sequência de cada uma.
 *
 * Os atrasos imitam o backend real: conferir o token (argon2) leva alguns milissegundos, e o
 * `ack` só sai depois de gravar o lote. Sem eles, a recusa do `hello` chegaria antes do primeiro
 * envio e os `ack` antes do fechamento, e os testes não pegariam os casos da revisão do PR #351.
 */
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { CodigoFechamento } from '../../../protocolo/tipos.js';
import { criarValidadorProtocolo } from '../../../protocolo/validador.js';
import {
  criarSimulador,
  ErroSimulador,
  type SocketSimulador,
} from '../../../simulador/simulador.js';

const validador = criarValidadorProtocolo();

/**
 * Socket falso que controla a ordem dos eventos, para reproduzir sempre a corrida entre o
 * estado "fechando" e o evento `close` (que, no socket real, depende da velocidade da máquina).
 */
class SocketFalso implements SocketSimulador {
  readyState = 0;
  private ouvintes: Record<string, ((evento: never) => void)[]> = {};
  enviadas = 0;
  /** Depois de quantos envios o "backend" recusa o hello. */
  constructor(private readonly recusarDepoisDe: number) {}

  send(): void {
    if (++this.enviadas === this.recusarDepoisDe) {
      // O pedido de fechamento chegou: o socket fica "fechando" (2), e o evento `close`, com o
      // código, só dispara um pouco depois.
      this.readyState = 2;
      setTimeout(() => {
        this.readyState = 3;
        this.emitir('close', { code: 4001, reason: 'token inválido' });
      }, 20);
    }
  }
  close(): void {
    this.readyState = 3;
    this.emitir('close', { code: 1000, reason: '' });
  }
  addEventListener(tipo: string, ouvinte: (evento: never) => void): void {
    (this.ouvintes[tipo] ??= []).push(ouvinte);
    if (tipo === 'open') {
      setTimeout(() => {
        this.readyState = 1;
        this.emitir('open');
      }, 0);
    }
  }
  private emitir(tipo: string, evento: unknown = {}): void {
    for (const ouvinte of this.ouvintes[tipo] ?? []) ouvinte(evento as never);
  }
}

interface ServidorTeste {
  url: string;
  recebidas: string[];
  app: FastifyInstance;
}

interface OpcoesServidor {
  /** Fecha a conexão com este código ao receber o `hello`. */
  recusar?: number;
  /** Tempo até a recusa, como a conferência do token no backend. */
  atrasoRecusaMs?: number;
  /** Tempo até o `ack`, como a gravação em lote no backend. */
  atrasoAckMs?: number;
  /** Nunca envia `ack`. */
  semAck?: boolean;
}

async function subirServidor(opcoes: OpcoesServidor = {}): Promise<ServidorTeste> {
  const recebidas: string[] = [];
  const app = Fastify();
  await app.register(fastifyWebsocket);
  app.get('/ws/telemetria', { websocket: true }, (socket) => {
    let recusado = false;
    socket.on('message', (dados) => {
      const texto = dados.toString();
      recebidas.push(texto);
      const mensagem = JSON.parse(texto) as { tipo: string; corrida?: string; sequencia?: number };
      if (mensagem.tipo === 'hello') {
        if (opcoes.recusar) {
          recusado = true;
          setTimeout(
            () => socket.close(opcoes.recusar, 'recusado no teste'),
            opcoes.atrasoRecusaMs ?? 0,
          );
        }
        return;
      }
      if (recusado || opcoes.semAck) return;
      const ack = JSON.stringify({
        tipo: 'ack',
        corrida: mensagem.corrida,
        sequencia: mensagem.sequencia,
      });
      setTimeout(() => socket.send(ack), opcoes.atrasoAckMs ?? 0);
    });
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as { port: number };
  return { url: `ws://127.0.0.1:${port}/ws/telemetria`, recebidas, app };
}

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

describe('simulador (API programática)', () => {
  let servidor: ServidorTeste | null = null;
  afterEach(async () => {
    await servidor?.app.close();
    servidor = null;
  });

  it('conectar() envia o hello como primeira mensagem, com boot de 6 dígitos hexadecimais', async () => {
    servidor = await subirServidor();
    const sim = criarSimulador({ url: servidor.url, semente: 1 });
    await sim.conectar();
    await esperar(50);

    expect(sim.boot).toMatch(/^[0-9a-f]{6}$/);
    expect(servidor.recebidas).toHaveLength(1);
    const hello = JSON.parse(servidor.recebidas[0]!);
    expect(validador.hello(hello)).toMatchObject({ ok: true });
    expect(hello).toEqual({
      tipo: 'hello',
      versao: 1,
      dispositivo: 'sim-01',
      token: 'T-VALIDO',
      boot: sim.boot,
    });
    await sim.encerrar();
    expect(sim.fechamento?.codigo).toBe(1000);
  });

  it('exemplo do README: envia a corrida, espera a confirmação e só então fecha', async () => {
    // O `ack` atrasado é o que fazia o exemplo antigo (fechar logo depois de enviar) perder tudo.
    servidor = await subirServidor({ atrasoAckMs: 20 });
    const sim = criarSimulador({ url: servidor.url, labirinto: '8x4', taxa: 0, semente: 7 });
    await sim.conectar();
    const corrida = await sim.iniciarCorrida();
    await sim.aguardarConfirmacao(corrida.mensagens);
    await sim.encerrar();

    expect(corrida.corrida).toBe(`r${sim.boot}-1`);
    const mensagens = servidor.recebidas.slice(1).map((texto) => JSON.parse(texto));
    expect(mensagens).toHaveLength(corrida.mensagens);
    expect(mensagens[0]).toMatchObject({ tipo: 'inicio_corrida', sequencia: 1, labirinto: '8x4' });
    expect(mensagens.at(-1)).toMatchObject({ tipo: 'fim_corrida', resultado: 'sucesso' });
    for (const mensagem of mensagens) {
      expect(validador.corrida(mensagem)).toMatchObject({ ok: true });
    }
    expect(sim.acks.at(-1)).toEqual({
      tipo: 'ack',
      corrida: corrida.corrida,
      sequencia: corrida.mensagens,
    });
  });

  it('várias corridas na mesma conexão: cada uma tem id novo e é confirmada separadamente', async () => {
    servidor = await subirServidor({ atrasoAckMs: 10 });
    const sim = criarSimulador({ url: servidor.url, taxa: 0, semente: 3 });
    await sim.conectar();
    const primeira = await sim.iniciarCorrida();
    await sim.aguardarConfirmacao(primeira.mensagens);
    const segunda = await sim.iniciarCorrida();
    // Os `ack` da primeira (com sequências tão altas quanto) não valem para a segunda.
    await sim.aguardarConfirmacao(segunda.mensagens);
    await sim.encerrar();

    expect(segunda.corrida).toBe(`r${sim.boot}-2`);
    const inicios = servidor.recebidas
      .map((texto) => JSON.parse(texto))
      .filter((m) => m.tipo === 'inicio_corrida');
    expect(inicios.map((m) => [m.corrida, m.sequencia])).toEqual([
      [primeira.corrida, 1],
      [segunda.corrida, 1],
    ]);
    expect(inicios[1].tempo_ms).toBeGreaterThan(inicios[0].tempo_ms);
    expect(sim.acks.filter((a) => a.corrida === segunda.corrida).at(-1)?.sequencia).toBe(
      segunda.mensagens,
    );
  });

  it('respeita a taxa de envio', async () => {
    servidor = await subirServidor();
    const sim = criarSimulador({ url: servidor.url, taxa: 1000, semente: 1 });
    await sim.conectar();
    const inicio = performance.now();
    const corrida = await sim.iniciarCorrida();
    const decorrido = performance.now() - inicio;
    await sim.encerrar();
    // N mensagens a 1000/s levam pelo menos (N − 1) ms.
    expect(decorrido).toBeGreaterThanOrEqual(corrida.mensagens - 1 - 5);
  });

  it('hello recusado DEPOIS do envio (taxa 0): aguardarConfirmacao() rejeita com o código', async () => {
    // Caso da revisão: o backend leva alguns milissegundos para conferir o token, e com taxa 0 a
    // corrida inteira sai antes da recusa. O envio termina sem erro (o robô não espera nada);
    // quem descobre a recusa é a confirmação.
    // 500 ms de folga: mesmo num computador lento, a corrida inteira sai antes da recusa.
    servidor = await subirServidor({
      recusar: CodigoFechamento.TOKEN_INVALIDO,
      atrasoRecusaMs: 500,
    });
    const sim = criarSimulador({ url: servidor.url, token: 'T-ERRADO', taxa: 0, semente: 1 });
    await sim.conectar();
    const corrida = await sim.iniciarCorrida();

    const falha = await sim.aguardarConfirmacao(corrida.mensagens).catch((e: unknown) => e);
    expect(falha).toBeInstanceOf(ErroSimulador);
    expect((falha as ErroSimulador).message).toMatch(/antes do ack.*4001/);
    expect((falha as ErroSimulador).fechamento).toEqual({
      codigo: 4001,
      motivo: 'recusado no teste',
    });
    expect(sim.acks).toHaveLength(0);
  });

  it('hello recusado ANTES de terminar o envio: iniciarCorrida() já falha com o código', async () => {
    servidor = await subirServidor({ recusar: CodigoFechamento.TOKEN_INVALIDO });
    const sim = criarSimulador({ url: servidor.url, token: 'T-ERRADO', taxa: 200 });
    await sim.conectar();

    const falha = await sim.iniciarCorrida().catch((e: unknown) => e);
    expect(falha).toBeInstanceOf(ErroSimulador);
    expect((falha as ErroSimulador).message).toMatch(/4001/);
    expect(sim.fechamento).toEqual({ codigo: 4001, motivo: 'recusado no teste' });
    // Com a conexão já fechada, a confirmação também falha na hora.
    await expect(sim.aguardarConfirmacao(1)).rejects.toThrow(/4001/);
  });

  it('aguardarConfirmacao() rejeita quando o prazo acaba sem ack', async () => {
    servidor = await subirServidor({ semAck: true });
    const sim = criarSimulador({ url: servidor.url, taxa: 0, semente: 1 });
    await sim.conectar();
    const corrida = await sim.iniciarCorrida();

    await expect(sim.aguardarConfirmacao(corrida.mensagens, 200)).rejects.toThrow(
      /prazo de 200 ms esgotado .*último ack: nenhum/,
    );
    await sim.encerrar();
  });

  it('aguardarConfirmacao() resolve na hora se o ack já chegou, e rejeita sem corrida', async () => {
    servidor = await subirServidor();
    const sim = criarSimulador({ url: servidor.url, taxa: 0, semente: 1 });
    await sim.conectar();
    await expect(sim.aguardarConfirmacao(1)).rejects.toThrow(/nenhuma corrida/);

    const corrida = await sim.iniciarCorrida();
    await sim.aguardarConfirmacao(corrida.mensagens);
    await expect(sim.aguardarConfirmacao(1, 1)).resolves.toBeUndefined();
    await sim.encerrar();
  });

  it('conectar() falha com um erro claro quando não há backend', async () => {
    servidor = await subirServidor();
    const { url } = servidor;
    await servidor.app.close();
    servidor = null;

    const sim = criarSimulador({ url });
    await expect(sim.conectar()).rejects.toThrow(/sem conexão/);
  });

  it('enviar() aceita texto qualquer, para os cenários de mensagem malformada', async () => {
    servidor = await subirServidor();
    const sim = criarSimulador({ url: servidor.url });
    await sim.conectar();
    sim.enviar('{"tipo":"hello","versao":1,"dispositivo":"sim-01","token":"T","boot":"b2"}');
    await esperar(50);
    await sim.encerrar();
    expect(servidor.recebidas.at(-1)).toContain('"boot":"b2"');
  });

  it('conexão "fechando" no meio do envio: espera o close e informa o código', async () => {
    // Antes da correção, o envio seguinte falhava com "a conexão não está aberta", sem o 4001:
    // o socket já estava fechando, mas o evento `close` ainda não tinha chegado.
    const sim = criarSimulador({
      taxa: 0,
      semente: 1,
      criarSocket: () => new SocketFalso(3),
    });
    await sim.conectar();

    const falha = await sim.iniciarCorrida().catch((e: unknown) => e);
    expect(falha).toBeInstanceOf(ErroSimulador);
    expect((falha as ErroSimulador).message).toMatch(/4001/);
    expect(sim.fechamento).toEqual({ codigo: 4001, motivo: 'token inválido' });
  });

  it('valida as opções', () => {
    expect(() => criarSimulador({ taxa: -1 })).toThrow(/taxa/);
    expect(() => criarSimulador({ boot: 'com espaço' })).toThrow(/boot/);
  });
});
