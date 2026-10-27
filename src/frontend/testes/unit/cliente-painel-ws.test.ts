import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientePainelWS } from '../../src/adaptadores/ws';
import { usePainel } from '../../src/estado';
import { rotuloConexao } from '../../src/formatacao';
import {
  aoVivo,
  celulaMapa,
  continuo,
  CORRIDA,
  eventoCelula,
  eventoStatus,
  keepalive,
  metricas,
  sinal,
  snapshot,
} from '../suporte/mensagens';
import { reiniciarStore } from '../suporte/store';
import { WebSocketFalso } from '../suporte/websocket-falso';

const estado = () => usePainel.getState();
const OUTRA = 'a1b2c3d4-0000-4000-8000-000000000002';

let cliente: ClientePainelWS;
let ws: WebSocketFalso;

beforeEach(() => {
  reiniciarStore();
  WebSocketFalso.instancias = [];
  vi.stubGlobal('WebSocket', WebSocketFalso);
  cliente = new ClientePainelWS('ws://teste/ws/painel');
  cliente.iniciar();
  ws = WebSocketFalso.instancias[0]!;
  ws.abrir();
});

afterEach(() => {
  cliente.parar();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('inscrição (HU-FE-04 a 07 dependem dela)', () => {
  it('ao abrir, inscreve-se só no canal ao_vivo', () => {
    expect(estado().conexao.estado).toBe('CONECTADO');
    expect(ws.enviadas).toEqual([{ tipo: 'inscrever', canal: 'ao_vivo' }]);
  });

  it('ao_vivo EM_ANDAMENTO inscreve o painel na corrida e já mostra o tipo do labirinto', () => {
    ws.receber(aoVivo({ labirinto: '8x4' }));

    expect(ws.enviadas).toContainEqual({ tipo: 'inscrever', corrida: CORRIDA });
    expect(estado().aoVivo.corrida).toBe(CORRIDA);
    expect(estado().aoVivo.tipoLabirinto).toBe('8x4');
    expect(estado().aoVivo.status).toBe('EM_ANDAMENTO');
  });

  it('ao_vivo repetido da mesma corrida não inscreve de novo nem apaga o que já chegou', () => {
    ws.receber(aoVivo());
    ws.receber(eventoCelula(3, 0, 3));
    ws.receber(aoVivo());

    expect(ws.enviadas.filter((m) => 'corrida' in m && m.tipo === 'inscrever')).toHaveLength(1);
    expect(estado().aoVivo.trajeto).toHaveLength(1);
  });

  it('ao_vivo de corrida já encerrada não inscreve o painel', () => {
    ws.receber(aoVivo({ status: 'CONCLUIDA' }));
    expect(ws.enviadas).toEqual([{ tipo: 'inscrever', canal: 'ao_vivo' }]);
  });

  it('ao_vivo EM_ANDAMENTO atrasado não reabre a corrida concluída', () => {
    ws.receber(aoVivo());
    ws.receber(eventoStatus('CONCLUIDA'));
    ws.receber(aoVivo());
    expect(estado().aoVivo.status).toBe('CONCLUIDA');
  });

  it('quando a corrida muda, cancela a anterior, inscreve na nova e reinicia o estado', () => {
    ws.receber(aoVivo({ labirinto: '4x4' }));
    ws.receber(eventoCelula(3, 0, 3));
    ws.receber(eventoStatus('CONCLUIDA', { metricas: metricas({ tempo_conclusao_ms: 95500 }) }));

    ws.receber(aoVivo({ corrida: OUTRA, labirinto: '12x4' }));

    expect(ws.enviadas).toContainEqual({ tipo: 'cancelar', corrida: CORRIDA });
    expect(ws.enviadas).toContainEqual({ tipo: 'inscrever', corrida: OUTRA });
    expect(estado().aoVivo).toMatchObject({
      corrida: OUTRA,
      tipoLabirinto: '12x4',
      status: 'EM_ANDAMENTO',
      tempoMs: null,
      celulasPercorridas: null,
      trajeto: [],
      mapa: [],
    });
  });

  it('mensagens de outra corrida são ignoradas', () => {
    ws.receber(aoVivo());
    ws.receber(eventoCelula(3, 0, 3, { corrida: OUTRA }));
    ws.receber(sinal('PERDIDO', OUTRA));
    ws.receber(eventoStatus('FALHOU', { corrida: OUTRA }));

    expect(estado().aoVivo.trajeto).toEqual([]);
    expect(estado().conexao.sinal).toBe('DESCONHECIDO');
    expect(estado().aoVivo.status).toBe('EM_ANDAMENTO');
  });
});

describe('snapshot', () => {
  beforeEach(() => ws.receber(aoVivo()));

  it('aplica tipo, mapa (lista de células), posição, velocidade, carga e tempo', () => {
    ws.receber(
      snapshot({
        labirinto: '8x4',
        mapa: [celulaMapa(0, 3, { sul: true }), celulaMapa(0, 2)],
        posicao: { x: 0, y: 2, orientacao: 'NORTE' },
        metricas: metricas({
          tempo_decorrido_ms: 4200,
          celulas_percorridas: 2,
          velocidade_media_mps: 0.31,
          carga_estimada_pct: 87,
        }),
      }),
    );

    expect(estado().aoVivo).toMatchObject({
      tipoLabirinto: '8x4',
      posicao: { x: 0, y: 2, orientacao: 'NORTE' },
      celulasPercorridas: 2,
      velocidadeMediaMps: 0.31,
      cargaPct: 87,
      tempoMs: 4200,
      status: 'EM_ANDAMENTO',
    });
    expect(estado().aoVivo.mapa).toHaveLength(2);
  });

  it('substitui o mapa anterior (reconexão), sem mesclar', () => {
    ws.receber(snapshot({ mapa: [celulaMapa(0, 3), celulaMapa(0, 2)] }));
    ws.receber(snapshot({ mapa: [celulaMapa(1, 1)] }));
    expect(estado().aoVivo.mapa).toEqual([celulaMapa(1, 1)]);
  });

  it('snapshot de corrida não acompanhada é ignorado', () => {
    ws.receber(snapshot({ corrida: OUTRA, labirinto: '12x4' }));
    expect(estado().aoVivo.corrida).toBe(CORRIDA);
    expect(estado().aoVivo.tipoLabirinto).toBe('4x4');
  });

  it('tipo de labirinto inválido: nenhuma grade e configuração inválida (HU-FE-06 CA3)', () => {
    ws.receber(JSON.stringify({ ...snapshot(), labirinto: '16x4' }));
    expect(estado().aoVivo.tipoLabirinto).toBeNull();
    expect(estado().aoVivo.tipoInvalido).toBe(true);
  });
});

describe('evento de célula (HU-FE-04 CA3, HU-FE-05)', () => {
  beforeEach(() => ws.receber(aoVivo()));

  it('gera 1 ponto no trajeto e 1 célula no mapa, com as métricas do backend', () => {
    ws.receber(
      eventoCelula(3, 0, 3, {
        paredes: { norte: false, leste: true, sul: true, oeste: true },
        metricas: metricas({ celulas_percorridas: 1, tempo_decorrido_ms: 10 }),
      }),
    );

    expect(estado().aoVivo.trajeto).toEqual([{ seq: 3, x: 0, y: 3 }]);
    expect(estado().aoVivo.mapa).toEqual([
      celulaMapa(0, 3, { norte: false, leste: true, sul: true, oeste: true }),
    ]);
    expect(estado().aoVivo.celulasPercorridas).toBe(1);
  });

  it('usa a sequência do backend: chegada 1, 3, 2 vira trajeto 1, 2, 3', () => {
    ws.receber(eventoCelula(1, 0, 3));
    ws.receber(eventoCelula(3, 0, 1));
    ws.receber(eventoCelula(2, 0, 2));
    expect(estado().aoVivo.trajeto.map((p) => p.seq)).toEqual([1, 2, 3]);
  });

  it('revisita acrescenta a passagem e atualiza a célula, sem duplicá-la no mapa', () => {
    ws.receber(eventoCelula(1, 0, 3));
    ws.receber(eventoCelula(2, 0, 2));
    ws.receber(eventoCelula(5, 0, 3, { revisita: true }));
    expect(estado().aoVivo.trajeto.map((p) => p.seq)).toEqual([1, 2, 5]);
    expect(estado().aoVivo.mapa).toHaveLength(2);
  });

  it('evento repetido não duplica o ponto', () => {
    ws.receber(eventoCelula(3, 0, 3));
    ws.receber(eventoCelula(3, 0, 3));
    expect(estado().aoVivo.trajeto).toHaveLength(1);
  });
});

describe('contínuo', () => {
  beforeEach(() => ws.receber(aoVivo()));

  it('atualiza energia, velocidade, carga, posição e tempo', () => {
    ws.receber(
      continuo({
        posicao: { x: 0, y: 2, orientacao: 'LESTE' },
        energia: { tensao_v: 8.12, corrente_a: 0.41, potencia_w: 3.33 },
        metricas: metricas({
          tempo_decorrido_ms: 1350,
          velocidade_media_mps: 0.28,
          carga_estimada_pct: 91,
        }),
      }),
    );

    expect(estado().aoVivo).toMatchObject({
      tensaoV: 8.12,
      correnteA: 0.41,
      potenciaW: 3.33,
      cargaPct: 91,
      velocidadeMediaMps: 0.28,
      tempoMs: 1350,
      posicao: { x: 0, y: 2, orientacao: 'LESTE' },
    });
    expect(estado().aoVivo.energia).toHaveLength(1);
  });

  it('contínuo sem energia nem posição não apaga a posição anterior', () => {
    ws.receber(continuo({ posicao: { x: 1, y: 1, orientacao: 'SUL' } }));
    ws.receber(continuo({ posicao: null, energia: null }));
    expect(estado().aoVivo.posicao).toEqual({ x: 1, y: 1, orientacao: 'SUL' });
  });
});

describe('sinal', () => {
  beforeEach(() => ws.receber(aoVivo()));

  it('PERDIDO mostra "Sem sinal do robô" e RETOMADO volta a "Conectado"', () => {
    ws.receber(sinal('PERDIDO'));
    expect(rotuloConexao(estado().conexao.estado, estado().conexao.sinal)).toBe(
      'Sem sinal do robô',
    );

    ws.receber(sinal('RETOMADO'));
    expect(rotuloConexao(estado().conexao.estado, estado().conexao.sinal)).toBe('Conectado');
  });
});

describe('evento de status (HU-FE-07)', () => {
  beforeEach(() => ws.receber(aoVivo()));

  it('CONCLUIDA traz o status e o tempo de conclusão oficial', () => {
    ws.receber(eventoStatus('CONCLUIDA', { metricas: metricas({ tempo_conclusao_ms: 83500 }) }));
    expect(estado().aoVivo.status).toBe('CONCLUIDA');
    expect(estado().aoVivo.tempoMs).toBe(83500);
  });

  it('falha usa o tempo decorrido, sem inventar tempo de conclusão', () => {
    ws.receber(eventoStatus('FALHOU', { metricas: metricas({ tempo_decorrido_ms: 40100 }) }));
    expect(estado().aoVivo.status).toBe('FALHOU');
    expect(estado().aoVivo.tempoMs).toBe(40100);
  });

  it('o status concluído não é desfeito por contínuo ou sinal posteriores', () => {
    ws.receber(eventoStatus('CONCLUIDA'));
    ws.receber(continuo({ metricas: metricas({ tempo_decorrido_ms: 90000 }) }));
    ws.receber(sinal('PERDIDO'));
    expect(estado().aoVivo.status).toBe('CONCLUIDA');
  });
});

describe('keepalive e mensagens inválidas', () => {
  it('keepalive não conta como mensagem recebida', () => {
    ws.receber(keepalive);
    expect(estado().telemetria).toEqual({ mensagensRecebidas: 0, ultimaMensagemEm: null });
  });

  it('mensagens do contrato contam', () => {
    ws.receber(aoVivo());
    ws.receber(keepalive);
    expect(estado().telemetria.mensagensRecebidas).toBe(1);
  });

  it('JSON inválido e tipo desconhecido são descartados sem derrubar o cliente', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    ws.receber('{não é json');
    ws.receber('{"tipo":"inventado"}');
    ws.receber('42');
    expect(aviso).toHaveBeenCalledTimes(3);
    expect(estado().telemetria.mensagensRecebidas).toBe(0);
  });
});

describe('reconexão', () => {
  it('após a queda no meio da corrida, volta a se inscrever no canal e na corrida (RF-89)', () => {
    vi.useFakeTimers();
    ws.receber(aoVivo());

    ws.close();
    expect(estado().conexao.estado).toBe('RECONECTANDO');
    vi.advanceTimersByTime(250);

    const novo = WebSocketFalso.instancias[1]!;
    novo.abrir();
    expect(novo.enviadas).toEqual([
      { tipo: 'inscrever', canal: 'ao_vivo' },
      { tipo: 'inscrever', corrida: CORRIDA },
    ]);
  });
});
