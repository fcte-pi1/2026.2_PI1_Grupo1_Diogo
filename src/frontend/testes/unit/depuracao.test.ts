import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientePainelWS } from '../../src/adaptadores/ws';
import { lerDepuracao, QUANTIDADE_SENSORES_TOF } from '../../src/dominio';
import type { LeituraDepuracao } from '../../src/dominio';
import { usePainel } from '../../src/estado';
import { formatarAngulo, formatarContagem, formatarDistanciaMm } from '../../src/formatacao';
import { aoVivo, CORRIDA, metricas } from '../suporte/mensagens';
import { reiniciarStore } from '../suporte/store';
import { WebSocketFalso } from '../suporte/websocket-falso';

const estado = () => usePainel.getState();

const LEITURA: LeituraDepuracao = {
  tof: [120, 85, 300, 45, 210, 60, 150],
  anguloMpuGraus: 12.5,
  encoderEsquerdo: 1500,
  encoderDireito: 1498,
  tempoMs: 12100,
};

const BRUTO = {
  tof_mm: [120, 85, 300, 45, 210, 60, 150],
  mpu_angulo_graus: 12.5,
  encoder_esquerdo: 1500,
  encoder_direito: 1498,
};

beforeEach(reiniciarStore);

describe('lerDepuracao (CT-FE-14 passos 2 e 4)', () => {
  it('lê os sete ToF, o ângulo do MPU-6050 e os encoders', () => {
    expect(QUANTIDADE_SENSORES_TOF).toBe(7);
    expect(lerDepuracao(BRUTO, 12100)).toEqual(LEITURA);
  });

  it.each([[undefined], [null], ['texto'], [42]])(
    'sem bloco de depuração (%j) devolve null',
    (bruto) => {
      expect(lerDepuracao(bruto)).toBeNull();
    },
  );

  it('valores ausentes ou inválidos viram null, nunca zero (CA4)', () => {
    const leitura = lerDepuracao({
      tof_mm: [120, 'x', -5, Number.NaN, null],
      mpu_angulo_graus: 'a',
      encoder_esquerdo: 10,
      encoder_direito: 1.5,
    });
    expect(leitura?.tof).toEqual([120, null, null, null, null, null, null]);
    expect(leitura?.anguloMpuGraus).toBeNull();
    expect(leitura?.encoderEsquerdo).toBe(10);
    expect(leitura?.encoderDireito).toBeNull();
    expect(leitura?.tempoMs).toBeNull();
  });

  it('zero é uma leitura válida e não vira "indisponível"', () => {
    const leitura = lerDepuracao({ ...BRUTO, tof_mm: [0, 0, 0, 0, 0, 0, 0], mpu_angulo_graus: 0 });
    expect(leitura?.tof).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(leitura?.anguloMpuGraus).toBe(0);
  });

  it('lista de ToF ausente ou curta completa com null até sete posições', () => {
    expect(lerDepuracao({})?.tof).toEqual(Array(7).fill(null));
    expect(lerDepuracao({ tof_mm: [10, 20] })?.tof).toEqual([10, 20, null, null, null, null, null]);
  });

  it('encoder pode ser negativo (marcha à ré)', () => {
    expect(lerDepuracao({ encoder_esquerdo: -20 })?.encoderEsquerdo).toBe(-20);
  });
});

describe('formatação da depuração', () => {
  it('distância em mm, ângulo em graus e contagem com separador de milhar', () => {
    expect(formatarDistanciaMm(120)).toBe('120 mm');
    expect(formatarDistanciaMm(0)).toBe('0 mm');
    expect(formatarAngulo(12.5)).toBe('12,5°');
    expect(formatarContagem(1500)).toBe('1.500');
  });

  it('valor indisponível aparece como "—"', () => {
    expect(formatarDistanciaMm(null)).toBe('—');
    expect(formatarAngulo(null)).toBe('—');
    expect(formatarContagem(null)).toBe('—');
  });
});

