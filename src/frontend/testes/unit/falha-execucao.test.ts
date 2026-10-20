import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientePainelWS } from '../../src/adaptadores/ws';
import { usePainel } from '../../src/estado';
import { mensagemErroDetalhe, rotuloMotivoTermino, tituloFalha } from '../../src/formatacao';
import { descreverFalha } from '../../src/view-model';
import { aoVivo, eventoStatus, sinal } from '../suporte/mensagens';
import { reiniciarStore } from '../suporte/store';
import { WebSocketFalso } from '../suporte/websocket-falso';

const estado = () => usePainel.getState();
const OUTRA = 'a1b2c3d4-0000-4000-8000-000000000002';

beforeEach(reiniciarStore);

describe('descreverFalha (CT-FE-13 passo 2)', () => {
  it('falha com timeout traz título, motivo traduzido e detalhe', () => {
    expect(descreverFalha('FALHOU', 'TIMEOUT', 'Tempo limite de 10 min excedido')).toEqual({
      titulo: 'Execução falhou',
      motivo: 'Tempo limite excedido (TIMEOUT)',
      detalhe: 'Tempo limite de 10 min excedido',
    });
  });

  it('interrupção tem título próprio', () => {
    expect(descreverFalha('INTERROMPIDA', 'SEM_SINAL', null)?.titulo).toBe('Execução interrompida');
  });

  it.each([['EM_ANDAMENTO'], ['CONCLUIDA'], [null]] as const)('status %s não é falha', (status) => {
    expect(descreverFalha(status, 'TIMEOUT', 'x')).toBeNull();
  });

  it.each([[null], [''], ['   ']])('detalhe vazio (%j) não gera linha de detalhe', (detalhe) => {
    expect(descreverFalha('FALHOU', 'ERRO_FIRMWARE', detalhe)?.detalhe).toBeNull();
  });
});

describe('rotuloMotivoTermino', () => {
  it('traduz os motivos conhecidos, sem perder o código recebido', () => {
    expect(rotuloMotivoTermino('TIMEOUT')).toBe('Tempo limite excedido (TIMEOUT)');
    expect(rotuloMotivoTermino('ERRO_FIRMWARE')).toBe('Erro do firmware (ERRO_FIRMWARE)');
    expect(rotuloMotivoTermino('timeout')).toBe('Tempo limite excedido (timeout)');
  });

  it('código desconhecido aparece como veio', () => {
    expect(rotuloMotivoTermino('ERRO_X')).toBe('ERRO_X');
  });

  it('sem motivo, informa que não foi informado', () => {
    expect(rotuloMotivoTermino(null)).toBe('Motivo não informado');
    expect(rotuloMotivoTermino('  ')).toBe('Motivo não informado');
  });

  it('títulos por status', () => {
    expect(tituloFalha('FALHOU')).toBe('Execução falhou');
    expect(tituloFalha('INTERROMPIDA')).toBe('Execução interrompida');
  });
});

describe('mensagemErroDetalhe (CT-FE-11c)', () => {
  it('cada erro tem a sua mensagem', () => {
    expect(mensagemErroDetalhe('NAO_ENCONTRADA')).toBe(
      'Esta execução não existe ou foi removida do histórico.',
    );
    expect(mensagemErroDetalhe('REDE')).toBe(
      'Não foi possível conectar ao servidor para carregar a execução.',
    );
    expect(mensagemErroDetalhe('SERVIDOR')).toBe(
      'O servidor não conseguiu retornar os dados desta execução.',
    );
  });
});

describe('sinal e retomada na store (CT-FE-13b)', () => {
  const acoes = () => estado().acoes;

  it('PERDIDO seguido de OK registra a retomada', () => {
    acoes().definirSinal('PERDIDO');
    expect(estado().alertas.retomadaEm).toBeNull();

    acoes().definirSinal('OK');
    expect(estado().conexao.sinal).toBe('OK');
    expect(estado().alertas.retomadaEm).not.toBeNull();
  });

  it('OK sem perda anterior não inventa uma retomada', () => {
    acoes().definirSinal('OK');
    expect(estado().alertas.retomadaEm).toBeNull();
  });

  it('uma nova perda apaga o aviso de retomada', () => {
    acoes().definirSinal('PERDIDO');
    acoes().definirSinal('OK');
    acoes().definirSinal('PERDIDO');
    expect(estado().alertas.retomadaEm).toBeNull();
  });

  it('uma nova corrida apaga o aviso de retomada', () => {
    acoes().definirSinal('PERDIDO');
    acoes().definirSinal('OK');
    acoes().reiniciarExecucao({ corrida: 'nova' });
    expect(estado().alertas.retomadaEm).toBeNull();
  });
});

