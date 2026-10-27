/**
 * Anomalias do simulador: cada mensagem ruim tem de ser rejeitada pelo backend com o motivo
 * certo, e o plano de envio tem de manter a corrida completa (cada válida uma única vez).
 *
 * O motivo é conferido com o mesmo caminho da ingestão: JSON → esquema v1 → regras de domínio.
 */
import { describe, expect, it } from 'vitest';
import type { MensagemCorrida, TipoLabirinto } from '../../../protocolo/tipos.js';
import { criarValidadorProtocolo, interpretarJson } from '../../../protocolo/validador.js';
import { criarAleatorio } from '../../../simulador/aleatorio.js';
import {
  comTempo,
  comTensao,
  foraDoLabirinto,
  GRUPOS_ANOMALIA,
  labirintoInvalido,
  planejarEnvio,
  semCampo,
  textoNaoJson,
  tipoDesconhecido,
  TIPOS_ANOMALIA,
  type PassoEnvio,
} from '../../../simulador/anomalias.js';
import { gerarCorrida } from '../../../simulador/corrida.js';
import { gerarLabirinto, TIPOS_LABIRINTO } from '../../../simulador/labirinto.js';
import { explorar } from '../../../simulador/percurso.js';
import { SequenciaCorrida, verificarRegras } from '../../../src/dominio/index.js';

const validador = criarValidadorProtocolo();

function corrida(tipo: TipoLabirinto = '4x4', semente = 42) {
  const aleatorio = criarAleatorio(semente);
  const labirinto = gerarLabirinto(tipo, aleatorio);
  const gerada = gerarCorrida({
    labirinto,
    percurso: explorar(labirinto),
    boot: 'b1',
    inicioMs: 12_000,
    resultado: 'sucesso',
    aleatorio,
  });
  return { labirinto, ...gerada, aleatorio };
}

/** Como o backend classifica o texto, com as `anteriores` já aceitas na corrida. */
function classificar(
  texto: string,
  labirinto: TipoLabirinto,
  anteriores: readonly MensagemCorrida[] = [],
): string {
  const json = interpretarJson(texto);
  if (!json.ok) return json.codigo;
  const validada = validador.corrida(json.mensagem);
  if (!validada.ok) return validada.codigo;
  const sequencias = new SequenciaCorrida();
  for (const m of anteriores) sequencias.aceitar(m.sequencia, m.tempo_ms);
  const m = validada.mensagem as MensagemCorrida & { x?: number; y?: number; tensao_v?: number };
  return verificarRegras(m, labirinto, sequencias)?.codigo ?? 'OK';
}

const doTipo = (mensagens: MensagemCorrida[], tipo: MensagemCorrida['tipo']) =>
  mensagens.find((m) => m.tipo === tipo && m.sequencia > 1)!;

