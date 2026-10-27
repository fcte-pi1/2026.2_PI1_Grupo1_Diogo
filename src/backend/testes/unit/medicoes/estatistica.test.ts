import { describe, expect, it } from 'vitest';
import {
  contarSequenciasCsv,
  diferencasSnapshot,
  IndiceEnvios,
  parear,
  percentil,
  resumir,
  type Recepcao,
} from '../../../medicoes/estatistica.js';

describe('medições (#373): percentis', () => {
  const cem = Array.from({ length: 100 }, (_, i) => i + 1);

  it('usa o posto mais próximo: sempre um valor medido, sem interpolação', () => {
    expect(percentil(cem, 50)).toBe(50);
    expect(percentil(cem, 95)).toBe(95);
    expect(percentil(cem, 99)).toBe(99);
    expect(percentil(cem, 100)).toBe(100);
    expect(percentil([1, 2, 3], 95)).toBe(3);
    expect(percentil([7], 50)).toBe(7);
  });

  it('sem amostras, devolve null; percentil fora de (0, 100] é erro', () => {
    expect(percentil([], 95)).toBeNull();
    expect(() => percentil(cem, 0)).toThrow(RangeError);
    expect(() => percentil(cem, 101)).toThrow(RangeError);
  });

  it('resumir ordena, arredonda para duas casas e traz o máximo', () => {
    expect(resumir([3.456, 1.111, 2.222])).toEqual({
      amostras: 3,
      p50: 2.22,
      p95: 3.46,
      p99: 3.46,
      max: 3.46,
    });
    expect(resumir([])).toEqual({ amostras: 0, p50: null, p95: null, p99: null, max: null });
  });
});

describe('medições (#373): pareamento simulador → painel', () => {
  const texto = (m: object) => JSON.stringify(m);

  it('guarda só o primeiro envio de cada sequência: o reenvio do buffer não muda o instante', () => {
    const envios = new IndiceEnvios();
    envios.registrarTexto(
      texto({ tipo: 'celula', corrida: 'r1-1', sequencia: 3, tempo_ms: 100 }),
      10,
    );
    envios.registrarTexto(
      texto({ tipo: 'celula', corrida: 'r1-1', sequencia: 3, tempo_ms: 100 }),
      90,
    );
    expect(envios.porSequencia.get('r1-1|3')?.em).toBe(10);
    expect(envios.repetidos).toBe(1);
  });

  it('o ciclo de telemetria (posição e energia com o mesmo tempo_ms) vale pelo primeiro envio', () => {
    const envios = new IndiceEnvios();
    envios.registrarTexto(
      texto({ tipo: 'posicao', corrida: 'r1-1', sequencia: 4, tempo_ms: 200 }),
      20,
    );
    envios.registrarTexto(
      texto({ tipo: 'energia', corrida: 'r1-1', sequencia: 5, tempo_ms: 200 }),
      70,
    );
    expect(envios.porCiclo.get('r1-1|200')).toBe(20);
  });

  it('ignora o hello e o texto que não é JSON', () => {
    const envios = new IndiceEnvios();
    envios.registrarTexto(texto({ tipo: 'hello', dispositivo: 'sim-01', boot: 'ab' }), 1);
    envios.registrarTexto('isto não é json', 2);
    expect(envios.porSequencia.size).toBe(0);
  });

  it('calcula a latência de eventos e contínuos e conta o que não tem par', () => {
    const envios = new IndiceEnvios();
    envios.registrar({ corrida: 'r1-1', sequencia: 3, tipo: 'celula', tempoMs: 100, em: 10 });
    envios.registrar({ corrida: 'r1-1', sequencia: 4, tipo: 'posicao', tempoMs: 200, em: 20 });
    const mapa = new Map([['uuid-a', 'r1-1']]);
    const base = { painel: 1, corrida: 'uuid-a' } as const;
    const recepcoes: Recepcao[] = [
      { ...base, tipo: 'evento', sequencia: 3, tempoMs: 100, em: 25 },
      { ...base, painel: 2, tipo: 'evento', sequencia: 3, tempoMs: 100, em: 27 },
      { ...base, tipo: 'continuo', sequencia: null, tempoMs: 200, em: 80 },
      { ...base, tipo: 'evento', sequencia: 99, tempoMs: 0, em: 30 },
      { ...base, corrida: 'uuid-desconhecido', tipo: 'evento', sequencia: 3, tempoMs: 100, em: 30 },
    ];
    expect(parear(recepcoes, envios, mapa)).toEqual({
      eventos: [15, 17],
      continuos: [60],
      semPar: 2,
    });
  });
});

describe('medições (#373): contagem pela exportação CSV', () => {
  it('conta linhas, sequências distintas e a maior, com BOM, cabeçalho e CRLF', () => {
    const csv =
      '﻿seq,t_robo_ms,tipo,detalhe\r\n' +
      '1,0,inicio_corrida,\r\n' +
      '2,100,celula,\r\n' +
      '3,200,fim_corrida,"texto, com vírgula"\r\n';
    expect(contarSequenciasCsv(csv)).toEqual({ linhas: 3, distintas: 3, maxima: 3 });
  });

  it('só o cabeçalho: nenhuma linha e sem máximo', () => {
    expect(contarSequenciasCsv('seq,t_robo_ms\r\n')).toEqual({
      linhas: 0,
      distintas: 0,
      maxima: null,
    });
  });
});

describe('medições (#373): comparação de snapshots', () => {
  const snapshot = {
    tipo: 'snapshot',
    sequencia_corte: 250,
    mapa: [
      { x: 0, y: 3, paredes: { norte: false } },
      { x: 0, y: 2, paredes: { norte: true } },
    ],
    metricas: { celulas_percorridas: 5, distancia_m: 0.9 },
    sinal: 'NORMAL',
  };

  it('ignora o sinal e a ordem das células do mapa', () => {
    const depois = { ...snapshot, sinal: 'PERDIDO', mapa: [...snapshot.mapa].reverse() };
    expect(diferencasSnapshot(snapshot, depois)).toEqual([]);
  });

  it('não depende da ordem das chaves, que o jsonb do PostgreSQL não preserva', () => {
    const antes = { mapa: [{ x: 0, y: 3, paredes: { norte: false, leste: true, sul: true } }] };
    const depois = { mapa: [{ y: 3, x: 0, paredes: { sul: true, leste: true, norte: false } }] };
    expect(diferencasSnapshot(antes, depois)).toEqual([]);
  });

  it('aponta uma parede diferente no mapa, mesmo com o mesmo número de células', () => {
    const depois = {
      ...snapshot,
      mapa: [snapshot.mapa[0]!, { x: 0, y: 2, paredes: { norte: false } }],
    };
    expect(diferencasSnapshot(snapshot, depois)).toEqual([
      'mapa: 2 → 2 células (1 só antes, 1 só depois)',
    ]);
  });

  it('aponta cada métrica e campo diferente', () => {
    const depois = {
      ...snapshot,
      sequencia_corte: 249,
      metricas: { ...snapshot.metricas, distancia_m: 0.72 },
    };
    expect(diferencasSnapshot(snapshot, depois)).toEqual([
      'sequencia_corte: 250 → 249',
      'metricas.distancia_m: 0.9 → 0.72',
    ]);
  });
});