describe('falha e sinal pelo WebSocket (CT-FE-13 e CT-FE-13b)', () => {
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

  it('status FALHOU guarda motivo e detalhe recebidos do backend (CT-FE-13 passo 2)', () => {
    ws.receber(
      eventoStatus('FALHOU', {
        motivo_termino: 'FALHA_REPORTADA',
        detalhe: 'Tempo limite de 10 min excedido',
      }),
    );
    expect(estado().aoVivo).toMatchObject({
      status: 'FALHOU',
      motivoTermino: 'FALHA_REPORTADA',
      detalheFalha: 'Tempo limite de 10 min excedido',
    });
  });

  it('PERDIDO marca sem sinal, sem encerrar a execução', () => {
    ws.receber(sinal('PERDIDO'));
    expect(estado().conexao.sinal).toBe('PERDIDO');
    expect(estado().aoVivo.status).toBe('EM_ANDAMENTO');
  });

  it('RETOMADO volta o sinal ao normal e não conclui a execução (CA3)', () => {
    ws.receber(sinal('PERDIDO'));
    ws.receber(sinal('RETOMADO'));

    expect(estado().conexao.sinal).toBe('OK');
    expect(estado().alertas.retomadaEm).not.toBeNull();
    expect(estado().aoVivo.status).toBe('EM_ANDAMENTO');
  });

  it('sinal de outra corrida é ignorado', () => {
    ws.receber(sinal('PERDIDO', OUTRA));
    expect(estado().conexao.sinal).toBe('DESCONHECIDO');
  });

  it('CT-FE-13c: lote tardio conclui uma corrida interrompida, com o tempo do robô', () => {
    ws.receber(eventoStatus('INTERROMPIDA', { motivo_termino: 'SEM_SINAL' }));
    expect(estado().aoVivo.status).toBe('INTERROMPIDA');

    ws.receber(
      eventoStatus('CONCLUIDA', {
        tempo_ms: 95500,
        metricas: {
          tempo_decorrido_ms: null,
          tempo_conclusao_ms: 94500,
          celulas_percorridas: 45,
          distancia_m: 8.1,
          velocidade_media_mps: 0.09,
          tensao_v: null,
          corrente_a: null,
          potencia_w: null,
          carga_estimada_pct: null,
          delta_v: null,
        },
      }),
    );

    expect(estado().aoVivo).toMatchObject({
      status: 'CONCLUIDA',
      motivoTermino: 'SUCESSO',
      detalheFalha: null,
      tempoMs: 94500,
    });
  });
});

describe('pendência conhecida: tempo oficial × cronômetro que nunca diminui', () => {
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

  // HU-FE-08 CA4 pede que o tempo nunca diminua; HU-BE-10 CA2 / RF-81 pede que a conclusão
  // tardia use o tempo do relógio do robô. Quando a interrupção já mostrou um tempo maior, a
  // store mantém o maior. `it.fails` passa enquanto isso acontece e vai falhar no dia em que a
  // regra for corrigida: nesse dia, troque por `it`.
  it.fails('CT-FE-13c: a conclusão tardia substitui o tempo decorrido maior da interrupção', () => {
    ws.receber(
      eventoStatus('INTERROMPIDA', {
        motivo_termino: 'SEM_SINAL',
        metricas: {
          tempo_decorrido_ms: 121000,
          tempo_conclusao_ms: null,
          celulas_percorridas: 20,
          distancia_m: 3.6,
          velocidade_media_mps: null,
          tensao_v: null,
          corrente_a: null,
          potencia_w: null,
          carga_estimada_pct: null,
          delta_v: null,
        },
      }),
    );
    ws.receber(
      eventoStatus('CONCLUIDA', {
        metricas: {
          tempo_decorrido_ms: null,
          tempo_conclusao_ms: 94500,
          celulas_percorridas: 45,
          distancia_m: 8.1,
          velocidade_media_mps: 0.09,
          tensao_v: null,
          corrente_a: null,
          potencia_w: null,
          carga_estimada_pct: null,
          delta_v: null,
        },
      }),
    );

    expect(estado().aoVivo.tempoMs).toBe(94500);
  });
});
