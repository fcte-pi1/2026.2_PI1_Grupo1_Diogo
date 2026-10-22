import type { DetalheCorrida, MetricasCorrida } from '@protocolo';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErroConsultaCorrida, obterCorrida } from '../../src/adaptadores/http';
import { dadosDasMetricasCorrida } from '../../src/adaptadores/metricas';
import { LIMITE_AMOSTRAS_ENERGIA } from '../../src/dominio';
import {
  amostrasEnergia,
  detalheHttp,
  ID_DETALHE,
  metricasCorrida,
  passagem,
} from '../suporte/detalhe';

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
      detalheFalha: null,
      tempoMs: 94500,
      celulasPercorridas: 45,
      distanciaM: 8.1,
      velocidadeMediaMps: 0.09,
      tensaoV: 7.9,
      cargaPct: 72,
      deltaV: 0.4,
    });
    expect(dados.energia).toHaveLength(3);
    expect(dados.energia[0]).toEqual({
      seq: null,
      tempoMs: 1000,
      tensaoV: 8.4,
      correnteA: 0.5,
      potenciaW: 4,
      cargaPct: null,
    });
  });

  it('tensão e carga vêm das métricas finais; corrente e potência, da última amostra', async () => {
    simularFetch(resposta(detalheHttp({ energia: amostrasEnergia(3) })));
    const { dados } = await obterCorrida(ID_DETALHE);
    expect(dados.tensaoV).toBe(7.9);
    expect(dados.cargaPct).toBe(72);
    expect(dados.correnteA).toBe(0.5);
    expect(dados.potenciaW).toBe(4);
  });

  it('ordena o trajeto pela sequência, mesmo que o backend o devolva fora de ordem', async () => {
    simularFetch(resposta(detalheHttp()));
    const { dados } = await obterCorrida(ID_DETALHE);
    expect(dados.trajeto).toEqual([
      { seq: 1, x: 0, y: 3 },
      { seq: 2, x: 0, y: 2 },
    ]);
  });

  it('usa a sequência da mensagem, não a ordem no trajeto, como `seq` (igual ao ao vivo)', async () => {
    simularFetch(
      resposta(
        detalheHttp({
          trajeto: [
            passagem(2, 0, 3, {}, { ordem: 1 }),
            passagem(4, 0, 2, {}, { ordem: 2 }),
            passagem(5, 0, 3, {}, { ordem: 3, revisita: true }),
          ],
        }),
      ),
    );
    const { dados } = await obterCorrida(ID_DETALHE);
    expect(dados.trajeto.map((p) => p.seq)).toEqual([2, 4, 5]);
  });

  it('codifica o id na URL', async () => {
    const fetchMock = simularFetch(resposta(detalheHttp()));
    await obterCorrida('a/b c');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/corridas/a%2Fb%20c');
  });

  it('sem métricas, usa a última amostra de energia e deixa a carga em branco', async () => {
    const semMetricas = null as unknown as DetalheCorrida['metricas'];
    simularFetch(resposta(detalheHttp({ metricas: semMetricas, energia: amostrasEnergia(3) })));
    const { dados } = await obterCorrida(ID_DETALHE);
    expect(dados.tensaoV).toBeCloseTo(7.6);
    expect(dados.correnteA).toBe(0.5);
    expect(dados.cargaPct).toBeNull();
    expect(dados.tempoMs).toBeNull();
  });

  it('tipo de labirinto fora de 4x4, 8x4 e 12x4 marca a configuração como inválida', async () => {
    const tipoInvalido = '5x5' as unknown as DetalheCorrida['tipo_labirinto'];
    simularFetch(resposta(detalheHttp({ tipo_labirinto: tipoInvalido })));
    const { dados } = await obterCorrida(ID_DETALHE);
    expect(dados.tipoLabirinto).toBeNull();
    expect(dados.tipoInvalido).toBe(true);
  });
});

