import { describe, expect, it } from 'vitest';
import {
  EXTENSAO_EXPORTACAO,
  execucaoInicial,
  FORMATOS_EXPORTACAO,
  TIPO_CONTEUDO_EXPORTACAO,
} from '../../src/dominio';
import type { AmostraEnergia, DadosExecucao } from '../../src/dominio';
import {
  mensagemErroExportacao,
  montarCsvExecucao,
  montarJsonExecucao,
  nomeArquivoExportacao,
} from '../../src/formatacao';

const INICIO = '2026-10-17T14:30:05.000Z';

function amostras(quantidade: number): AmostraEnergia[] {
  return Array.from({ length: quantidade }, (_, i) => ({
    seq: null,
    tempoMs: 1000 + i * 100,
    tensaoV: 8.4,
    correnteA: 0.5,
    potenciaW: 4.2,
    cargaPct: 100,
  }));
}

function execucao(parcial: Partial<DadosExecucao> = {}): DadosExecucao {
  return {
    ...execucaoInicial,
    corrida: '0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33',
    tipoLabirinto: '8x4',
    status: 'CONCLUIDA',
    motivoTermino: 'SUCESSO',
    tempoMs: 94500,
    celulasPercorridas: 45,
    distanciaM: 8.1,
    velocidadeMediaMps: 0.09,
    tensaoV: 7.9,
    correnteA: 0.5,
    potenciaW: 3.95,
    cargaPct: 72,
    deltaV: 0.4,
    mapa: [{ x: 0, y: 3, paredes: { norte: false, leste: false, sul: true, oeste: true } }],
    trajeto: [
      { seq: 1, x: 0, y: 3 },
      { seq: 2, x: 0, y: 2 },
    ],
    energia: amostras(600),
    ...parcial,
  };
}

/** Linhas do CSV sem o BOM e sem a linha vazia depois do último CRLF. */
function linhas(csv: string): string[] {
  return csv
    .replace(/^\uFEFF/, '')
    .split('\r\n')
    .slice(0, -1);
}

describe('formatos oferecidos (CT-FE-15 passo 1)', () => {
  it('JSON e CSV, com extensão e tipo de conteúdo compatíveis', () => {
    expect([...FORMATOS_EXPORTACAO].sort()).toEqual(['CSV', 'JSON']);
    expect(EXTENSAO_EXPORTACAO).toEqual({ CSV: 'csv', JSON: 'json' });
    expect(TIPO_CONTEUDO_EXPORTACAO.CSV).toMatch(/^text\/csv/);
    expect(TIPO_CONTEUDO_EXPORTACAO.JSON).toMatch(/^application\/json/);
  });
});

describe('montarJsonExecucao (CT-FE-15 passo 2)', () => {
  const json = () => JSON.parse(montarJsonExecucao({ dados: execucao(), iniciadaEm: INICIO }));

  it('é um JSON válido com identificação, tipo, status, métricas, trajeto e energia', () => {
    const corpo = json();
    expect(corpo).toMatchObject({
      id: '0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33',
      iniciada_em: INICIO,
      tipo_labirinto: '8x4',
      status: 'CONCLUIDA',
      motivo_termino: 'SUCESSO',
      detalhe: null,
    });
    expect(corpo.metricas).toEqual({
      tempo_ms: 94500,
      celulas_percorridas: 45,
      distancia_m: 8.1,
      velocidade_media_mps: 0.09,
      tensao_v: 7.9,
      corrente_a: 0.5,
      potencia_w: 3.95,
      carga_estimada_pct: 72,
      delta_v: 0.4,
    });
    expect(corpo.trajeto).toEqual([
      { sequencia: 1, x: 0, y: 3 },
      { sequencia: 2, x: 0, y: 2 },
    ]);
    expect(corpo.energia).toHaveLength(600);
    expect(corpo.energia[0]).toEqual({
      tempo_ms: 1000,
      tensao_v: 8.4,
      corrente_a: 0.5,
      potencia_w: 4.2,
      carga_estimada_pct: 100,
    });
    expect(corpo.mapa).toHaveLength(1);
  });

  it('mantém a falha gravada, com motivo e detalhe', () => {
    const corpo = JSON.parse(
      montarJsonExecucao({
        dados: execucao({
          status: 'FALHOU',
          motivoTermino: 'TIMEOUT',
          detalheFalha: 'Tempo limite de 10 min excedido',
        }),
        iniciadaEm: INICIO,
      }),
    );
    expect(corpo).toMatchObject({
      status: 'FALHOU',
      motivo_termino: 'TIMEOUT',
      detalhe: 'Tempo limite de 10 min excedido',
    });
  });

  it('valores ausentes ficam null, sem inventar zeros', () => {
    const corpo = JSON.parse(
      montarJsonExecucao({ dados: execucao({ deltaV: null, cargaPct: null }), iniciadaEm: null }),
    );
    expect(corpo.iniciada_em).toBeNull();
    expect(corpo.metricas.delta_v).toBeNull();
    expect(corpo.metricas.carga_estimada_pct).toBeNull();
  });
});

