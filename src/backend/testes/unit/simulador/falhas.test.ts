/**
 * Mecânica dos cenários de falha (Fase 2 da #322), contra um servidor WebSocket local que
 * registra cada conexão separadamente: o que chegou, os pongs e como ela terminou.
 *
 * O que estes testes garantem é o comportamento do ROBÔ simulado (o que sai, quando e por qual
 * conexão). A reação do backend a cada cenário fica em `cenarios.test.ts`.
 */
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { MensagemCorrida } from '../../../protocolo/tipos.js';
import {
  criarSimulador,
  DURACAO_REINICIO_MS,
  type SocketSimulador,
} from '../../../simulador/simulador.js';

interface Conexao {
  /** Mensagens recebidas, já interpretadas (o texto inválido vira `{ texto }`). */
  mensagens: { tipo?: string; sequencia?: number; boot?: string; corrida?: string }[];
  chegadas: number[];
  pongs: number;
  fechamento: number | null;
}

interface Servidor {
  url: string;
  app: FastifyInstance;
  conexoes: Conexao[];
  /** Manda um ping em todas as conexões abertas a cada `ms` (como o backend, a cada 1 s). */
  pingar(ms: number): void;
}

async function subirServidor(): Promise<Servidor> {
  const conexoes: Conexao[] = [];
  const sockets = new Set<{ ping(): void; readyState: number }>();
  const app = Fastify();
  await app.register(fastifyWebsocket);
  app.get('/ws/telemetria', { websocket: true }, (socket) => {
    const conexao: Conexao = { mensagens: [], chegadas: [], pongs: 0, fechamento: null };
    conexoes.push(conexao);
    sockets.add(socket);
    socket.on('pong', () => conexao.pongs++);
    socket.on('close', (codigo: number) => {
      conexao.fechamento = codigo;
      sockets.delete(socket);
    });
    socket.on('message', (dados) => {
      const texto = dados.toString();
      conexao.chegadas.push(performance.now());
      try {
        const mensagem = JSON.parse(texto) as Conexao['mensagens'][number];
        conexao.mensagens.push(mensagem);
        if (mensagem.tipo !== 'hello' && typeof mensagem.sequencia === 'number') {
          socket.send(
            JSON.stringify({
              tipo: 'ack',
              corrida: mensagem.corrida,
              sequencia: mensagem.sequencia,
            }),
          );
        }
      } catch {
        conexao.mensagens.push({ tipo: 'texto-invalido' });
      }
    });
  });
  let temporizador: ReturnType<typeof setInterval> | null = null;
  app.addHook('onClose', async () => {
    if (temporizador) clearInterval(temporizador);
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as { port: number };
  return {
    url: `ws://127.0.0.1:${port}/ws/telemetria`,
    app,
    conexoes,
    pingar(ms) {
      temporizador = setInterval(() => {
        for (const s of sockets) if (s.readyState === 1) s.ping();
      }, ms);
    },
  };
}

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

async function ate(condicao: () => boolean, prazoMs = 3000): Promise<void> {
  const limite = performance.now() + prazoMs;
  while (!condicao()) {
    if (performance.now() > limite) throw new Error('condição não atingida no prazo');
    await esperar(5);
  }
}

const sequencias = (conexao: Conexao) =>
  conexao.mensagens.filter((m) => m.tipo !== 'hello').map((m) => m.sequencia!);
const intervalo = (de: number, ate: number) =>
  Array.from({ length: ate - de + 1 }, (_, i) => de + i);

describe('simulador: cenários de falha', () => {
  let servidor: Servidor | null = null;
  afterEach(async () => {
    await servidor?.app.close();
    servidor = null;
  });

  describe('buffer, queda e reconexão (CT-BE-04, CT-BE-13)', () => {
    it('derrubar() corta o TCP (1006); o que é emitido fora do ar fica só no buffer', async () => {
      servidor = await subirServidor();
      const sim = criarSimulador({ url: servidor.url, semente: 1 });
      const corrida = sim.gerarCorrida();
      await sim.conectar();
      for (const m of corrida.mensagens.slice(0, 10)) expect(sim.emitir(m)).toBe(true);

      await sim.derrubar();
      expect(sim.conectado).toBe(false);
      expect(sim.fechamento?.codigo).toBe(1006);
      await ate(() => servidor!.conexoes[0]!.fechamento !== null);
      // Sem o handshake de fechamento, o servidor também vê uma queda, e não um "tchau".
      expect(servidor.conexoes[0]!.fechamento).toBe(1006);

      for (const m of corrida.mensagens.slice(10, 20)) expect(sim.emitir(m)).toBe(false);
      expect(sim.buffer).toHaveLength(20);
      expect(() => sim.enviar('qualquer')).toThrow(/não está aberta/);
    });

    it('reconectar() manda hello com o MESMO boot e o buffer inteiro, na ordem', async () => {
      servidor = await subirServidor();
      const sim = criarSimulador({ url: servidor.url, semente: 1 });
      const corrida = sim.gerarCorrida();
      await sim.conectar();
      for (const m of corrida.mensagens.slice(0, 10)) sim.emitir(m);
      await sim.derrubar();
      for (const m of corrida.mensagens.slice(10, 20)) sim.emitir(m);

      await sim.reconectar();
      await ate(() => servidor!.conexoes[1]?.mensagens.length === 21);
      const [antes, depois] = servidor.conexoes as [Conexao, Conexao];
      expect(antes.mensagens[0]).toMatchObject({ tipo: 'hello', boot: sim.boot });
      expect(depois.mensagens[0]).toMatchObject({ tipo: 'hello', boot: sim.boot });
      // O robô não sabe o que foi gravado: reenvia de 1 a 20, inclusive o que já tinha ido.
      expect(sequencias(depois)).toEqual(intervalo(1, 20));
      expect(sim.fechamentos.map((f) => f.codigo)).toEqual([1006]);
      expect(sim.fechamento).toBeNull();
      await sim.encerrar();
    });

    it('roteiro de queda com retorno: nenhuma sequência fica sem sair', async () => {
      servidor = await subirServidor();
      const sim = criarSimulador({ url: servidor.url, taxa: 0, semente: 4 });
      await sim.conectar();
      const corrida = await sim.iniciarCorrida({ quedas: [{ apos: 50, retorno: 80 }] });
      await sim.aguardarConfirmacao(corrida.mensagens);
      await sim.encerrar();

      const [antes, depois] = servidor.conexoes as [Conexao, Conexao];
      expect(sequencias(antes)).toEqual(intervalo(1, 50));
      // Volta antes da 80: hello, buffer de 1 a 79 e o resto da corrida.
      expect(sequencias(depois)).toEqual(intervalo(1, corrida.total));
      expect(corrida).toMatchObject({
        mensagens: corrida.total,
        interrupcoes: 1,
        reenviadas: 79,
        contiguaEnviada: corrida.total,
        reiniciou: false,
      });
    });

    it('variante sem reenvio: continua de onde está e a lacuna fica (CT-BE-04)', async () => {
      servidor = await subirServidor();
      const sim = criarSimulador({ url: servidor.url, taxa: 0, semente: 4, reenviar: false });
      await sim.conectar();
      const corrida = await sim.iniciarCorrida({ quedas: [{ apos: 120, retorno: 401 }] });
      await sim.aguardarConfirmacao(corrida.contiguaEnviada);
      await sim.encerrar();

      const [, depois] = servidor.conexoes as [Conexao, Conexao];
      expect(depois.mensagens[0]).toMatchObject({ tipo: 'hello' });
      expect(sequencias(depois)).toEqual(intervalo(401, corrida.total));
      expect(corrida.reenviadas).toBe(0);
      // Com 121 a 400 de fora, o maior ack possível é o 120.
      expect(corrida.contiguaEnviada).toBe(120);
    });

    it('queda até o fim da corrida: espera a duração e envia o buffer com o fim_corrida', async () => {
      servidor = await subirServidor();
      const sim = criarSimulador({ url: servidor.url, taxa: 0, semente: 2 });
      await sim.conectar();
      const inicio = performance.now();
      const corrida = await sim.iniciarCorrida({ quedas: [{ apos: 30, duracaoMs: 300 }] });
      expect(performance.now() - inicio).toBeGreaterThanOrEqual(295);
      await sim.aguardarConfirmacao(corrida.mensagens);
      await sim.encerrar();

      const depois = servidor.conexoes[1]!;
      expect(depois.mensagens.at(-1)).toMatchObject({ tipo: 'fim_corrida' });
      expect(sequencias(depois)).toEqual(intervalo(1, corrida.total));
    });

    it('o buffer respeita a retenção: numa queda mais longa que ela, o mais antigo se perde', async () => {
      servidor = await subirServidor();
      // 2 s no relógio do robô cabem cerca de 40 mensagens (posicao + energia a cada 100 ms).
      const sim = criarSimulador({
        url: servidor.url,
        taxa: 0,
        semente: 2,
        buffer: { retencaoMs: 2000 },
      });
      await sim.conectar();
      const corrida = await sim.iniciarCorrida({ quedas: [{ apos: 10, retorno: 200 }] });
      await sim.encerrar();

      const reenviadas = sequencias(servidor.conexoes[1]!);
      expect(reenviadas[0]).toBeGreaterThan(11);
      expect(corrida.contiguaEnviada).toBe(10);
    });

    it('sem terminate() no socket, a queda usa close(4000)', async () => {
      servidor = await subirServidor();
      const { url } = servidor;
      const sim = criarSimulador({
        url,
        criarSocket: (endereco) => {
          const ws = new WebSocket(endereco) as unknown as SocketSimulador;
          return ws;
        },
      });
      await sim.conectar();
      await sim.derrubar();
      expect(sim.fechamento?.codigo).toBe(4000);
    });
  });

  describe('silêncio com a conexão aberta (CT-BE-03)', () => {
    it('para de enviar e de responder ao ping; na volta, hello e buffer na MESMA conexão', async () => {
      servidor = await subirServidor();
      servidor.pingar(20);
      const sim = criarSimulador({ url: servidor.url, semente: 1 });
      const corrida = sim.gerarCorrida();
      await sim.conectar();
      const conexao = () => servidor!.conexoes[0]!;
      await ate(() => conexao().pongs >= 2);
      for (const m of corrida.mensagens.slice(0, 5)) sim.emitir(m);
      await ate(() => conexao().mensagens.length === 6);

      sim.silenciar();
      expect(sim.silenciado).toBe(true);
      const pongsAntes = conexao().pongs;
      for (const m of corrida.mensagens.slice(5, 15)) expect(sim.emitir(m)).toBe(false);
      await esperar(150);
      // Mudo de verdade: nenhum pong e nenhuma mensagem, com o TCP aberto.
      expect(conexao().pongs).toBeLessThanOrEqual(pongsAntes + 1);
      expect(conexao().mensagens).toHaveLength(6);
      expect(conexao().fechamento).toBeNull();
      expect(sim.conectado).toBe(true);

      sim.retomar();
      await ate(() => conexao().mensagens.length === 6 + 1 + 15);
      await ate(() => conexao().pongs > pongsAntes + 1);
      expect(servidor.conexoes).toHaveLength(1);
      expect(conexao().mensagens[6]).toMatchObject({ tipo: 'hello', boot: sim.boot });
      expect(
        conexao()
          .mensagens.slice(7)
          .map((m) => m.sequencia),
      ).toEqual(intervalo(1, 15));
      await sim.encerrar();
    });

    it('roteiro de silêncio: a corrida chega inteira depois da volta', async () => {
      servidor = await subirServidor();
      const sim = criarSimulador({ url: servidor.url, taxa: 0, semente: 3 });
      await sim.conectar();
      const corrida = await sim.iniciarCorrida({ silencios: [{ apos: 40, duracaoMs: 100 }] });
      await sim.aguardarConfirmacao(corrida.mensagens);
      await sim.encerrar();

      const recebidas = sequencias(servidor.conexoes[0]!);
      expect(recebidas.slice(0, 40)).toEqual(intervalo(1, 40));
      expect(new Set(recebidas)).toEqual(new Set(intervalo(1, corrida.total)));
      expect(corrida.interrupcoes).toBe(1);
    });

    it('silenciar() falha com um socket que não controla o pong', async () => {
      servidor = await subirServidor();
      const sim = criarSimulador({
        url: servidor.url,
        criarSocket: (endereco) => new WebSocket(endereco) as unknown as SocketSimulador,
      });
      await sim.conectar();
      expect(() => sim.silenciar()).toThrow(/pong/);
      await sim.encerrar();
    });
  });

  describe('reinício do robô (CT-BE-14)', () => {
    it('reiniciar(): outro boot, buffer vazio, relógio e numeração de corridas do zero', async () => {
      servidor = await subirServidor();
      const sim = criarSimulador({ url: servidor.url, semente: 1, boot: 'b1' });
      const primeira = sim.gerarCorrida();
      await sim.conectar();
      for (const m of primeira.mensagens.slice(0, 10)) sim.emitir(m);

      await sim.reiniciar({ boot: 'b2', duracaoMs: 0 });
      expect(sim.boot).toBe('b2');
      expect(sim.buffer).toHaveLength(0);
      await ate(() => servidor!.conexoes[1]?.mensagens.length === 1);
      // Só o hello: a RAM (e o buffer) se perdeu no reinício.
      expect(servidor.conexoes[1]!.mensagens).toEqual([
        expect.objectContaining({ tipo: 'hello', boot: 'b2' }),
      ]);

      const segunda = sim.gerarCorrida();
      expect(primeira.id).toBe('rb1-1');
      expect(segunda.id).toBe('rb2-1');
      expect(segunda.mensagens[0]!.tempo_ms).toBeLessThan(
        (primeira.mensagens[0] as MensagemCorrida).tempo_ms + 10_000,
      );
      await sim.encerrar();
    });

    it('roteiro com reinicioApos: a corrida para ali, sem fim_corrida', async () => {
      servidor = await subirServidor();
      const sim = criarSimulador({ url: servidor.url, taxa: 0, semente: 1, boot: 'b1' });
      await sim.conectar();
      const inicio = performance.now();
      const corrida = await sim.iniciarCorrida({ reinicioApos: 25 });
      // O robô leva DURACAO_REINICIO_MS para ligar e reconectar.
      expect(performance.now() - inicio).toBeGreaterThanOrEqual(DURACAO_REINICIO_MS - 5);
      await esperar(50);
      await sim.encerrar();

      expect(corrida).toMatchObject({ reiniciou: true, mensagens: 25 });
      expect(sequencias(servidor.conexoes[0]!)).toEqual(intervalo(1, 25));
      expect(servidor.conexoes[1]!.mensagens).toEqual([
        expect.objectContaining({ tipo: 'hello', boot: sim.boot }),
      ]);
      expect(sim.boot).not.toBe('b1');
    });

    it('roteiro com duracaoReinicioMs: 0 reconecta logo depois da queda (#368)', async () => {
      servidor = await subirServidor();
      const sim = criarSimulador({ url: servidor.url, taxa: 0, semente: 1, boot: 'b1' });
      await sim.conectar();
      const inicio = performance.now();
      const corrida = await sim.iniciarCorrida({ reinicioApos: 25, duracaoReinicioMs: 0 });
      // Sem a espera padrão de DURACAO_REINICIO_MS: só o tempo de derrubar e conectar de novo.
      expect(performance.now() - inicio).toBeLessThan(DURACAO_REINICIO_MS / 2);
      await ate(() => servidor!.conexoes[1]?.mensagens.length === 1);
      await sim.encerrar();

      expect(corrida).toMatchObject({ reiniciou: true, mensagens: 25 });
      expect(sequencias(servidor.conexoes[0]!)).toEqual(intervalo(1, 25));
      expect(servidor.conexoes[1]!.mensagens).toEqual([
        expect.objectContaining({ tipo: 'hello', boot: sim.boot }),
      ]);
    });
  });

  describe('anomalias, atraso de rede e dois simuladores', () => {
    it('anomalias do roteiro saem pelo socket e a corrida continua completa', async () => {
      servidor = await subirServidor();
      const sim = criarSimulador({ url: servidor.url, taxa: 0, semente: 5 });
      await sim.conectar();
      const corrida = await sim.iniciarCorrida({
        anomalias: [{ tipo: 'nao-json' }, { tipo: 'duplicada', sequencia: 30, vezes: 2 }],
      });
      await sim.aguardarConfirmacao(corrida.mensagens);
      await sim.encerrar();

      const conexao = servidor.conexoes[0]!;
      expect(conexao.mensagens.filter((m) => m.tipo === 'texto-invalido')).toHaveLength(1);
      expect(sequencias(conexao).filter((s) => s === 30)).toHaveLength(3);
      expect(corrida.anomalias).toEqual([
        expect.objectContaining({ tipo: 'duplicada', sequencia: 30, injetadas: 2 }),
        expect.objectContaining({ tipo: 'nao-json', injetadas: 1 }),
      ]);
      // Anomalias são avulsas: não entram no buffer.
      expect(sim.buffer).toHaveLength(corrida.total);
    });

    it('atraso de rede (CT-BE-15): cada mensagem demora, mas a ordem é mantida', async () => {
      servidor = await subirServidor();
      const sim = criarSimulador({
        url: servidor.url,
        semente: 1,
        atrasoRede: { minimoMs: 30, maximoMs: 80 },
      });
      const corrida = sim.gerarCorrida();
      await sim.conectar();
      const saida = performance.now();
      for (const m of corrida.mensagens.slice(0, 40)) sim.emitir(m);
      await sim.encerrar();

      const conexao = servidor.conexoes[0]!;
      // `encerrar()` esperou a fila esvaziar: nada se perdeu.
      expect(sequencias(conexao)).toEqual(intervalo(1, 40));
      expect(conexao.chegadas[1]! - saida).toBeGreaterThanOrEqual(25);
      for (let i = 1; i < conexao.chegadas.length; i++) {
        expect(conexao.chegadas[i]!).toBeGreaterThanOrEqual(conexao.chegadas[i - 1]!);
      }
    });

    it('com atraso, contiguaEnviada só conta o que já saiu do simulador', async () => {
      servidor = await subirServidor();
      const sim = criarSimulador({ url: servidor.url, taxa: 0, semente: 1, atrasoRede: 60 });
      await sim.conectar();
      const corrida = await sim.iniciarCorrida({ quedas: [{ apos: 200, duracaoMs: 50 }] });
      // A fila esvaziou antes de `iniciarCorrida()` voltar.
      expect(corrida.contiguaEnviada).toBe(corrida.total);
      await sim.aguardarConfirmacao(corrida.total);
      await sim.encerrar();
    });

    it('dois simuladores ao mesmo tempo (CT-BE-21): conexões e corridas separadas', async () => {
      servidor = await subirServidor();
      const sims = ['sim-01', 'sim-02'].map((dispositivo, i) =>
        criarSimulador({ url: servidor!.url, dispositivo, taxa: 500, semente: 10 + i }),
      );
      await Promise.all(sims.map((s) => s.conectar()));
      const corridas = await Promise.all(sims.map((s) => s.iniciarCorrida()));
      await Promise.all(sims.map((s, i) => s.aguardarConfirmacao(corridas[i]!.mensagens)));
      await Promise.all(sims.map((s) => s.encerrar()));

      expect(sims[0]!.boot).not.toBe(sims[1]!.boot);
      const porDispositivo = new Map(
        servidor.conexoes.map((c) => [(c.mensagens[0] as { dispositivo?: string }).dispositivo, c]),
      );
      for (const [i, sim] of sims.entries()) {
        const conexao = porDispositivo.get(`sim-0${i + 1}`)!;
        expect(conexao.mensagens[0]).toMatchObject({ tipo: 'hello', boot: sim.boot });
        expect(sequencias(conexao)).toEqual(intervalo(1, corridas[i]!.total));
        expect(conexao.mensagens.slice(1).every((m) => m.corrida === corridas[i]!.corrida)).toBe(
          true,
        );
      }
    });
  });

  it('valida as opções e o roteiro', async () => {
    expect(() => criarSimulador({ tensoes: [] })).toThrow(/vazia/);
    expect(() => criarSimulador({ tensoes: [7.2, 4.9] })).toThrow(/anomalia/);
    expect(() => criarSimulador({ atrasoRede: { minimoMs: 50, maximoMs: 10 } })).toThrow(/atraso/);
    expect(() => criarSimulador({ buffer: { retencaoMs: -5 } })).toThrow(/retenção/);

    servidor = await subirServidor();
    const sim = criarSimulador({ url: servidor.url, taxa: 0, semente: 1 });
    await sim.conectar();
    await expect(sim.iniciarCorrida({ quedas: [{ apos: 99_999 }] })).rejects.toThrow(/apos/);
    await expect(sim.iniciarCorrida({ quedas: [{ apos: 10, retorno: 5 }] })).rejects.toThrow(
      /retorno/,
    );
    await expect(sim.iniciarCorrida({ reinicioApos: 0 })).rejects.toThrow(/reinicioApos/);
    await expect(sim.iniciarCorrida({ duracaoReinicioMs: 0 })).rejects.toThrow(
      /só vale junto com reinicioApos/,
    );
    await expect(sim.iniciarCorrida({ reinicioApos: 10, duracaoReinicioMs: -1 })).rejects.toThrow(
      /duracaoReinicioMs inválida/,
    );
    // Os roteiros recusados não emitiram nada: a conexão continua só com o hello.
    expect(sim.enviadas).toHaveLength(1);
    await expect(sim.conectar()).rejects.toThrow(/já está conectado/);
    await sim.encerrar();
  });
});
