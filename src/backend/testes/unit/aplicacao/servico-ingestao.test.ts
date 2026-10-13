import { beforeEach, describe, expect, it } from 'vitest';
import type { SessaoRobo } from '../../../src/aplicacao/index.js';
import {
  AmbienteEmMemoria,
  DISPOSITIVO,
  assentar,
  hello,
  mensagem,
} from '../../apoio/ingestao-em-memoria.js';

describe('ServicoIngestao', () => {
  let amb: AmbienteEmMemoria;

  beforeEach(() => {
    amb = new AmbienteEmMemoria();
  });

  async function conectar(texto = hello(), servico = amb.servico): Promise<SessaoRobo> {
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
    await assentar();
  }

  describe('autenticação (RF-72)', () => {
    it('aceita dispositivo cadastrado e registra CONECTADO (CT-BE-01)', async () => {
      const sessao = await conectar();
      await enviar(sessao, [mensagem('inicio_corrida', 1)]);

      expect(amb.eventos[0]).toMatchObject({ tipo: 'CONECTADO', boot: 'b1' });
      expect(amb.corridas.get(`${DISPOSITIVO.id}/c-A`)?.labirinto).toBe('4x4');
      expect(amb.ultimoAck()).toEqual({ tipo: 'ack', corrida: 'c-A', sequencia: 1 });
    });

    it.each([
      ['token errado', hello({ token: 'T-ERRADO' }), 4001],
      ['dispositivo desconhecido', hello({ dispositivo: 'intruso' }), 4001],
      ['versão 99', hello({ versao: 99 }), 4002],
      ['mensagem de corrida no lugar do hello', mensagem('celula', 1), 4003],
      ['texto que não é JSON', 'olá', 4003],
    ])('recusa %s com o código %i (CT-BE-02)', async (_caso, texto, codigo) => {
      const resultado = await amb.servico.autenticar(texto, () => {});
      expect(resultado).toMatchObject({ ok: false, codigoFechamento: codigo });
      expect(amb.contadores.conexoesRecusadas).toBe(1);
      expect(amb.eventos).toHaveLength(0);
    });

    it('recusa dispositivo desativado', async () => {
      amb.dispositivos.get('sim-01')!.ativo = false;
      const resultado = await amb.servico.autenticar(hello(), () => {});
      expect(resultado).toMatchObject({ ok: false, codigoFechamento: 4001 });
    });
  });

  describe('validação de esquema (RF-75)', () => {
    it('rejeita sem gravar e segue processando a mensagem válida seguinte (CT-BE-05)', async () => {
      const sessao = await conectar();
      await enviar(sessao, [
        mensagem('inicio_corrida', 1),
        mensagem('celula', 2, { paredes: undefined }),
        'isto não é JSON',
        mensagem('teleporte', 3),
        mensagem('celula', 2),
      ]);

      expect(amb.sequenciasGravadasDe('c-A')).toEqual([1, 2]);
      expect(amb.rejeicoes.map((r) => r.motivoCodigo)).toEqual([
        'ESQUEMA_INVALIDO',
        'JSON_INVALIDO',
        'TIPO_DESCONHECIDO',
      ]);
      expect(amb.rejeicoes[0]).toMatchObject({ corridaRobo: 'c-A', sequencia: 2 });
      expect(amb.rejeicoes[0]!.detalhe).toContain('paredes');
      expect(amb.contadores.mensagensRejeitadas).toBe(3);
    });
  });

  describe('regras de domínio (RF-76)', () => {
    it('rejeita célula fora do labirinto e aceita a do limite (CT-BE-06)', async () => {
      const sessao = await conectar();
      await enviar(sessao, [
        mensagem('inicio_corrida', 1),
        mensagem('celula', 2, { x: 5, y: 2 }),
        mensagem('celula', 2, { x: 3, y: 3 }),
      ]);

      expect(amb.rejeicoes.map((r) => r.motivoCodigo)).toEqual(['COORDENADA_FORA_DO_LABIRINTO']);
      expect(amb.sequenciasGravadasDe('c-A')).toEqual([1, 2]);
    });

    it('rejeita labirinto inválido, tensão fora da faixa e tempo regressivo (CT-BE-07)', async () => {
      const sessao = await conectar();
      await enviar(sessao, [
        mensagem('inicio_corrida', 1, { corrida: 'c-X', labirinto: '5x5' }),
        mensagem('inicio_corrida', 1),
        mensagem('energia', 2, { tensao_v: 4.9 }),
        mensagem('energia', 2, { tensao_v: 9.1 }),
        mensagem('posicao', 20, { tempo_ms: 5000 }),
        mensagem('posicao', 21, { tempo_ms: 4900 }),
      ]);

      expect(amb.rejeicoes.map((r) => r.motivoCodigo)).toEqual([
        'ESQUEMA_INVALIDO',
        'TENSAO_FORA_DA_FAIXA',
        'TENSAO_FORA_DA_FAIXA',
        'TEMPO_REGRESSIVO',
      ]);
      expect(amb.sequenciasGravadasDe('c-A')).toEqual([1, 20]);
      expect(amb.corridas.has(`${DISPOSITIVO.id}/c-X`)).toBe(false);
    });
  });

  describe('idempotência e confirmação (RF-74, RF-77)', () => {
    it('confirma a duplicata sem gravar de novo (CT-BE-08)', async () => {
      const sessao = await conectar();
      await enviar(sessao, [mensagem('inicio_corrida', 1)]);
      amb.acks.length = 0;

      await enviar(sessao, [mensagem('celula', 2), mensagem('celula', 2), mensagem('celula', 2)]);

      expect(amb.sequenciasGravadasDe('c-A')).toEqual([1, 2]);
      expect(amb.contadores.mensagensDuplicadas).toBe(2);
      expect(amb.acks.length).toBeGreaterThanOrEqual(1);
      expect(amb.acks.every((ack) => ack.sequencia === 2)).toBe(true);
    });

    it('duplicata de mensagem ainda na fila de gravação recebe o ack já atualizado', async () => {
      const a = await conectar();
      await enviar(a, [mensagem('inicio_corrida', 1)]);
      const acksDeB: number[] = [];
      const resultado = await amb.servico.autenticar(hello(), (ack) => acksDeB.push(ack.sequencia));
      if (!resultado.ok) throw new Error('hello recusado');

      // As duas chegam no mesmo instante: a de B encontra a de A ainda sendo gravada.
      const deA = amb.servico.receber(a, mensagem('celula', 2));
      const deB = amb.servico.receber(resultado.sessao, mensagem('celula', 2));
      await Promise.all([deA, deB]);
      await assentar();

      expect(acksDeB).toEqual([2]);
      expect(amb.sequenciasGravadasDe('c-A')).toEqual([1, 2]);
    });

    it('o ack para na lacuna e avança quando ela é preenchida (HU-BE-03, CA3)', async () => {
      const sessao = await conectar();
      await enviar(sessao, [
        mensagem('inicio_corrida', 1),
        ...[2, 3, 4, 6, 7, 8].map((n) => mensagem('posicao', n)),
      ]);
      expect(amb.ultimoAck()?.sequencia).toBe(4);
      expect(amb.progresso.get('corrida-1')).toEqual({ ultimaContigua: 4, faltantes: 1 });

      await enviar(sessao, [mensagem('posicao', 5)]);
      expect(amb.ultimoAck()?.sequencia).toBe(8);
      expect(amb.progresso.get('corrida-1')).toEqual({ ultimaContigua: 8, faltantes: 0 });
    });

    it('reenvio do buffer após queda não duplica nem deixa lacuna (CT-BE-04)', async () => {
      const posicoes = (de: number, ate: number) =>
        Array.from({ length: ate - de + 1 }, (_, i) => mensagem('posicao', de + i));

      const antes = await conectar();
      await enviar(antes, [mensagem('inicio_corrida', 1), ...posicoes(2, 120)]);
      await amb.servico.encerrar(antes);

      // O robô reconecta com o mesmo boot e reenvia o buffer: 101 a 400.
      const depois = await conectar();
      await enviar(depois, posicoes(101, 400));

      expect(amb.sequenciasGravadasDe('c-A')).toHaveLength(400);
      expect(amb.contadores.mensagensDuplicadas).toBe(20);
      expect(amb.ultimoAck()?.sequencia).toBe(400);
      expect(amb.progresso.get('corrida-1')).toEqual({ ultimaContigua: 400, faltantes: 0 });
    });

    it('sem reenvio, a lacuna fica sinalizada (CT-BE-04, variante)', async () => {
      const sessao = await conectar();
      await enviar(sessao, [
        mensagem('inicio_corrida', 1),
        ...Array.from({ length: 119 }, (_, i) => mensagem('posicao', i + 2)),
        mensagem('posicao', 401),
      ]);

      expect(amb.ultimoAck()?.sequencia).toBe(120);
      expect(amb.progresso.get('corrida-1')).toEqual({ ultimaContigua: 120, faltantes: 280 });
    });

    it('não confirma a mensagem cuja gravação falhou e a aceita no reenvio', async () => {
      const sessao = await conectar();
      await enviar(sessao, [mensagem('inicio_corrida', 1)]);
      amb.acks.length = 0;

      amb.falhaNaGravacao = new Error('banco fora do ar');
      await enviar(sessao, [mensagem('celula', 2)]);
      expect(amb.acks).toHaveLength(0);
      expect(amb.sequenciasGravadasDe('c-A')).toEqual([1]);

      await enviar(sessao, [mensagem('celula', 2)]);
      expect(amb.ultimoAck()?.sequencia).toBe(2);
      expect(amb.contadores.mensagensDuplicadas).toBe(0);
    });
  });

  describe('criação da corrida (RF-78)', () => {
    it('cria uma única corrida mesmo com o inicio_corrida reenviado (CT-BE-09)', async () => {
      const sessao = await conectar();
      await enviar(sessao, [mensagem('inicio_corrida', 1), mensagem('inicio_corrida', 1)]);
      expect(amb.corridas.size).toBe(1);
    });

    it('cria a corrida quando a primeira mensagem não é o inicio_corrida', async () => {
      const sessao = await conectar();
      await enviar(sessao, [mensagem('celula', 5, { corrida: 'c-B', x: 11, y: 0 })]);

      expect(amb.corridas.get(`${DISPOSITIVO.id}/c-B`)?.labirinto).toBeNull();
      expect(amb.sequenciasGravadasDe('c-B')).toEqual([5]);
      expect(amb.ultimoAck()).toEqual({ tipo: 'ack', corrida: 'c-B', sequencia: 0 });
    });

    it('preenche o labirinto quando o inicio_corrida chega depois, num reenvio', async () => {
      const sessao = await conectar();
      await enviar(sessao, [
        mensagem('celula', 2, { corrida: 'c-B' }),
        mensagem('inicio_corrida', 1, { corrida: 'c-B', labirinto: '8x4' }),
        mensagem('celula', 3, { corrida: 'c-B', x: 9, y: 0 }),
      ]);

      expect(amb.corridas.get(`${DISPOSITIVO.id}/c-B`)?.labirinto).toBe('8x4');
      expect(amb.rejeicoes.map((r) => r.motivoCodigo)).toEqual(['COORDENADA_FORA_DO_LABIRINTO']);
      expect(amb.sequenciasGravadasDe('c-B')).toEqual([1, 2]);
    });
  });

  describe('recuperação após reinício do backend (RNF-52)', () => {
    it('reconstrói as sequências a partir do banco', async () => {
      const antes = await conectar();
      await enviar(antes, [
        mensagem('inicio_corrida', 1),
        mensagem('celula', 2),
        mensagem('celula', 3),
      ]);

      const reiniciado = amb.novoServico();
      const depois = await conectar(hello(), reiniciado);
      amb.acks.length = 0;
      amb.contadores.mensagensDuplicadas = 0;
      await enviar(depois, [mensagem('celula', 3), mensagem('posicao', 4)], reiniciado);

      expect(amb.sequenciasGravadasDe('c-A')).toEqual([1, 2, 3, 4]);
      expect(amb.contadores.mensagensDuplicadas).toBe(1);
      expect(amb.ultimoAck()?.sequencia).toBe(4);
    });
  });

  describe('perda de sinal (RF-73)', () => {
    it('declara o sinal perdido após 3 s de silêncio durante a corrida e retoma na mensagem seguinte', async () => {
      const sessao = await conectar();
      await enviar(sessao, [mensagem('inicio_corrida', 1)]);
      amb.eventos.length = 0;

      amb.relogio = 2999;
      await amb.servico.verificarSilencio(sessao);
      expect(amb.eventos).toHaveLength(0);

      amb.relogio = 3000;
      await amb.servico.verificarSilencio(sessao);
      await amb.servico.verificarSilencio(sessao);
      expect(amb.eventos).toEqual([{ tipo: 'SINAL_PERDIDO', corridaId: 'corrida-1', boot: 'b1' }]);

      await enviar(sessao, [mensagem('posicao', 2)]);
      expect(amb.eventos.at(-1)?.tipo).toBe('SINAL_RETOMADO');
    });

    it('não acusa perda de sinal fora de uma corrida', async () => {
      const sessao = await conectar();
      amb.relogio = 60_000;
      await amb.servico.verificarSilencio(sessao);
      expect(amb.eventos.map((e) => e.tipo)).toEqual(['CONECTADO']);

      await enviar(sessao, [mensagem('inicio_corrida', 1), mensagem('fim_corrida', 2)]);
      amb.relogio = 120_000;
      await amb.servico.verificarSilencio(sessao);
      expect(amb.eventos.map((e) => e.tipo)).toEqual(['CONECTADO']);
    });

    it('conexão fechada no meio da corrida conta como perda de sinal', async () => {
      const sessao = await conectar();
      await enviar(sessao, [mensagem('inicio_corrida', 1)]);
      await amb.servico.encerrar(sessao);
      expect(amb.eventos.map((e) => e.tipo)).toEqual([
        'CONECTADO',
        'SINAL_PERDIDO',
        'DESCONECTADO',
      ]);
    });
  });
});
