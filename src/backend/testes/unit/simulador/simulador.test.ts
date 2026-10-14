/**
 * API programática do simulador contra um servidor WebSocket local (Fastify +
 * @fastify/websocket, as mesmas bibliotecas do backend). O servidor faz o papel mínimo do
 * backend: recebe as mensagens e responde `ack` com a sequência de cada uma.
 */
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { CodigoFechamento } from '../../../protocolo/tipos.js';
import { criarValidadorProtocolo } from '../../../protocolo/validador.js';
import { criarSimulador, ErroSimulador } from '../../../simulador/simulador.js';

const validador = criarValidadorProtocolo();

interface ServidorTeste {
  url: string;
  recebidas: string[];
  app: FastifyInstance;
}

/** `recusar`: fecha a conexão com esse código ao receber o `hello`. */
async function subirServidor(recusar?: number): Promise<ServidorTeste> {
  const recebidas: string[] = [];
  const app = Fastify();
  await app.register(fastifyWebsocket);
  app.get('/ws/telemetria', { websocket: true }, (socket) => {
    socket.on('message', (dados) => {
      const texto = dados.toString();
      recebidas.push(texto);
      const mensagem = JSON.parse(texto) as { tipo: string; corrida?: string; sequencia?: number };
      if (mensagem.tipo === 'hello') {
        if (recusar) socket.close(recusar, 'recusado no teste');
        return;
      }
      socket.send(
        JSON.stringify({ tipo: 'ack', corrida: mensagem.corrida, sequencia: mensagem.sequencia }),
      );
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

  it('iniciarCorrida() envia a corrida completa e registra os acks', async () => {
    servidor = await subirServidor();
    const sim = criarSimulador({ url: servidor.url, labirinto: '8x4', taxa: 0, semente: 7 });
    await sim.conectar();
    const corrida = await sim.iniciarCorrida();
    await esperar(100);
    await sim.encerrar();

    expect(corrida.corrida).toBe(`r${sim.boot}-1`);
    const mensagens = servidor.recebidas.slice(1).map((texto) => JSON.parse(texto));
    expect(mensagens).toHaveLength(corrida.mensagens);
    expect(mensagens[0]).toMatchObject({ tipo: 'inicio_corrida', sequencia: 1, labirinto: '8x4' });
    expect(mensagens.at(-1)).toMatchObject({ tipo: 'fim_corrida', resultado: 'sucesso' });
    for (const mensagem of mensagens) {
      expect(validador.corrida(mensagem)).toMatchObject({ ok: true });
    }
    expect(sim.acks).toHaveLength(corrida.mensagens);
    expect(sim.acks.at(-1)).toEqual({
      tipo: 'ack',
      corrida: corrida.corrida,
      sequencia: corrida.mensagens,
    });
  });

  it('uma segunda corrida no mesmo boot ganha um novo id e recomeça a sequência', async () => {
    servidor = await subirServidor();
    const sim = criarSimulador({ url: servidor.url, taxa: 0, semente: 3 });
    await sim.conectar();
    const primeira = await sim.iniciarCorrida();
    const segunda = await sim.iniciarCorrida();
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

  it('se o backend recusa o hello, a corrida falha com o código de fechamento', async () => {
    servidor = await subirServidor(CodigoFechamento.TOKEN_INVALIDO);
    const sim = criarSimulador({ url: servidor.url, token: 'T-ERRADO', taxa: 200 });
    await sim.conectar();

    const falha = await sim.iniciarCorrida().catch((e: unknown) => e);
    expect(falha).toBeInstanceOf(ErroSimulador);
    expect((falha as ErroSimulador).message).toMatch(/4001/);
    expect(sim.fechamento).toEqual({ codigo: 4001, motivo: 'recusado no teste' });
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

  it('valida as opções', () => {
    expect(() => criarSimulador({ taxa: -1 })).toThrow(/taxa/);
    expect(() => criarSimulador({ boot: 'com espaço' })).toThrow(/boot/);
  });
});
