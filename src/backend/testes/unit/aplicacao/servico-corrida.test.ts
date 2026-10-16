import { beforeEach, describe, expect, it } from 'vitest';
import type { SessaoRobo, ServicoIngestao } from '../../../src/aplicacao/index.js';
import { AmbienteEmMemoria, hello, mensagem } from '../../apoio/ingestao-em-memoria.js';

const dormir = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

describe('ServicoCorrida', () => {
  let amb: AmbienteEmMemoria;

  beforeEach(() => {
    amb = new AmbienteEmMemoria();
  });

  async function conectar(
    texto = hello(),
    servico: ServicoIngestao = amb.servico,
  ): Promise<SessaoRobo> {
    const resultado = await servico.autenticar(texto, (ack) => amb.acks.push(ack));
    if (!resultado.ok) throw new Error(`hello recusado: ${resultado.motivo}`);
    return resultado.sessao;
  }

  async function enviar(
    sessao: SessaoRobo,
    textos: string[],
    servico = amb.servico,
  ): Promise<void> {
    for (const texto of textos) await servico.receber(sessao, texto);
    await amb.esvaziar();
  }

  const corridaA = () => amb.porIdRobo('c-A');
  const publicados = (evento: string) => amb.publicados.filter((p) => p.evento === evento);

  describe('encerramento (RF-81, RF-87)', () => {
    it('fim com sucesso: CONCLUIDA, tempo oficial e métricas finais (CT-BE-12, CT-BE-15)', async () => {
      const sessao = await conectar();
      await enviar(sessao, [
        mensagem('inicio_corrida', 1, { tempo_ms: 1000 }),
        mensagem('celula', 2, { tempo_ms: 1000 }),
        mensagem('celula', 3, { x: 0, y: 2, tempo_ms: 2800 }),
        mensagem('fim_corrida', 4, { tempo_ms: 95_500 }),
      ]);

      expect(corridaA().status).toBe('CONCLUIDA');
      const encerramento = amb.encerramentos.get(corridaA().id)!;
      expect(encerramento).toMatchObject({
        status: 'CONCLUIDA',
        motivo: 'SUCESSO',
        detalhe: null,
        tempoFimRoboMs: 95_500,
        ultimaContigua: 4,
        faltantes: 0,
      });
      expect(encerramento.metricas).toMatchObject({ tempoConclusaoMs: 94_500, transicoes: 1 });
      expect(publicados('status-alterado')).toHaveLength(1);
    });

    it('fim com falha: FALHOU com o detalhe, e a corrida não muda mais (CT-BE-20)', async () => {
      const sessao = await conectar();
      await enviar(sessao, [
        mensagem('inicio_corrida', 1),
        mensagem('fim_corrida', 2, { resultado: 'falha', detalhe: 'Erro: sensor ToF 3' }),
        mensagem('fim_corrida', 3, { resultado: 'sucesso' }),
        mensagem('celula', 4),
      ]);

      expect(corridaA().status).toBe('FALHOU');
      expect(amb.encerramentos.get(corridaA().id)).toMatchObject({
        motivo: 'FALHA_REPORTADA',
        detalhe: 'Erro: sensor ToF 3',
      });
      // O segundo fim é rejeitado, mesmo enviado antes de o primeiro ser aplicado.
      expect(amb.rejeicoes).toEqual([
        expect.objectContaining({ sequencia: 3, motivoCodigo: 'CORRIDA_FINALIZADA' }),
      ]);
      // As outras mensagens depois do fim ficam no registro bruto, mas não mudam a corrida.
      expect(amb.sequenciasGravadasDe('c-A')).toEqual([1, 2, 4]);
      expect(amb.passagens).toHaveLength(0);
      expect(publicados('status-alterado')).toHaveLength(1);
    });

    it('o reenvio do fim original continua confirmado, e não é rejeitado (RF-77)', async () => {
      const sessao = await conectar();
      await enviar(sessao, [mensagem('inicio_corrida', 1), mensagem('fim_corrida', 2)]);
      await enviar(await conectar(), [mensagem('fim_corrida', 2)]);

      expect(amb.rejeicoes).toEqual([]);
      expect(amb.ultimoAck()).toEqual({ tipo: 'ack', corrida: 'c-A', sequencia: 2 });
      expect(corridaA().status).toBe('CONCLUIDA');
    });

    it('depois de um reinício do backend, um novo fim de corrida concluída é rejeitado', async () => {
      const sessao = await conectar();
      await enviar(sessao, [mensagem('inicio_corrida', 1), mensagem('fim_corrida', 2)]);

      const reiniciado = amb.novoServico();
      await enviar(await conectar(hello(), reiniciado), [mensagem('fim_corrida', 3)], reiniciado);
      expect(amb.rejeicoes.map((r) => r.motivoCodigo)).toEqual(['CORRIDA_FINALIZADA']);
    });
  });

  describe('trajeto e ordem (RF-84, CT-BE-17)', () => {
    it('aplica em ordem de sequência mesmo com a 3 chegando por último', async () => {
      const sessao = await conectar();
      const c = (x: number, y: number, n: number) => mensagem('celula', n, { x, y });
      await enviar(sessao, [
        mensagem('inicio_corrida', 1),
        c(0, 3, 2),
        c(0, 2, 3).replace('"sequencia":3', '"sequencia":4'),
        c(1, 2, 5),
        c(0, 2, 6),
      ]);
      // Até aqui, a sequência 3 falta: 4, 5 e 6 ficam retidas.
      expect(amb.passagens.map((p) => p.sequencia)).toEqual([2]);

      await enviar(sessao, [c(0, 2, 3)]);
      expect(amb.passagens.map((p) => [p.sequencia, p.ordem, p.x, p.y, p.revisita])).toEqual([
        [2, 1, 0, 3, false],
        [3, 2, 0, 2, false],
        [4, 3, 0, 2, true],
        [5, 4, 1, 2, false],
        [6, 5, 0, 2, true],
      ]);
    });

    it('segue sem a lacuna que não é preenchida em alguns segundos', async () => {
      amb.prazoLacunaMs = 30;
      const servico = amb.novoServico();
      const sessao = await conectar(hello(), servico);
      await enviar(
        sessao,
        [mensagem('inicio_corrida', 1), mensagem('celula', 3), mensagem('fim_corrida', 4)],
        servico,
      );
      expect(corridaA().status).toBe('EM_ANDAMENTO');

      await dormir(60);
      await amb.esvaziar();
      expect(corridaA().status).toBe('CONCLUIDA');
      expect(amb.passagens.map((p) => p.sequencia)).toEqual([3]);
      expect(amb.encerramentos.get(corridaA().id)).toMatchObject({
        ultimaContigua: 1,
        faltantes: 1,
      });
    });
  });

  describe('energia e alerta (RF-85, RF-86)', () => {
    it('grava a série de energia e publica um alerta abaixo de 7,0 V', async () => {
      const sessao = await conectar();
      await enviar(sessao, [
        mensagem('inicio_corrida', 1),
        ...[8.2, 7.2, 6.9, 6.8].map((v, i) => mensagem('energia', i + 2, { tensao_v: v })),
      ]);

      expect(amb.leituras.map((l) => l.tensaoV)).toEqual([8.2, 7.2, 6.9, 6.8]);
      expect(publicados('alerta-tensao').map((p) => p.dados)).toEqual([
        { corridaId: corridaA().id, tensaoV: 6.9 },
      ]);
      expect(amb.progressoCompleto.get(corridaA().id)!.metricas).toMatchObject({
        tensaoInicialV: 8.2,
        tensaoFinalV: 6.8,
        cargaInicialPct: 87.5,
      });
    });
  });

  describe('snapshots (RF-80, CT-BE-11)', () => {
    it('45 células geram snapshots nas cortes da 20ª, da 40ª e no fim', async () => {
      const sessao = await conectar();
      const celulas = Array.from({ length: 45 }, (_, i) =>
        mensagem('celula', i + 2, { x: i % 4, y: Math.floor(i / 4) % 4 }),
      );
      await enviar(sessao, [
        mensagem('inicio_corrida', 1),
        ...celulas,
        mensagem('fim_corrida', 47),
      ]);

      expect(amb.snapshots.map((s) => s.sequenciaCorte)).toEqual([21, 41, 47]);
      expect(amb.snapshots.map((s) => s.celulasVisitadas)).toEqual([20, 40, 45]);
    });
  });

  describe('interrupção (RF-81)', () => {
    async function verificarEm(instante: number): Promise<void> {
      amb.relogio = instante;
      amb.corrida.verificarInterrupcoes();
      await amb.esvaziar();
    }

    it('desconexão: INTERROMPIDA (SEM_SINAL) 120 s depois; um lote tardio com o fim a conclui (CT-BE-13)', async () => {
      const sessao = await conectar();
      await enviar(sessao, [mensagem('inicio_corrida', 1, { tempo_ms: 1000 })]);

      amb.relogio = 2000;
      await amb.servico.encerrar(sessao);

      await verificarEm(2000 + 119_999);
      expect(corridaA().status).toBe('EM_ANDAMENTO');
      await verificarEm(2000 + 120_000);
      expect([corridaA().status, corridaA().motivo]).toEqual(['INTERROMPIDA', 'SEM_SINAL']);

      const depois = await conectar();
      await enviar(depois, [
        mensagem('celula', 2, { tempo_ms: 2000 }),
        mensagem('fim_corrida', 3, { tempo_ms: 95_500 }),
      ]);
      expect([corridaA().status, corridaA().motivo]).toEqual(['CONCLUIDA', 'SUCESSO']);
      expect(amb.encerramentos.get(corridaA().id)!.metricas.tempoConclusaoMs).toBe(94_500);
    });

    it('desconexão: aos 121 s do CT-BE-13 a corrida já está interrompida', async () => {
      const sessao = await conectar();
      await enviar(sessao, [mensagem('inicio_corrida', 1)]);
      await amb.servico.encerrar(sessao);

      await verificarEm(121_000);
      expect([corridaA().status, corridaA().motivo]).toEqual(['INTERROMPIDA', 'SEM_SINAL']);
    });

    it('silêncio com a conexão aberta: a perda é declarada aos 3 s, e a interrupção aos 123 s', async () => {
      const sessao = await conectar();
      await enviar(sessao, [mensagem('inicio_corrida', 1)]);

      amb.relogio = 3000;
      await amb.servico.verificarSilencio(sessao);

      await verificarEm(122_999);
      expect(corridaA().status).toBe('EM_ANDAMENTO');
      await verificarEm(123_000);
      expect([corridaA().status, corridaA().motivo]).toEqual(['INTERROMPIDA', 'SEM_SINAL']);
    });

    it('uma mensagem depois da perda zera a contagem', async () => {
      const sessao = await conectar();
      await enviar(sessao, [mensagem('inicio_corrida', 1)]);
      await amb.servico.encerrar(sessao);

      amb.relogio = 100_000;
      await enviar(await conectar(), [mensagem('celula', 2)]);

      await verificarEm(121_000);
      expect(corridaA().status).toBe('EM_ANDAMENTO');
    });

    it('nova conexão com outro boot: INTERROMPIDA (REINICIO_ROBO), definitiva (CT-BE-14)', async () => {
      const antes = await conectar();
      await enviar(antes, [mensagem('inicio_corrida', 1)]);

      await conectar(hello({ boot: 'b2' }));
      await amb.esvaziar();
      expect([corridaA().status, corridaA().motivo]).toEqual(['INTERROMPIDA', 'REINICIO_ROBO']);

      await enviar(antes, [mensagem('fim_corrida', 2)]);
      expect(corridaA().status).toBe('INTERROMPIDA');
      expect(amb.rejeicoes).toEqual([
        expect.objectContaining({ sequencia: 2, motivoCodigo: 'CORRIDA_FINALIZADA' }),
      ]);
      expect(amb.sequenciasGravadasDe('c-A')).toEqual([1]);
    });

    it('novo hello com outro boot na mesma conexão também interrompe', async () => {
      const sessao = await conectar();
      await enviar(sessao, [mensagem('inicio_corrida', 1), hello({ boot: 'b2' })]);
      expect([corridaA().status, corridaA().motivo]).toEqual(['INTERROMPIDA', 'REINICIO_ROBO']);
    });

    it('o mesmo boot reconectando não interrompe', async () => {
      const antes = await conectar();
      await enviar(antes, [mensagem('inicio_corrida', 1)]);
      await conectar();
      await amb.esvaziar();
      expect(corridaA().status).toBe('EM_ANDAMENTO');
    });
  });

  describe('recuperação após reinício do backend (RNF-52)', () => {
    it('recarrega as corridas em andamento com as métricas e o relógio do silêncio', async () => {
      const sessao = await conectar();
      amb.relogio = 10_000;
      await enviar(sessao, [
        mensagem('inicio_corrida', 1, { tempo_ms: 0 }),
        mensagem('celula', 2, { tempo_ms: 0 }),
        mensagem('celula', 3, { x: 0, y: 2, tempo_ms: 1800 }),
      ]);

      // O backend reinicia: serviços novos sobre os mesmos dados.
      const reiniciado = amb.novoServico();
      expect(await amb.corrida.recuperar()).toBe(1);

      const depois = await conectar(hello(), reiniciado);
      await enviar(depois, [mensagem('celula', 4, { x: 1, y: 2, tempo_ms: 3600 })], reiniciado);
      expect(amb.progressoCompleto.get(corridaA().id)!.metricas).toMatchObject({
        transicoes: 2,
        velocidadeMediaMps: 0.1,
      });
      expect(amb.passagens.map((p) => [p.sequencia, p.ordem])).toEqual([
        [2, 1],
        [3, 2],
        [4, 3],
      ]);
    });

    it('a interrupção por silêncio conta a partir da última mensagem gravada, e não do reinício', async () => {
      const sessao = await conectar();
      amb.relogio = 5000;
      await enviar(sessao, [mensagem('inicio_corrida', 1)]);

      amb.novoServico();
      amb.relogio = 5000 + 123_000;
      await amb.corrida.recuperar();
      amb.corrida.verificarInterrupcoes();
      await amb.esvaziar();
      expect([corridaA().status, corridaA().motivo]).toEqual(['INTERROMPIDA', 'SEM_SINAL']);
    });
  });

  describe('eventos para os painéis (#327)', () => {
    it('publica cada mensagem aplicada, com as métricas, e não publica nada na reconstrução', async () => {
      const sessao = await conectar();
      await enviar(sessao, [
        mensagem('inicio_corrida', 1),
        mensagem('celula', 2),
        mensagem('posicao', 3),
      ]);
      const aplicadas = publicados('mensagem-aplicada');
      expect(
        aplicadas.map((p) => (p.dados as { mensagem: { sequencia: number } }).mensagem.sequencia),
      ).toEqual([1, 2, 3]);

      amb.publicados.length = 0;
      amb.novoServico();
      await amb.corrida.recuperar();
      await amb.esvaziar();
      expect(amb.publicados).toHaveLength(0);
    });

    it('avisa a mudança do ranking só depois de gravar o encerramento (RF-95, CT-BE-28)', async () => {
      const gravadaAoAvisar: boolean[] = [];
      const original = amb.eventosPublicados.publicar;
      amb.eventosPublicados.publicar = (evento, dados) => {
        if (evento === 'ranking-alterado') {
          gravadaAoAvisar.push(amb.encerramentos.has((dados as { corridaId: string }).corridaId));
        }
        original(evento, dados);
      };
      const sessao = await conectar();
      await enviar(sessao, [mensagem('inicio_corrida', 1), mensagem('fim_corrida', 2)]);

      expect(publicados('ranking-alterado').map((p) => p.dados)).toEqual([
        { corridaId: corridaA().id, labirinto: '4x4' },
      ]);
      expect(gravadaAoAvisar).toEqual([true]);
    });

    it('não avisa o ranking numa corrida que falhou ou foi interrompida', async () => {
      const sessao = await conectar();
      await enviar(sessao, [
        mensagem('inicio_corrida', 1),
        mensagem('fim_corrida', 2, { resultado: 'falha' }),
      ]);
      expect(publicados('ranking-alterado')).toHaveLength(0);
    });

    it('não publica as mensagens reconstruídas que esperavam uma lacuna; só a que a preenche', async () => {
      const sessao = await conectar();
      await enviar(sessao, [
        mensagem('inicio_corrida', 1),
        mensagem('celula', 2),
        mensagem('celula', 4, { x: 0, y: 1 }),
        mensagem('celula', 5, { x: 0, y: 0 }),
      ]);

      amb.prazoLacunaMs = 30;
      const reiniciado = amb.novoServico();
      amb.publicados.length = 0;
      await amb.corrida.recuperar();
      await dormir(60);
      await amb.esvaziar();
      expect(amb.publicados).toHaveLength(0);

      // A lacuna foi abandonada após o reinício; uma mensagem nova é publicada normalmente.
      await enviar(await conectar(hello(), reiniciado), [mensagem('celula', 6)], reiniciado);
      const sequencias = publicados('mensagem-aplicada').map(
        (p) => (p.dados as { mensagem: { sequencia: number } }).mensagem.sequencia,
      );
      expect(sequencias).toEqual([6]);
    });

    it('após o reinício, a mensagem nova que preenche a lacuna é publicada, e as retidas não', async () => {
      const sessao = await conectar();
      await enviar(sessao, [
        mensagem('inicio_corrida', 1),
        mensagem('celula', 2),
        mensagem('celula', 4, { x: 0, y: 1 }),
      ]);

      const reiniciado = amb.novoServico();
      await amb.corrida.recuperar();
      amb.publicados.length = 0;
      await enviar(
        await conectar(hello(), reiniciado),
        [mensagem('celula', 3, { x: 0, y: 2 })],
        reiniciado,
      );
      const sequencias = publicados('mensagem-aplicada').map(
        (p) => (p.dados as { mensagem: { sequencia: number } }).mensagem.sequencia,
      );
      expect(sequencias).toEqual([3]);
    });
  });
});
