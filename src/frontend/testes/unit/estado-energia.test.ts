import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dadosDasMetricas } from '../../src/adaptadores/metricas';
import { ClientePainelWS } from '../../src/adaptadores/ws';
import type { AmostraEnergia } from '../../src/dominio';
import { LIMITE_AMOSTRAS_ENERGIA } from '../../src/dominio';
import { usePainel } from '../../src/estado';
import { aoVivo, CORRIDA, metricas } from '../suporte/mensagens';
import { reiniciarStore } from '../suporte/store';
import { WebSocketFalso } from '../suporte/websocket-falso';

const acoes = () => usePainel.getState().acoes;
const energia = () => usePainel.getState().aoVivo.energia;

function amostra(i: number, total = 6000): AmostraEnergia {
  return {
    seq: null,
    tempoMs: 1000 + i * 100,
    tensaoV: 8.4 - (0.8 * i) / Math.max(total - 1, 1),
    correnteA: 0.5,
    potenciaW: 4,
    cargaPct: 100 - i / 100,
  };
}

beforeEach(reiniciarStore);

describe('série de energia (CT-FE-12)', () => {
  it('novas amostras são acrescentadas sem apagar as anteriores da tentativa', () => {
    for (let i = 0; i < 3; i++) acoes().adicionarAmostraEnergia(amostra(i));
    const primeira = energia()[0];

    acoes().adicionarAmostraEnergia(amostra(3));

    expect(energia()).toHaveLength(4);
    expect(energia()[0]).toBe(primeira);
    expect(energia().map((a) => a.tempoMs)).toEqual([1000, 1100, 1200, 1300]);
  });

  it('6.000 amostras (10 min a 10 Hz) permanecem sem perda', () => {
    for (let i = 0; i < 6000; i++) acoes().adicionarAmostraEnergia(amostra(i));

    expect(energia()).toHaveLength(6000);
    expect(energia()[0]?.tempoMs).toBe(1000);
    expect(energia().at(-1)?.tempoMs).toBe(600900);
  });

  it('os valores atuais acompanham a última amostra', () => {
    for (let i = 0; i < 6000; i++) acoes().adicionarAmostraEnergia(amostra(i));
    const { tensaoV, cargaPct } = usePainel.getState().aoVivo;
    expect(tensaoV).toBeCloseTo(7.6);
    expect(cargaPct).toBeCloseTo(100 - 5999 / 100);
  });

  it('acima do teto de segurança, descarta as amostras mais antigas', () => {
    const total = LIMITE_AMOSTRAS_ENERGIA + 50;
    for (let i = 0; i < total; i++) acoes().adicionarAmostraEnergia(amostra(i, total));

    expect(energia()).toHaveLength(LIMITE_AMOSTRAS_ENERGIA);
    expect(energia()[0]?.tempoMs).toBe(1000 + 50 * 100);
  });

  it('uma nova corrida começa com a série vazia', () => {
    for (let i = 0; i < 5; i++) acoes().adicionarAmostraEnergia(amostra(i));
    acoes().reiniciarExecucao({ corrida: 'nova' });
    expect(energia()).toEqual([]);
  });
});

describe('dadosDasMetricas — carga estimada e variação de tensão', () => {
  it('leva carga estimada, ΔV e as leituras para os dados da tela', () => {
    const dados = dadosDasMetricas(
      metricas({
        carga_estimada_pct: 72,
        delta_v: 0.8,
        tensao_v: 7.6,
        corrente_a: 0.5,
        potencia_w: 3.8,
      }),
    );
    expect(dados).toMatchObject({
      cargaPct: 72,
      deltaV: 0.8,
      tensaoV: 7.6,
      correnteA: 0.5,
      potenciaW: 3.8,
    });
  });

  it('o tempo oficial de conclusão tem prioridade sobre o decorrido', () => {
    const dados = dadosDasMetricas(
      metricas({ tempo_conclusao_ms: 94500, tempo_decorrido_ms: 120000 }),
    );
    expect(dados.tempoMs).toBe(94500);
  });

  it('sem métricas, não inventa valores', () => {
    expect(dadosDasMetricas(null)).toEqual({});
    expect(dadosDasMetricas(undefined)).toEqual({});
  });
});

describe('energia pelo WebSocket (CT-FE-12 passos 1 a 4)', () => {
  let cliente: ClientePainelWS;
  let ws: WebSocketFalso;

  beforeEach(() => {
    WebSocketFalso.instancias = [];
    vi.stubGlobal('WebSocket', WebSocketFalso);
    cliente = new ClientePainelWS('ws://teste/ws/painel');
    cliente.iniciar();
    ws = WebSocketFalso.instancias[0]!;
    ws.abrir();
    ws.receber(aoVivo({ labirinto: '8x4' }));
  });

  afterEach(() => {
    cliente.parar();
    vi.unstubAllGlobals();
  });

  function mensagemContinua(i: number, deltaV: number | null = null, corrida = CORRIDA): string {
    return JSON.stringify({
      tipo: 'continuo',
      corrida,
      tempo_ms: 1000 + i * 100,
      posicao: null,
      energia: { tensao_v: 8.4 - (0.8 * i) / 5999, corrente_a: 0.5, potencia_w: 4 },
      metricas: metricas({ carga_estimada_pct: 80, delta_v: deltaV }),
    });
  }

  it('6.000 mensagens contínuas viram 6.000 amostras, com carga estimada e ΔV', () => {
    for (let i = 0; i < 6000; i++) ws.receber(mensagemContinua(i, i === 5999 ? 0.8 : null));

    expect(energia()).toHaveLength(6000);
    expect(energia()[0]?.tempoMs).toBe(1000);
    expect(energia().at(-1)?.tempoMs).toBe(600900);
    expect(usePainel.getState().aoVivo.cargaPct).toBe(80);
    expect(usePainel.getState().aoVivo.deltaV).toBe(0.8);
  });

  it('mensagem contínua de outra corrida não entra na série', () => {
    ws.receber(mensagemContinua(0, null, 'outra-corrida'));
    expect(energia()).toEqual([]);
  });
});