describe('mensagens anômalas avulsas', () => {
  const { mensagens } = corrida('4x4');

  it('a mensagem válida de base é aceita (controle)', () => {
    for (const tipo of ['celula', 'energia', 'posicao'] as const) {
      expect(classificar(JSON.stringify(doTipo(mensagens, tipo)), '4x4')).toBe('OK');
    }
  });

  it('CT-BE-05: sem campo, não-JSON e tipo desconhecido falham antes das regras', () => {
    const celula = doTipo(mensagens, 'celula');
    expect(JSON.parse(semCampo(celula))).not.toHaveProperty('paredes');
    expect(classificar(semCampo(celula), '4x4')).toBe('ESQUEMA_INVALIDO');
    expect(classificar(semCampo(doTipo(mensagens, 'energia'), 'corrente_a'), '4x4')).toBe(
      'ESQUEMA_INVALIDO',
    );
    expect(classificar(textoNaoJson(), '4x4')).toBe('JSON_INVALIDO');
    expect(JSON.parse(tipoDesconhecido(celula))).toMatchObject({ tipo: 'teleporte' });
    expect(classificar(tipoDesconhecido(celula), '4x4')).toBe('TIPO_DESCONHECIDO');
  });

  it('CT-BE-06: coordenada fora do labirinto passa no esquema e cai na regra de domínio', () => {
    for (const tipo of TIPOS_LABIRINTO) {
      const gerada = corrida(tipo);
      const celula = doTipo(gerada.mensagens, 'celula');
      const texto = foraDoLabirinto(celula, gerada.labirinto);
      expect(validador.corrida(JSON.parse(texto)), tipo).toMatchObject({ ok: true });
      expect(classificar(texto, tipo), tipo).toBe('COORDENADA_FORA_DO_LABIRINTO');
    }
    // No 4x4, é a célula x = 5 do caso de teste.
    expect(
      JSON.parse(foraDoLabirinto(doTipo(mensagens, 'celula'), { colunas: 4, linhas: 4 })).x,
    ).toBe(5);
  });

  it('CT-BE-07: labirinto 5x5, tensões 4,9 V e 9,1 V e tempo que regride', () => {
    expect(classificar(labirintoInvalido(mensagens[0]!), '4x4')).toBe('ESQUEMA_INVALIDO');

    const energia = doTipo(mensagens, 'energia');
    expect(classificar(comTensao(energia, 4.9), '4x4')).toBe('TENSAO_FORA_DA_FAIXA');
    expect(classificar(comTensao(energia, 9.1), '4x4')).toBe('TENSAO_FORA_DA_FAIXA');
    expect(classificar(comTensao(energia, 7.4), '4x4')).toBe('OK');

    const anterior = mensagens[19]!;
    const atual = mensagens[20]!;
    const texto = comTempo(atual, anterior.tempo_ms - 100);
    expect(classificar(texto, '4x4', [anterior])).toBe('TEMPO_REGRESSIVO');
  });
});