describe('obterCorrida — mapa e falha gravados (contrato do backend)', () => {
  it('o mapa sai das passagens: cada célula traz as paredes da passagem', async () => {
    simularFetch(resposta(detalheHttp()));
    const { dados } = await obterCorrida(ID_DETALHE);

    expect(dados.mapa).toHaveLength(2);
    expect(dados.mapa).toContainEqual({
      x: 0,
      y: 3,
      paredes: { norte: false, leste: false, sul: true, oeste: true },
    });
    expect(dados.mapa).toContainEqual({
      x: 0,
      y: 2,
      paredes: { norte: false, leste: true, sul: false, oeste: false },
    });
  });

  it('numa revisita vale a última passagem da célula', async () => {
    simularFetch(
      resposta(
        detalheHttp({
          trajeto: [
            passagem(3, 0, 3, { oeste: true, norte: true }, { revisita: true }),
            passagem(1, 0, 3, { oeste: true }),
            passagem(2, 0, 2),
          ],
        }),
      ),
    );
    const { dados } = await obterCorrida(ID_DETALHE);

    expect(dados.trajeto.map((p) => p.seq)).toEqual([1, 2, 3]);
    expect(dados.mapa).toHaveLength(2);
    expect(dados.mapa.find((c) => c.x === 0 && c.y === 3)?.paredes).toEqual({
      norte: true,
      leste: false,
      sul: false,
      oeste: true,
    });
  });

  it('sem passagens, o mapa fica vazio', async () => {
    simularFetch(resposta(detalheHttp({ trajeto: [] })));
    const { dados } = await obterCorrida(ID_DETALHE);
    expect(dados.mapa).toEqual([]);
    expect(dados.trajeto).toEqual([]);
  });

  it('corrida que falhou: motivo e detalhe_termino chegam à tela', async () => {
    simularFetch(
      resposta(
        detalheHttp({
          status: 'FALHOU',
          motivo_termino: 'FALHA_REPORTADA',
          detalhe_termino: 'Erro: sensor ToF 3',
          metricas: metricasCorrida({ tempo_conclusao_ms: null }),
        }),
      ),
    );
    const { dados } = await obterCorrida(ID_DETALHE);

    expect(dados).toMatchObject({
      status: 'FALHOU',
      motivoTermino: 'FALHA_REPORTADA',
      detalheFalha: 'Erro: sensor ToF 3',
      tensaoV: 7.9,
      cargaPct: 72,
    });
    expect(dados.mapa).toHaveLength(2);
  });
});

describe('dadosDasMetricasCorrida', () => {
  it('leva células, distância, velocidade, ΔV, tensão e carga finais e o tempo oficial', () => {
    expect(dadosDasMetricasCorrida(metricasCorrida())).toEqual({
      celulasPercorridas: 45,
      distanciaM: 8.1,
      velocidadeMediaMps: 0.09,
      deltaV: 0.4,
      tensaoV: 7.9,
      cargaPct: 72,
      tempoMs: 94500,
    });
  });

  it('sem tempo de conclusão (falha ou interrupção), usa o tempo decorrido', () => {
    const dados = dadosDasMetricasCorrida(
      metricasCorrida({ tempo_conclusao_ms: null, tempo_decorrido_ms: 121000 }),
    );
    expect(dados.tempoMs).toBe(121000);
  });

  it('campo nulo não sobrescreve o que já estava na tela', () => {
    const comNulos = {
      ...metricasCorrida(),
      tempo_conclusao_ms: null,
      tempo_decorrido_ms: null,
      delta_v: null,
    } as unknown as MetricasCorrida;
    const dados = dadosDasMetricasCorrida(comNulos);
    expect('tempoMs' in dados).toBe(false);
    expect('deltaV' in dados).toBe(false);
    expect(dados.cargaPct).toBe(72);
  });

  it('sem métricas, não inventa valores', () => {
    expect(dadosDasMetricasCorrida(null)).toEqual({});
    expect(dadosDasMetricasCorrida(undefined)).toEqual({});
  });
});

describe('obterCorrida — falhas (CT-FE-11 passo 4)', () => {
  it('404 vira NAO_ENCONTRADA', async () => {
    simularFetch(resposta({}, { ok: false, status: 404 }));
    const falha = obterCorrida('00000000-0000-0000-0000-000000000000');
    await expect(falha).rejects.toBeInstanceOf(ErroConsultaCorrida);
    await expect(falha).rejects.toMatchObject({ tipo: 'NAO_ENCONTRADA' });
  });

  it('400 (id que não é um UUID) também vira NAO_ENCONTRADA', async () => {
    simularFetch(resposta({ code: 'FST_ERR_VALIDATION' }, { ok: false, status: 400 }));
    await expect(obterCorrida('abc')).rejects.toMatchObject({ tipo: 'NAO_ENCONTRADA' });
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