describe('montarCsvExecucao (CT-FE-15 passo 3)', () => {
  const csv = (dados = execucao()) => montarCsvExecucao({ dados, iniciadaEm: INICIO });

  it('começa com o BOM do UTF-8, usa CRLF e termina com quebra de linha', () => {
    const texto = csv();
    expect(texto.startsWith('\uFEFF')).toBe(true);
    expect(texto.endsWith('\r\n')).toBe(true);
    expect(texto.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('tem cabeçalho e as seções resumo, métrica, trajeto e energia', () => {
    const todas = linhas(csv());
    expect(todas[0]).toBe(
      'secao,id_execucao,campo,valor,sequencia,x,y,tempo_ms,tensao_v,corrente_a,potencia_w,carga_estimada_pct',
    );
    const secoes = new Set(todas.slice(1).map((l) => l.split(',')[0]));
    expect([...secoes]).toEqual(['resumo', 'metrica', 'trajeto', 'energia']);
  });

  it('o resumo traz início, tipo, status e motivo', () => {
    const resumo = linhas(csv()).filter((l) => l.startsWith('resumo,'));
    expect(resumo).toContain('resumo,0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33,iniciada_em,' + INICIO);
    expect(resumo.some((l) => l.includes(',tipo_labirinto,8x4'))).toBe(true);
    expect(resumo.some((l) => l.includes(',status,CONCLUIDA'))).toBe(true);
    expect(resumo.some((l) => l.includes(',motivo_termino,SUCESSO'))).toBe(true);
  });

  it('as métricas usam ponto decimal', () => {
    const metricas = linhas(csv()).filter((l) => l.startsWith('metrica,'));
    expect(metricas.some((l) => l.includes(',distancia_m,8.1'))).toBe(true);
    expect(metricas.some((l) => l.includes(',velocidade_media_mps,0.09'))).toBe(true);
    expect(metricas.some((l) => l.includes(',delta_v,0.4'))).toBe(true);
  });

  it('há uma linha por passagem do trajeto e uma por amostra de energia', () => {
    const todas = linhas(csv());
    expect(todas.filter((l) => l.startsWith('trajeto,'))).toEqual([
      'trajeto,0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33,,,1,0,3',
      'trajeto,0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33,,,2,0,2',
    ]);
    expect(todas.filter((l) => l.startsWith('energia,'))).toHaveLength(600);
  });

  it('6.000 amostras saem sem perda', () => {
    const energia = linhas(csv(execucao({ energia: amostras(6000) }))).filter((l) =>
      l.startsWith('energia,'),
    );
    expect(energia).toHaveLength(6000);
    expect(energia[0]).toBe(
      'energia,0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33,,,,,,1000,8.4,0.5,4.2,100',
    );
    expect(energia.at(-1)).toContain(',600900,');
  });

  it('sem amostras de energia, gera o arquivo sem linhas de energia e sem erro', () => {
    const todas = linhas(csv(execucao({ energia: [] })));
    expect(todas.filter((l) => l.startsWith('energia,'))).toHaveLength(0);
    expect(todas.length).toBeGreaterThan(1);
  });

  it('valores ausentes ficam em branco', () => {
    const metricas = linhas(csv(execucao({ deltaV: null }))).filter((l) =>
      l.startsWith('metrica,'),
    );
    expect(metricas).toContain('metrica,0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33,delta_v,');
  });

  it('texto com vírgula, aspas ou quebra de linha é protegido entre aspas', () => {
    const texto = csv(execucao({ status: 'FALHOU', detalheFalha: 'sensor 3, "ToF"\nsem leitura' }));
    expect(texto).toContain(',detalhe,"sensor 3, ""ToF""\nsem leitura"\r\n');
  });

  it('texto vindo do firmware que começa como fórmula não vira fórmula na planilha', () => {
    for (const perigoso of ['=SOMA(A1)', '+1', '-1+1', '@cmd']) {
      const texto = csv(execucao({ status: 'FALHOU', detalheFalha: perigoso }));
      expect(texto).toContain(`,detalhe,'${perigoso}\r\n`);
    }
  });

  it('número negativo continua número (só texto é protegido)', () => {
    const texto = csv(execucao({ energia: [{ ...amostras(1)[0]!, correnteA: -0.2 }] }));
    expect(texto).toContain(',1000,8.4,-0.2,4.2,100\r\n');
  });
});

describe('nomeArquivoExportacao e mensagem de erro', () => {
  it('o nome leva o id da execução e a extensão do formato', () => {
    expect(nomeArquivoExportacao('0b6f7c0e-3a52', 'JSON')).toBe('execucao-0b6f7c0e-3a52.json');
    expect(nomeArquivoExportacao('0b6f7c0e-3a52', 'CSV')).toBe('execucao-0b6f7c0e-3a52.csv');
  });

  it('caracteres que não servem em nome de arquivo viram "_"', () => {
    expect(nomeArquivoExportacao('a/b c', 'CSV')).toBe('execucao-a_b_c.csv');
  });

  it('sem id, usa um nome genérico', () => {
    expect(nomeArquivoExportacao(null, 'JSON')).toBe('execucao.json');
  });

  it('a mensagem de erro cita o formato e diz que os dados foram mantidos', () => {
    expect(mensagemErroExportacao('CSV')).toBe(
      'Não foi possível exportar a execução em CSV. Os dados exibidos foram mantidos.',
    );
  });
});
