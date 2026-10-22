import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientePainelWS } from '../../src/adaptadores/ws';
import { execucaoInicial } from '../../src/dominio';
import type { ResultadoDetalhe } from '../../src/estado';
import { usePainel } from '../../src/estado';
import { aoVivo, continuo, eventoCelula, eventoStatus, sinal } from '../suporte/mensagens';
import { reiniciarStore } from '../suporte/store';
import { WebSocketFalso } from '../suporte/websocket-falso';

const acoes = () => usePainel.getState().acoes;
const detalhe = () => usePainel.getState().detalhe;
const estado = () => usePainel.getState();

const A = 'a0000000-0000-4000-8000-00000000000a';
const B = 'b0000000-0000-4000-8000-00000000000b';
const OUTRA = 'a1b2c3d4-0000-4000-8000-000000000002';

function resultado(corrida: string): ResultadoDetalhe {
  return {
    dados: {
      ...execucaoInicial,
      corrida,
      tipoLabirinto: '8x4',
      status: 'CONCLUIDA',
      tempoMs: 94500,
      celulasPercorridas: 45,
      trajeto: [{ seq: 1, x: 0, y: 3 }],
    },
    iniciadaEm: '2026-10-17T14:30:05.000Z',
  };
}

beforeEach(reiniciarStore);

describe('fatia detalhe (CT-FE-11)', () => {
  it('iniciarDetalhe descarta a execução anterior e fica carregando', () => {
    acoes().iniciarDetalhe(A);
    acoes().receberDetalhe(A, resultado(A));

    acoes().iniciarDetalhe(B);

    expect(detalhe()).toMatchObject({ corrida: B, situacao: 'carregando', erro: null });
    expect(detalhe().dados).toEqual(execucaoInicial);
    expect(detalhe().iniciadaEm).toBeNull();
  });

  it('receberDetalhe grava os dados da execução pedida', () => {
    acoes().iniciarDetalhe(A);
    acoes().receberDetalhe(A, resultado(A));

    expect(detalhe()).toMatchObject({
      corrida: A,
      situacao: 'pronto',
      erro: null,
      iniciadaEm: '2026-10-17T14:30:05.000Z',
    });
    expect(detalhe().dados.tempoMs).toBe(94500);
  });

  it('resposta atrasada de outra execução é ignorada', () => {
    acoes().iniciarDetalhe(A);
    acoes().iniciarDetalhe(B);

    acoes().receberDetalhe(A, resultado(A));

    expect(detalhe()).toMatchObject({ corrida: B, situacao: 'carregando' });
    expect(detalhe().dados).toEqual(execucaoInicial);
  });

  it('falharDetalhe marca o erro da execução pedida, sem dados antigos', () => {
    acoes().iniciarDetalhe(A);
    acoes().receberDetalhe(A, resultado(A));
    acoes().iniciarDetalhe(B);

    acoes().falharDetalhe(B, 'NAO_ENCONTRADA');

    expect(detalhe()).toMatchObject({ corrida: B, situacao: 'erro', erro: 'NAO_ENCONTRADA' });
    expect(detalhe().dados).toEqual(execucaoInicial);
  });

  it('falha atrasada de outra execução é ignorada', () => {
    acoes().iniciarDetalhe(A);
    acoes().iniciarDetalhe(B);

    acoes().falharDetalhe(A, 'REDE');

    expect(detalhe()).toMatchObject({ corrida: B, situacao: 'carregando', erro: null });
  });

  it('reiniciarDetalhe esvazia a fatia', () => {
    acoes().iniciarDetalhe(A);
    acoes().receberDetalhe(A, resultado(A));

    acoes().reiniciarDetalhe();

    expect(detalhe().corrida).toBeNull();
    expect(detalhe().dados).toEqual(execucaoInicial);
  });
});

describe('isolamento do modo histórico (CT-FE-11 passo 3)', () => {
  let cliente: ClientePainelWS;
  let ws: WebSocketFalso;

  beforeEach(() => {
    WebSocketFalso.instancias = [];
    vi.stubGlobal('WebSocket', WebSocketFalso);
    cliente = new ClientePainelWS('ws://teste/ws/painel');
    cliente.iniciar();
    ws = WebSocketFalso.instancias[0]!;
    ws.abrir();
  });

  afterEach(() => {
    cliente.parar();
    vi.unstubAllGlobals();
  });

  it('mensagens do WebSocket mudam o ao vivo, mas não a execução aberta', () => {
    acoes().iniciarDetalhe(A);
    acoes().receberDetalhe(A, resultado(A));
    const antes = detalhe();

    ws.receber(aoVivo({ corrida: OUTRA, labirinto: '4x4' }));
    ws.receber(eventoCelula(1, 0, 3, { corrida: OUTRA }));
    ws.receber(continuo({ corrida: OUTRA }));
    ws.receber(sinal('PERDIDO', OUTRA));
    ws.receber(eventoStatus('FALHOU', { corrida: OUTRA, motivo_termino: 'FALHA_REPORTADA' }));

    expect(estado().aoVivo.corrida).toBe(OUTRA);
    expect(estado().aoVivo.status).toBe('FALHOU');
    expect(detalhe()).toBe(antes);
  });

  it('as ações do ao vivo também não tocam na fatia detalhe', () => {
    acoes().iniciarDetalhe(A);
    acoes().receberDetalhe(A, resultado(A));
    const antes = detalhe();

    acoes().reiniciarExecucao({ corrida: OUTRA });
    acoes().atualizarExecucao({ status: 'EM_ANDAMENTO', tempoMs: 1 });
    acoes().adicionarPontoTrajeto({ seq: 1, x: 0, y: 0 });
    acoes().adicionarAmostraEnergia({
      seq: null,
      tempoMs: 1,
      tensaoV: 8,
      correnteA: 1,
      potenciaW: 8,
      cargaPct: 90,
    });
    acoes().definirSinal('PERDIDO');

    expect(detalhe()).toBe(antes);
  });
});
