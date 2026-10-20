/**
 * Cada cenário de falha do simulador contra o backend DE VERDADE (gateway `/ws/telemetria`,
 * ServicoIngestao e ServicoCorrida), com as portas em memória de `testes/apoio` no lugar do
 * PostgreSQL. Os resultados esperados são os dos casos de teste do backend
 * (`docs/software/backend/4_casos_de_teste.md`), com os mesmos números quando o caso os dá.
 *
 * O relógio do backend é o da máquina mais um deslocamento: `avancar(ms)` faz o tempo passar
 * sem esperar (por exemplo, os 121 s do CT-BE-13).
 */
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { FimCorrida } from '../../../protocolo/tipos.js';
import { criarValidadorProtocolo } from '../../../protocolo/validador.js';
import { TIPOS_ANOMALIA } from '../../../simulador/anomalias.js';
import { criarSimulador, type Simulador } from '../../../simulador/simulador.js';
import { ServicoConsulta } from '../../../src/aplicacao/index.js';
import { construirApp } from '../../../src/app.js';
import { AmbienteEmMemoria, DISPOSITIVO } from '../../apoio/ingestao-em-memoria.js';
import { linhaDoTempoVazia } from '../../apoio/linha-do-tempo-vazia.js';

interface Backend {
  amb: AmbienteEmMemoria;
  app: FastifyInstance;
  url: string;
  avancar(ms: number): void;
}

