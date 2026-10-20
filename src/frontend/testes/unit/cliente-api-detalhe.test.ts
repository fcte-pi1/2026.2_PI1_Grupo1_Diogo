import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErroConsultaCorrida, obterCorrida } from '../../src/adaptadores/http';
import { LIMITE_AMOSTRAS_ENERGIA } from '../../src/dominio';
import { amostrasEnergia, detalheHttp, ID_DETALHE } from '../suporte/detalhe';

afterEach(() => vi.unstubAllGlobals());

function resposta(corpo: unknown, extra: { ok?: boolean; status?: number } = {}) {
  return { ok: true, status: 200, json: async () => corpo, ...extra };
}

function simularFetch(valor: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(valor);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('obterCorrida — sucesso (CT-FE-11 passos 1 e 2)', () => {
  it('consulta GET /api/corridas/:id e converte o detalhe para os dados da tela', async () => {
    const fetchMock = simularFetch(resposta(detalheHttp({ energia: amostrasEnergia(3) })));

    const { dados, iniciadaEm } = await obterCorrida(ID_DETALHE);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/corridas/${ID_DETALHE}`);
    expect(iniciadaEm).toBe('2026-10-17T14:30:05.000Z');
    expect(dados).toMatchObject({
      corrida: ID_DETALHE,
      tipoLabirinto: '8x4',
      tipoInvalido: false,
      status: 'CONCLUIDA',
      motivoTermino: 'SUCESSO',
      tempoMs: 94500,
      celulasPercorridas: 45,
      distanciaM: 8.1,
      velocidadeMediaMps: 0.09,
      cargaPct: 72,
      deltaV: 0.4,
    });
    expect(dados.mapa).toHaveLength(1);
    expect(dados.energia).toHaveLength(3);
    expect(dados.energia[0]).toEqual({
      seq: null,
      tempoMs: 1000,
      tensaoV: 8.4,
      correnteA: 0.5,
      potenciaW: 4,
      cargaPct: 100,
    });
  });

  it('ordena o trajeto por sequência, mesmo que o backend o devolva fora de ordem', async () => {
    simularFetch(resposta(detalheHttp()));
    const { dados } = await obterCorrida(ID_DETALHE);
    expect(dados.trajeto).toEqual([
      { seq: 1, x: 0, y: 3 },
      { seq: 2, x: 0, y: 2 },
    ]);
  });

  it('codifica o id na URL', async () => {
    const fetchMock = simularFetch(resposta(detalheHttp()));
    await obterCorrida('a/b c');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/corridas/a%2Fb%20c');
  });

  it('sem métricas, usa a última amostra de energia como valor final', async () => {
    simularFetch(resposta(detalheHttp({ metricas: null, energia: amostrasEnergia(3) })));
    const { dados } = await obterCorrida(ID_DETALHE);
    expect(dados.tensaoV).toBeCloseTo(7.6);
    expect(dados.cargaPct).toBe(100);
    expect(dados.tempoMs).toBeNull();
  });

  it('tipo de labirinto fora de 4x4, 8x4 e 12x4 marca a configuração como inválida', async () => {
    simularFetch(resposta(detalheHttp({ tipo_labirinto: '5x5' })));
    const { dados } = await obterCorrida(ID_DETALHE);
    expect(dados.tipoLabirinto).toBeNull();
    expect(dados.tipoInvalido).toBe(true);
  });

  it('mantém a falha gravada: status, motivo e detalhe', async () => {
    simularFetch(
      resposta(
        detalheHttp({
          status: 'FALHOU',
          motivo_termino: 'TIMEOUT',
          detalhe: 'Tempo limite de 10 min excedido',
        }),
      ),
    );
    const { dados } = await obterCorrida(ID_DETALHE);
    expect(dados).toMatchObject({
      status: 'FALHOU',
      motivoTermino: 'TIMEOUT',
      detalheFalha: 'Tempo limite de 10 min excedido',
    });
  });
});

describe('obterCorrida — falhas (CT-FE-11 passo 4)', () => {
  it('404 vira NAO_ENCONTRADA', async () => {
    simularFetch(resposta({}, { ok: false, status: 404 }));
    const falha = obterCorrida('00000000-0000-0000-0000-000000000000');
    await expect(falha).rejects.toBeInstanceOf(ErroConsultaCorrida);
    await expect(falha).rejects.toMatchObject({ tipo: 'NAO_ENCONTRADA' });
  });

  it('HTTP de erro vira SERVIDOR', async () => {
    simularFetch(resposta({}, { ok: false, status: 500 }));
    await expect(obterCorrida(ID_DETALHE)).rejects.toMatchObject({ tipo: 'SERVIDOR' });
  });

  it('sem resposta do servidor vira REDE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(obterCorrida(ID_DETALHE)).rejects.toMatchObject({ tipo: 'REDE' });
  });

  it.each([
    ['corpo nulo', null],
    ['sem id', { ...detalheHttp(), id: undefined }],
    ['sem iniciada_em', { ...detalheHttp(), iniciada_em: undefined }],
    ['status desconhecido', { ...detalheHttp(), status: 'PAUSADA' }],
  ])('resposta inválida (%s) vira SERVIDOR', async (_nome, corpo) => {
    simularFetch(resposta(corpo));
    await expect(obterCorrida(ID_DETALHE)).rejects.toMatchObject({ tipo: 'SERVIDOR' });
  });

  it('JSON ilegível vira SERVIDOR', async () => {
    simularFetch({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });
    await expect(obterCorrida(ID_DETALHE)).rejects.toMatchObject({ tipo: 'SERVIDOR' });
  });

  it('consulta cancelada propaga o cancelamento, sem virar erro da tela', async () => {
    const controle = new AbortController();
    controle.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('cancelada', 'AbortError')));

    const falha = obterCorrida(ID_DETALHE, controle.signal);

    await expect(falha).rejects.toMatchObject({ name: 'AbortError' });
    await expect(falha).rejects.not.toBeInstanceOf(ErroConsultaCorrida);
  });
});

describe('obterCorrida — série de energia (CT-FE-12 passo 3)', () => {
  it('mantém as 6.000 amostras de 10 min a 10 Hz sem perda', async () => {
    simularFetch(resposta(detalheHttp({ energia: amostrasEnergia(6000) })));
    const { dados } = await obterCorrida(ID_DETALHE);
    expect(dados.energia).toHaveLength(6000);
    expect(dados.energia[0]?.tempoMs).toBe(1000);
    expect(dados.energia.at(-1)?.tempoMs).toBe(600900);
  });

  it('acima do teto de segurança, mantém as amostras mais recentes', async () => {
    const total = LIMITE_AMOSTRAS_ENERGIA + 50;
    simularFetch(resposta(detalheHttp({ energia: amostrasEnergia(total) })));
    const { dados } = await obterCorrida(ID_DETALHE);
    expect(dados.energia).toHaveLength(LIMITE_AMOSTRAS_ENERGIA);
    expect(dados.energia[0]?.tempoMs).toBe(1000 + 50 * 100);
  });
});
