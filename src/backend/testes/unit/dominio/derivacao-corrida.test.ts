import { describe, expect, it } from 'vitest';
import {
  CONFIGURACAO_PADRAO,
  DerivacaoCorrida,
  cargaEstimadaPct,
  lerCurvaCarga,
  paredesDeBits,
  paredesEmBits,
  type Efeito,
  type MensagemDerivavel,
  type TipoLabirinto,
} from '../../../src/dominio/index.js';

const fechada = { norte: true, leste: true, sul: true, oeste: true };
let seq = 0;
const proxima = () => ++seq;

const inicio = (t = 0, labirinto: TipoLabirinto = '12x4'): MensagemDerivavel => ({
  tipo: 'inicio_corrida',
  sequencia: proxima(),
  tempo_ms: t,
  labirinto,
});
const celula = (x: number, y: number, t: number): MensagemDerivavel => ({
  tipo: 'celula',
  sequencia: proxima(),
  tempo_ms: t,
  x,
  y,
  paredes: { norte: false, leste: true, sul: false, oeste: true },
});
const posicao = (x: number, y: number, t: number): MensagemDerivavel => ({
  tipo: 'posicao',
  sequencia: proxima(),
  tempo_ms: t,
  x,
  y,
  orientacao: 'LESTE',
});
const energia = (tensao_v: number, t: number): MensagemDerivavel => ({
  tipo: 'energia',
  sequencia: proxima(),
  tempo_ms: t,
  tensao_v,
  corrente_a: 0.4,
  potencia_w: arredondar(tensao_v * 0.4),
});
const fim = (resultado: 'sucesso' | 'falha', t: number, detalhe?: string): MensagemDerivavel => ({
  tipo: 'fim_corrida',
  sequencia: proxima(),
  tempo_ms: t,
  resultado,
  ...(detalhe !== undefined && { detalhe }),
});

function aplicarTodas(d: DerivacaoCorrida, mensagens: MensagemDerivavel[]): Efeito[] {
  return mensagens.flatMap((m) => d.aplicar(m));
}
const doTipo = <T extends Efeito['tipo']>(efeitos: Efeito[], tipo: T) =>
  efeitos.filter((e): e is Extract<Efeito, { tipo: T }> => e.tipo === tipo);