async function subirBackend(): Promise<Backend> {
  const amb = new AmbienteEmMemoria();
  let deslocamento = 0;
  Object.defineProperty(amb, 'relogio', {
    get: () => Date.now() + deslocamento,
    set: () => {},
    configurable: true,
  });
  amb.dispositivos.set('sim-02', {
    id: 'disp-2',
    identificador: 'sim-02',
    tokenHash: 'hash:T-VALIDO',
    ativo: true,
  });
  const app = await construirApp({
    linhaDoTempo: linhaDoTempoVazia(),
    verificarBanco: async () => true,
    contadores: amb.contadores,
    ingestao: amb.servico,
    // Os cenários só usam /ws/telemetria: a consulta fica vazia, como no teste do /health.
    consulta: new ServicoConsulta({
      detalheCorrida: async () => null,
      leaderboard: async () => [],
    }),
    distribuicao: amb.distribuicao,
    validador: criarValidadorProtocolo(),
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as { port: number };
  return {
    amb,
    app,
    url: `ws://127.0.0.1:${port}/ws/telemetria`,
    avancar: (ms) => {
      deslocamento += ms;
    },
  };
}

async function ate(condicao: () => boolean, prazoMs = 4000): Promise<void> {
  const limite = performance.now() + prazoMs;
  while (!condicao()) {
    if (performance.now() > limite) throw new Error('condição não atingida no prazo');
    await new Promise((resolver) => setTimeout(resolver, 10));
  }
}

const intervalo = (de: number, ate: number) =>
  Array.from({ length: ate - de + 1 }, (_, i) => de + i);

describe('cenários do simulador contra o backend (portas em memória)', () => {
  let backend: Backend;
  const sims: Simulador[] = [];
  const novo = (opcoes: Parameters<typeof criarSimulador>[0] = {}) => {
    const sim = criarSimulador({ url: backend.url, taxa: 0, semente: 42, ...opcoes });
    sims.push(sim);
    return sim;
  };

  afterEach(async () => {
    await Promise.all(sims.splice(0).map((s) => s.encerrar()));
    await backend?.app.close();
  });

  const corridaDo = (id: string, dispositivoId = DISPOSITIVO.id) =>
    backend.amb.corridas.get(`${dispositivoId}/${id}`)!;
  const progressoDe = (id: string) => backend.amb.progresso.get(corridaDo(id).id);
  const rejeicoes = () => backend.amb.rejeicoes.map((r) => r.motivoCodigo);

  it('CT-BE-04: queda com 121–400 retidas e reenvio de 101–400: sem lacunas, 20 duplicatas', async () => {
    backend = await subirBackend();
    // Buffer de 300 mensagens: depois da 400, ele guarda de 101 a 400, como no caso de teste.
    const sim = novo({ buffer: { maxMensagens: 300 } });
    await sim.conectar();
    const corrida = await sim.iniciarCorrida({ quedas: [{ apos: 120, retorno: 401 }] });
    await sim.aguardarConfirmacao(corrida.mensagens);

    expect(corrida.total).toBeGreaterThan(400);
    expect(backend.amb.sequenciasGravadasDe(corrida.corrida)).toEqual(intervalo(1, corrida.total));
    expect(backend.amb.contadores.mensagensDuplicadas).toBe(20);
    expect(corrida.reenviadas).toBe(300);
    await ate(() => progressoDe(corrida.corrida)?.faltantes === 0);
    expect(sim.acks.at(-1)).toMatchObject({ sequencia: corrida.total });
    expect(corridaDo(corrida.corrida).status).toBe('CONCLUIDA');
  });

  it('CT-BE-04, variante sem reenvio: nenhuma duplicata e 280 sequências faltantes (121–400)', async () => {
    backend = await subirBackend();
    const sim = novo({ reenviar: false });
    await sim.conectar();
    const corrida = await sim.iniciarCorrida({ quedas: [{ apos: 120, retorno: 401 }] });
    await sim.aguardarConfirmacao(corrida.contiguaEnviada);

    expect(corrida.contiguaEnviada).toBe(120);
    expect(backend.amb.contadores.mensagensDuplicadas).toBe(0);
    await ate(() => progressoDe(corrida.corrida)?.faltantes === 280);
    expect(backend.amb.sequenciasGravadasDe(corrida.corrida)).toEqual([
      ...intervalo(1, 120),
      ...intervalo(401, corrida.total),
    ]);
  });

  it('CT-BE-13: 121 s sem sinal interrompe; o lote tardio com o fim conclui pelo relógio do robô', async () => {
    backend = await subirBackend();
    const sim = novo();
    const corrida = sim.gerarCorrida();
    await sim.conectar();
    for (const m of corrida.mensagens.slice(0, 100)) sim.emitir(m);
    await sim.aguardarConfirmacao(100);

    await sim.derrubar();
    // O robô termina a corrida fora do ar: tudo vai para o buffer.
    for (const m of corrida.mensagens.slice(100)) sim.emitir(m);
    backend.avancar(121_000);
    backend.amb.corrida.verificarInterrupcoes();
    await backend.amb.esvaziar();
    expect(corridaDo(corrida.id)).toMatchObject({ status: 'INTERROMPIDA', motivo: 'SEM_SINAL' });

    await sim.reconectar();
    await sim.aguardarConfirmacao(corrida.mensagens.length);
    await ate(() => corridaDo(corrida.id).status === 'CONCLUIDA');
    const fim = corrida.mensagens.at(-1) as FimCorrida;
    const inicio = corrida.mensagens[0]!;
    expect(backend.amb.encerramentos.get(corridaDo(corrida.id).id)?.metricas).toMatchObject({
      tempoConclusaoMs: fim.tempo_ms - inicio.tempo_ms,
    });
  });

  it('CT-BE-14: reinício com novo boot interrompe a corrida (REINICIO_ROBO) e recusa o fim', async () => {
    backend = await subirBackend();
    const sim = novo({ boot: 'b1' });
    await sim.conectar();
    const corrida = await sim.iniciarCorrida({ reinicioApos: 200 });
    expect(corrida.reiniciou).toBe(true);

    await ate(() => corridaDo(corrida.corrida).status === 'INTERROMPIDA', 1000);
    expect(corridaDo(corrida.corrida).motivo).toBe('REINICIO_ROBO');
    expect(backend.amb.eventos.at(-1)).toMatchObject({ tipo: 'CONECTADO', boot: sim.boot });

    const fimAtrasado: FimCorrida = {
      versao: 1,
      tipo: 'fim_corrida',
      corrida: corrida.corrida,
      sequencia: 201,
      tempo_ms: 999_999,
      resultado: 'sucesso',
    };
    sim.enviar(fimAtrasado);
    await ate(() => rejeicoes().includes('CORRIDA_FINALIZADA'));
    expect(corridaDo(corrida.corrida).status).toBe('INTERROMPIDA');
  });

  it('CT-BE-03: em silêncio (sem mensagens e sem pong) o sinal cai; na volta, é retomado', async () => {
    backend = await subirBackend();
    const sim = novo();
    const corrida = sim.gerarCorrida();
    await sim.conectar();
    for (const m of corrida.mensagens.slice(0, 100)) sim.emitir(m);
    await sim.aguardarConfirmacao(100);

    sim.silenciar();
    for (const m of corrida.mensagens.slice(100, 200)) sim.emitir(m);
    // 3 s sem mensagens: o monitor do gateway (a cada 1 s) declara a perda.
    backend.avancar(3100);
    const tipos = () => backend.amb.eventos.map((e) => e.tipo);
    await ate(() => tipos().includes('SINAL_PERDIDO'), 2500);
    expect(sim.conectado).toBe(true);

    sim.retomar();
    for (const m of corrida.mensagens.slice(200)) sim.emitir(m);
    await sim.aguardarConfirmacao(corrida.mensagens.length);
    expect(tipos()).toEqual(
      expect.arrayContaining(['SINAL_PERDIDO', 'SINAL_RETOMADO', 'CONECTADO']),
    );
    expect(backend.amb.sequenciasGravadasDe(corrida.id)).toEqual(
      intervalo(1, corrida.mensagens.length),
    );
    // O hello no meio da conexão veio com o mesmo boot: não é reinício.
    expect(tipos()).not.toContain('REINICIO_DETECTADO');
    expect(backend.amb.contadores.mensagensDuplicadas).toBe(100);
  });

  it('CT-BE-05 a 08 e 17: cada anomalia é rejeitada com o motivo certo e a corrida fecha inteira', async () => {
    backend = await subirBackend();
    const sim = novo();
    await sim.conectar();
    const corrida = await sim.iniciarCorrida({
      anomalias: TIPOS_ANOMALIA.map((tipo) => ({ tipo })),
    });
    await sim.aguardarConfirmacao(corrida.mensagens);
    await backend.amb.esvaziar();

    expect(rejeicoes().sort()).toEqual(
      [
        'COORDENADA_FORA_DO_LABIRINTO',
        'ESQUEMA_INVALIDO', // sem-campo
        'ESQUEMA_INVALIDO', // labirinto-invalido
        'JSON_INVALIDO',
        'TEMPO_REGRESSIVO',
        'TENSAO_FORA_DA_FAIXA',
        'TENSAO_FORA_DA_FAIXA',
        'TIPO_DESCONHECIDO',
      ].sort(),
    );
    // Nenhuma rejeição derrubou a conexão (RF-75).
    expect(sim.fechamentos).toEqual([]);
    expect(backend.amb.contadores.mensagensDuplicadas).toBe(2);
    expect(backend.amb.sequenciasGravadasDe(corrida.corrida)).toEqual(intervalo(1, corrida.total));
    // A duplicata não é distribuída de novo e a fora de ordem sai na ordem de sequência.
    const aplicadas = backend.amb.publicados
      .filter((p) => p.evento === 'mensagem-aplicada')
      .map((p) => (p.dados as { mensagem: { sequencia: number } }).mensagem.sequencia);
    // O fim_corrida não é uma "mensagem aplicada": ele sai como o evento de status.
    expect(aplicadas).toEqual(intervalo(1, corrida.total - 1));
    expect(corridaDo(corrida.corrida).status).toBe('CONCLUIDA');
  });

  it('CT-BE-15: com atraso de rede de 0 a 800 ms, o tempo oficial é o do relógio do robô', async () => {
    backend = await subirBackend();
    const sim = novo({ atrasoRede: { minimoMs: 0, maximoMs: 800 } });
    await sim.conectar();
    const corrida = await sim.iniciarCorrida();
    await sim.aguardarConfirmacao(corrida.mensagens);
    await ate(() => corridaDo(corrida.corrida).status === 'CONCLUIDA');

    expect(backend.amb.encerramentos.get(corridaDo(corrida.corrida).id)?.metricas).toMatchObject({
      tempoConclusaoMs: corrida.duracaoMs,
    });
  });

  it('CT-BE-18 e 19: tensões em degraus dão as métricas e exatamente 2 alertas', async () => {
    backend = await subirBackend();
    const sim18 = novo({ tensoes: [8.2, 8.0, 7.8, 7.6] });
    await sim18.conectar();
    const c18 = await sim18.iniciarCorrida();
    await sim18.aguardarConfirmacao(c18.mensagens);
    await ate(() => corridaDo(c18.corrida).status === 'CONCLUIDA');
    expect(backend.amb.encerramentos.get(corridaDo(c18.corrida).id)?.metricas).toMatchObject({
      tensaoInicialV: 8.2,
      tensaoFinalV: 7.6,
      deltaV: 0.6,
      cargaInicialPct: 87.5,
      cargaFinalPct: 50,
    });

    const sim19 = novo({ tensoes: [7.2, 6.9, 6.8, 7.05, 6.9, 7.2, 6.9] });
    await sim19.conectar();
    const c19 = await sim19.iniciarCorrida();
    await sim19.aguardarConfirmacao(c19.mensagens);
    await backend.amb.esvaziar();
    const alertas = backend.amb.publicados.filter(
      (p) => p.evento === 'alerta-tensao' && p.dados.corridaId === corridaDo(c19.corrida).id,
    );
    expect(alertas.map((a) => (a.dados as { tensaoV: number }).tensaoV)).toEqual([6.9, 6.9]);
  });

  it('CT-BE-21: sim-01 e sim-02 ao mesmo tempo geram corridas separadas, cada uma completa', async () => {
    backend = await subirBackend();
    const [a, b] = [
      novo({ dispositivo: 'sim-01', taxa: 400 }),
      novo({ dispositivo: 'sim-02', taxa: 400 }),
    ];
    await Promise.all([a.conectar(), b.conectar()]);
    const [ca, cb] = await Promise.all([a.iniciarCorrida(), b.iniciarCorrida()]);
    await Promise.all([a.aguardarConfirmacao(ca.mensagens), b.aguardarConfirmacao(cb.mensagens)]);
    await ate(
      () =>
        corridaDo(ca.corrida, 'disp-1')?.status === 'CONCLUIDA' &&
        corridaDo(cb.corrida, 'disp-2')?.status === 'CONCLUIDA',
    );
    expect(corridaDo(ca.corrida, 'disp-1').id).not.toBe(corridaDo(cb.corrida, 'disp-2').id);
    expect(backend.amb.contadores.mensagensAceitas).toBe(ca.total + cb.total);
  });
});