describe('fatia depuracao na store (CT-FE-14 passo 3)', () => {
  const acoes = () => estado().acoes;

  it('nasce vazia', () => {
    expect(estado().depuracao).toBeNull();
  });

  it('atualizar a leitura não toca no histórico da tentativa', () => {
    acoes().reiniciarExecucao({ corrida: CORRIDA });
    acoes().adicionarPontoTrajeto({ seq: 1, x: 0, y: 3 });
    acoes().adicionarAmostraEnergia({
      seq: null,
      tempoMs: 1,
      tensaoV: 8,
      correnteA: 1,
      potenciaW: 8,
      cargaPct: 90,
    });
    const antes = estado().aoVivo;

    acoes().atualizarDepuracao(LEITURA);
    acoes().atualizarDepuracao({ ...LEITURA, tof: [1, 2, 3, 4, 5, 6, 7] });

    expect(estado().aoVivo).toBe(antes);
    expect(estado().aoVivo.energia).toHaveLength(1);
    expect(estado().depuracao?.tof).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('uma nova corrida zera a leitura anterior', () => {
    acoes().atualizarDepuracao(LEITURA);
    acoes().reiniciarExecucao({ corrida: 'nova' });
    expect(estado().depuracao).toBeNull();
  });
});

describe('depuração pelo WebSocket', () => {
  let cliente: ClientePainelWS;
  let ws: WebSocketFalso;

  beforeEach(() => {
    WebSocketFalso.instancias = [];
    vi.stubGlobal('WebSocket', WebSocketFalso);
    cliente = new ClientePainelWS('ws://teste/ws/painel');
    cliente.iniciar();
    ws = WebSocketFalso.instancias[0]!;
    ws.abrir();
    ws.receber(aoVivo());
  });

  afterEach(() => {
    cliente.parar();
    vi.unstubAllGlobals();
  });

  function continuoComDepuracao(depuracao?: unknown, corrida = CORRIDA): string {
    return JSON.stringify({
      tipo: 'continuo',
      corrida,
      tempo_ms: 12100,
      posicao: null,
      energia: { tensao_v: 7.9, corrente_a: 0.5, potencia_w: 3.95 },
      metricas: metricas(),
      ...(depuracao === undefined ? {} : { depuracao }),
    });
  }

  it('o bloco de depuração de uma mensagem contínua atualiza a leitura e a energia', () => {
    ws.receber(continuoComDepuracao(BRUTO));

    expect(estado().depuracao).toEqual(LEITURA);
    expect(estado().aoVivo.energia).toHaveLength(1);
  });

  it('mensagem contínua sem bloco de depuração mantém a última leitura', () => {
    ws.receber(continuoComDepuracao(BRUTO));
    ws.receber(continuoComDepuracao());

    expect(estado().depuracao).toEqual(LEITURA);
    expect(estado().aoVivo.energia).toHaveLength(2);
  });

  it('nova leitura substitui os valores sem apagar a série de energia', () => {
    ws.receber(continuoComDepuracao(BRUTO));
    ws.receber(continuoComDepuracao({ ...BRUTO, tof_mm: [1, 2, 3, 4, 5, 6, 7] }));

    expect(estado().depuracao?.tof).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(estado().aoVivo.energia).toHaveLength(2);
  });

  it('dados ausentes e inválidos chegam como indisponíveis', () => {
    ws.receber(continuoComDepuracao({ tof_mm: [100, 'x'], mpu_angulo_graus: null }));

    expect(estado().depuracao?.tof).toEqual([100, null, null, null, null, null, null]);
    expect(estado().depuracao?.anguloMpuGraus).toBeNull();
  });

  it('leitura de outra corrida é ignorada', () => {
    ws.receber(continuoComDepuracao(BRUTO, 'outra-corrida'));
    expect(estado().depuracao).toBeNull();
  });
});