describe('DerivacaoCorrida', () => {
  describe('tempo oficial (RF-82, CT-BE-15)', () => {
    it('usa só o relógio do robô: início em 1.000 ms e fim em 95.500 ms dão 94,5 s', () => {
      seq = 0;
      const d = new DerivacaoCorrida(null);
      aplicarTodas(d, [inicio(1000), celula(0, 3, 1000), fim('sucesso', 95_500)]);
      expect(d.metricas.tempoConclusaoMs).toBe(94_500);
      expect(d.status).toBe('CONCLUIDA');
    });

    it('não existe tempo de conclusão quando a corrida falha', () => {
      seq = 0;
      const d = new DerivacaoCorrida(null);
      aplicarTodas(d, [inicio(0), fim('falha', 5000)]);
      expect(d.metricas.tempoConclusaoMs).toBeNull();
      expect(d.metricas.tempoDecorridoMs).toBe(5000);
    });
  });

  describe('velocidade média e distância (RF-83, CT-BE-16)', () => {
    it('30 transições em 45 s dão 0,12 m/s e 5,4 m', () => {
      seq = 0;
      const d = new DerivacaoCorrida(null);
      const primeira = inicio(0);
      const celulas = Array.from({ length: 31 }, (_, i) =>
        celula(i % 12, Math.floor(i / 12), i * 1500),
      );
      aplicarTodas(d, [primeira, ...celulas, fim('sucesso', 45_000)]);

      expect(d.metricas.transicoes).toBe(30);
      expect(d.metricas.distanciaM).toBe(5.4);
      expect(d.metricas.velocidadeMediaMps).toBe(0.12);
    });

    it('é recalculada a cada transição, e não existe antes da primeira', () => {
      seq = 0;
      const d = new DerivacaoCorrida(null);
      aplicarTodas(d, [inicio(0), celula(0, 3, 0)]);
      expect(d.metricas.velocidadeMediaMps).toBeNull();

      d.aplicar(celula(0, 2, 1800));
      expect(d.metricas.velocidadeMediaMps).toBe(0.1);
    });
  });

  describe('trajeto (RF-84)', () => {
    it('numera as passagens, marca as revisitas e grava as paredes em bits', () => {
      seq = 0;
      const d = new DerivacaoCorrida(null);
      const passagens = doTipo(
        aplicarTodas(d, [celula(0, 0, 0), celula(0, 1, 1), celula(1, 1, 2), celula(0, 1, 3)]),
        'passagem',
      );

      expect(passagens.map((p) => [p.ordem, p.x, p.y, p.revisita])).toEqual([
        [1, 0, 0, false],
        [2, 0, 1, false],
        [3, 1, 1, false],
        [4, 0, 1, true],
      ]);
      expect(passagens[0]!.paredes).toBe(2 + 8);
      expect(d.metricas.revisitas).toBe(1);
    });

    it('volta dos bits para as paredes', () => {
      for (const bits of [0, 5, 10, 15]) expect(paredesEmBits(paredesDeBits(bits))).toBe(bits);
      expect(paredesDeBits(2 + 8)).toEqual({ norte: false, leste: true, sul: false, oeste: true });
    });

    it('converte as paredes para bits: norte 1, leste 2, sul 4, oeste 8', () => {
      expect(paredesEmBits(fechada)).toBe(15);
      expect(paredesEmBits({ norte: true, leste: false, sul: true, oeste: false })).toBe(5);
    });
  });

  describe('energia (RF-85, CT-BE-18)', () => {
    it('tensão inicial, final, ΔV e carga estimada', () => {
      seq = 0;
      const d = new DerivacaoCorrida(null);
      aplicarTodas(d, [inicio(0), ...[8.2, 8.0, 7.8, 7.6].map((v, i) => energia(v, i * 100))]);
      expect(d.metricas).toMatchObject({
        tensaoInicialV: 8.2,
        tensaoFinalV: 7.6,
        deltaV: 0.6,
        cargaInicialPct: 87.5,
        cargaFinalPct: 50,
      });
    });

    it('interpola na curva padrão e limita a 0–100 %', () => {
      const curva = CONFIGURACAO_PADRAO.curvaCarga;
      expect(cargaEstimadaPct(8.2, curva)).toBe(87.5);
      expect(cargaEstimadaPct(7.3, curva)).toBe(30);
      expect(cargaEstimadaPct(9.0, curva)).toBe(100);
      expect(cargaEstimadaPct(5.5, curva)).toBe(0);
    });

    it('aceita outra curva pela configuração (RF-85, CA4)', () => {
      const curva = lerCurvaCarga('8.0:100, 6.0:0');
      expect(cargaEstimadaPct(7.0, curva)).toBe(50);
      expect(() => lerCurvaCarga('8.0:100')).toThrow('pelo menos dois');
      expect(() => lerCurvaCarga('8.0:x,6:0')).toThrow('ponto inválido');
    });
  });

  describe('alerta de tensão baixa com histerese (RF-86, CT-BE-19)', () => {
    it('7,2 → 6,9 → 6,8 → 7,05 → 6,9 → 7,2 → 6,9 V gera exatamente dois alertas', () => {
      seq = 0;
      const d = new DerivacaoCorrida(null);
      const tensoes = [7.2, 6.9, 6.8, 7.05, 6.9, 7.2, 6.9];
      const alertas = doTipo(
        aplicarTodas(
          d,
          tensoes.map((v, i) => energia(v, i * 100)),
        ),
        'alerta_tensao',
      );
      expect(alertas.map((a) => a.tensaoV)).toEqual([6.9, 6.9]);
      expect(alertas.map((a) => a.sequencia)).toEqual([2, 7]);
    });
  });

  describe('snapshots (RF-80, CT-BE-11)', () => {
    it('8x4, 45 passagens intercaladas com posição: cortes na 20ª, na 40ª e no fim', () => {
      seq = 0;
      const d = new DerivacaoCorrida(null);
      const primeira = inicio(0, '8x4');
      // 45 passagens num labirinto de 32 células: as 13 últimas são revisitas.
      const passagens = Array.from({ length: 45 }, (_, i) => {
        const [x, y] = [i % 8, Math.floor(i / 8) % 4];
        return [celula(x, y, i * 100), posicao(x, y, i * 100 + 50)];
      }).flat();
      const snapshots = doTipo(
        aplicarTodas(d, [primeira, ...passagens, fim('sucesso', 5000)]),
        'snapshot',
      );

      // inicio = 1; a k-ésima célula tem seq 2k e a posição seguinte, 2k + 1.
      expect(snapshots.map((s) => s.sequenciaCorte)).toEqual([40, 80, 92]);
      expect(snapshots.map((s) => s.celulasVisitadas)).toEqual([20, 40, 45]);
      expect(snapshots[0]!.mapa.celulas).toHaveLength(20);
      const final = snapshots.at(-1)!;
      expect(final.mapa.celulas).toHaveLength(32);
      expect(final.mapa.posicao).toEqual({ x: 4, y: 1, orientacao: 'LESTE' });
      expect(final.metricas.transicoes).toBe(44);
    });
  });

  describe('status e motivo (RF-81, RF-87, CT-BE-12, CT-BE-20)', () => {
    it('aceita o fim em andamento e interrompida por silêncio; não depois do fim ou do reinício', () => {
      seq = 0;
      const andamento = new DerivacaoCorrida(null);
      andamento.aplicar(inicio(0));
      expect(andamento.aceitaFim).toBe(true);

      const semSinal = new DerivacaoCorrida(null);
      semSinal.aplicar(inicio(0));
      semSinal.interromper('SEM_SINAL');
      expect(semSinal.aceitaFim).toBe(true);

      const reinicio = new DerivacaoCorrida(null);
      reinicio.aplicar(inicio(0));
      reinicio.interromper('REINICIO_ROBO');
      expect(reinicio.aceitaFim).toBe(false);

      const terminada = new DerivacaoCorrida(null);
      aplicarTodas(terminada, [inicio(0), fim('falha', 10)]);
      expect(terminada.aceitaFim).toBe(false);
    });

    it('fim com sucesso: CONCLUIDA / SUCESSO', () => {
      seq = 0;
      const d = new DerivacaoCorrida(null);
      const status = doTipo(aplicarTodas(d, [inicio(0), fim('sucesso', 10)]), 'status');
      expect(status).toEqual([
        {
          tipo: 'status',
          status: 'CONCLUIDA',
          motivo: 'SUCESSO',
          detalhe: null,
          sequencia: 2,
          tempoMs: 10,
        },
      ]);
    });

    it('fim com falha: FALHOU / FALHA_REPORTADA, com o detalhe do firmware', () => {
      seq = 0;
      const d = new DerivacaoCorrida(null);
      aplicarTodas(d, [inicio(0), fim('falha', 10, 'Erro: sensor ToF 3')]);
      expect([d.status, d.motivo, d.detalhe]).toEqual([
        'FALHOU',
        'FALHA_REPORTADA',
        'Erro: sensor ToF 3',
      ]);
    });

    it('recusa qualquer mudança depois de finalizada (CT-BE-20)', () => {
      seq = 0;
      const d = new DerivacaoCorrida(null);
      aplicarTodas(d, [inicio(0), fim('falha', 10)]);
      expect(d.aplicar(fim('sucesso', 20))).toEqual([]);
      expect(d.aplicar(celula(0, 0, 30))).toEqual([]);
      expect(d.interromper('SEM_SINAL')).toEqual([]);
      expect(d.status).toBe('FALHOU');
    });

    it('interrompida por falta de sinal ainda aceita o fim de um lote tardio (CT-BE-13)', () => {
      seq = 0;
      const d = new DerivacaoCorrida(null);
      d.aplicar(inicio(1000));
      expect(d.interromper('SEM_SINAL')[0]).toMatchObject({
        status: 'INTERROMPIDA',
        motivo: 'SEM_SINAL',
      });

      aplicarTodas(d, [celula(0, 3, 2000), fim('sucesso', 95_500)]);
      expect(d.status).toBe('CONCLUIDA');
      expect(d.metricas.tempoConclusaoMs).toBe(94_500);
    });

    it('interrompida por reinício é definitiva (CT-BE-14)', () => {
      seq = 0;
      const d = new DerivacaoCorrida(null);
      d.aplicar(inicio(0));
      d.interromper('REINICIO_ROBO');
      expect(d.aplicar(fim('sucesso', 10))).toEqual([]);
      expect([d.status, d.motivo]).toEqual(['INTERROMPIDA', 'REINICIO_ROBO']);
    });

    it('sem inicio_corrida, o relógio começa na primeira mensagem aplicada', () => {
      seq = 0;
      const d = new DerivacaoCorrida('4x4');
      aplicarTodas(d, [celula(0, 3, 500), celula(0, 2, 2300), fim('sucesso', 3000)]);
      expect(d.metricas.tempoConclusaoMs).toBe(2500);
    });
  });
});

function arredondar(valor: number): number {
  return Math.round(valor * 1000) / 1000;
}