describe('plano de envio com anomalias', () => {
  const emitidas = (passos: PassoEnvio[]) =>
    passos.filter((p) => p.acao === 'emitir').map((p) => p.mensagem.sequencia);

  it('sem anomalias, emite a corrida na ordem, sem nada a mais', () => {
    const { mensagens, labirinto, aleatorio } = corrida();
    const plano = planejarEnvio(mensagens, labirinto, [], aleatorio);
    expect(plano.passos.every((p) => p.acao === 'emitir')).toBe(true);
    expect(emitidas(plano.passos)).toEqual(mensagens.map((m) => m.sequencia));
  });

  it('com todas as anomalias, cada mensagem válida sai uma única vez e o fim é a última', () => {
    for (const tipo of TIPOS_LABIRINTO) {
      for (const semente of [1, 2, 3, 42, 2026]) {
        const { mensagens, labirinto, aleatorio } = corrida(tipo, semente);
        const anomalias = TIPOS_ANOMALIA.map((t) => ({ tipo: t }));
        const plano = planejarEnvio(mensagens, labirinto, anomalias, aleatorio);

        const ordem = emitidas(plano.passos);
        expect([...ordem].sort((a, b) => a - b)).toEqual(mensagens.map((m) => m.sequencia));
        expect(ordem.at(-1)).toBe(mensagens.length);
        expect(plano.anomalias.map((a) => a.tipo).sort()).toEqual([...TIPOS_ANOMALIA].sort());
        // Uma anomalia por base: nenhuma mexe no efeito da outra.
        expect(new Set(plano.anomalias.map((a) => a.sequencia)).size).toBe(TIPOS_ANOMALIA.length);
      }
    }
  });

  it('cada injeção inválida vem ANTES da válida de mesma sequência, e é rejeitada', () => {
    const { mensagens, labirinto, aleatorio } = corrida('8x4', 7);
    const plano = planejarEnvio(
      mensagens,
      labirinto,
      [{ tipo: 'sem-campo' }, { tipo: 'fora-do-labirinto' }, { tipo: 'tensao-fora-da-faixa' }],
      aleatorio,
    );
    const aceitas: MensagemCorrida[] = [];
    for (const [i, passo] of plano.passos.entries()) {
      if (passo.acao === 'emitir') {
        aceitas.push(passo.mensagem);
        continue;
      }
      expect(classificar(passo.texto, '8x4', aceitas)).not.toBe('OK');
      const seguinte = plano.passos.slice(i).find((p) => p.acao === 'emitir');
      expect(seguinte?.acao === 'emitir' && seguinte.mensagem.sequencia).toBe(passo.sequencia);
    }
  });

  it('duplicada: cópias idênticas logo depois da original (três envios, como no CT-BE-08)', () => {
    const { mensagens, labirinto, aleatorio } = corrida();
    const plano = planejarEnvio(
      mensagens,
      labirinto,
      [{ tipo: 'duplicada', sequencia: 30 }],
      aleatorio,
    );
    const i = plano.passos.findIndex((p) => p.acao === 'emitir' && p.mensagem.sequencia === 30);
    const original = JSON.stringify(mensagens[29]);
    expect(plano.passos.slice(i + 1, i + 3)).toEqual([
      { acao: 'injetar', texto: original, anomalia: 'duplicada', sequencia: 30 },
      { acao: 'injetar', texto: original, anomalia: 'duplicada', sequencia: 30 },
    ]);
    expect(plano.anomalias).toEqual([{ tipo: 'duplicada', sequencia: 30, injecoes: 2 }]);
  });

  it('fora-de-ordem: a mensagem sai depois das `distancia` seguintes (CT-BE-17)', () => {
    const { mensagens, labirinto, aleatorio } = corrida();
    const plano = planejarEnvio(
      mensagens,
      labirinto,
      [{ tipo: 'fora-de-ordem', sequencia: 3, distancia: 2 }],
      aleatorio,
    );
    expect(emitidas(plano.passos).slice(0, 6)).toEqual([1, 2, 4, 5, 3, 6]);
  });

  it('sequência fixa: usa a primeira mensagem que serve a partir dela', () => {
    const { mensagens, labirinto, aleatorio } = corrida();
    const plano = planejarEnvio(
      mensagens,
      labirinto,
      [{ tipo: 'tensao-fora-da-faixa', sequencia: 1 }],
      aleatorio,
    );
    const base = mensagens[plano.anomalias[0]!.sequencia - 1]!;
    expect(base.tipo).toBe('energia');
    expect(mensagens.slice(0, base.sequencia - 1).some((m) => m.tipo === 'energia')).toBe(false);
  });

  it('a mesma semente dá o mesmo plano', () => {
    const plano = (semente: number) => {
      const { mensagens, labirinto } = corrida('12x4', 5);
      return planejarEnvio(
        mensagens,
        labirinto,
        TIPOS_ANOMALIA.map((tipo) => ({ tipo })),
        criarAleatorio(semente),
      ).anomalias;
    };
    expect(plano(99)).toEqual(plano(99));
    expect(plano(99)).not.toEqual(plano(100));
  });

  it('os grupos da linha de comando só têm anomalias que existem', () => {
    for (const grupo of Object.values(GRUPOS_ANOMALIA)) {
      for (const tipo of grupo) expect(TIPOS_ANOMALIA).toContain(tipo);
    }
    expect(GRUPOS_ANOMALIA.todas).toEqual(TIPOS_ANOMALIA);
  });

  it('valida os pedidos', () => {
    const { mensagens, labirinto, aleatorio } = corrida();
    const pedir = (anomalia: object) =>
      planejarEnvio(mensagens, labirinto, [anomalia as never], aleatorio);
    expect(() => pedir({ tipo: 'teleporte' })).toThrow(/desconhecida/);
    expect(() => pedir({ tipo: 'duplicada', vezes: 0 })).toThrow(/vezes/);
    expect(() => pedir({ tipo: 'fora-de-ordem', distancia: 1.5 })).toThrow(/distancia/);
    expect(() => pedir({ tipo: 'labirinto-invalido', sequencia: 2 })).toThrow(/nenhuma mensagem/);
  });
});
