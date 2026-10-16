import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MensagemPainelSaida } from '../../../protocolo/tipos.js';
import {
  FECHAMENTO_PAINEL_LENTO,
  LIMITE_BUFFER_BYTES,
  PRAZO_PAINEL_LENTO_MS,
  ServicoDistribuicao,
  type ConexaoPainel,
  type EstadoAoVivo,
  type MapaEventos,
  type SessaoRobo,
} from '../../../src/aplicacao/index.js';
import { CONFIGURACAO_PADRAO, DerivacaoCorrida } from '../../../src/dominio/index.js';
import { AmbienteEmMemoria, hello, mensagem } from '../../apoio/ingestao-em-memoria.js';

class ConexaoFalsa implements ConexaoPainel {
  recebidas: MensagemPainelSaida[] = [];
  /** Instante de cada mensagem recebida, pelo relógio do teste. */
  instantes: number[] = [];
  bytes = 0;
  fechada: { codigo: number; motivo: string } | null = null;
  constructor(private readonly relogio: () => number = () => 0) {}
  enviar(texto: string): void {
    this.recebidas.push(JSON.parse(texto) as MensagemPainelSaida);
    this.instantes.push(this.relogio());
  }
  /** Instantes em que chegaram as mensagens deste tipo. */
  instantesDe(tipo: MensagemPainelSaida['tipo']): number[] {
    return this.instantes.filter((_, i) => this.recebidas[i]!.tipo === tipo);
  }
  bytesPendentes(): number {
    return this.bytes;
  }
  fechar(codigo: number, motivo: string): void {
    this.fechada = { codigo, motivo };
  }
  doTipo<T extends MensagemPainelSaida['tipo']>(tipo: T) {
    return this.recebidas.filter(
      (m): m is Extract<MensagemPainelSaida, { tipo: T }> => m.tipo === tipo,
    );
  }
  celulas() {
    return this.recebidas.filter(
      (m): m is Extract<MensagemPainelSaida, { evento: 'celula' }> =>
        m.tipo === 'evento' && m.evento === 'celula',
    );
  }
}

describe('ServicoDistribuicao com o caminho completo (robô → painel)', () => {
  let amb: AmbienteEmMemoria;
  beforeEach(() => {
    amb = new AmbienteEmMemoria();
  });
  afterEach(() => amb.distribuicao.parar());

  async function conectarRobo(boot = 'b1'): Promise<SessaoRobo> {
    const r = await amb.servico.autenticar(hello({ boot }), () => {});
    if (!r.ok) throw new Error(r.motivo);
    return r.sessao;
  }
  async function enviar(sessao: SessaoRobo, textos: string[]): Promise<void> {
    for (const t of textos) await amb.servico.receber(sessao, t);
    await amb.esvaziar();
  }
  function painel() {
    const conexao = new ConexaoFalsa();
    return { conexao, painel: amb.distribuicao.conectar(conexao) };
  }
  const idDe = (idRobo: string) => amb.porIdRobo(idRobo).id;

  it('CT-BE-21: cada painel recebe só a sua corrida; o canal ao_vivo, só os resumos', async () => {
    const robo = await conectarRobo();
    await enviar(robo, [
      mensagem('inicio_corrida', 1, { corrida: 'A' }),
      mensagem('inicio_corrida', 1, { corrida: 'B' }),
    ]);

    const p1 = painel();
    const p2 = painel();
    const p3 = painel();
    amb.distribuicao.receber(p1.painel, { tipo: 'inscrever', corrida: idDe('A') });
    amb.distribuicao.receber(p2.painel, { tipo: 'inscrever', corrida: idDe('B') });
    amb.distribuicao.receber(p3.painel, { tipo: 'inscrever', canal: 'ao_vivo' });

    await enviar(robo, [
      mensagem('celula', 2, { corrida: 'A' }),
      mensagem('celula', 2, { corrida: 'B', x: 1 }),
    ]);
    expect(p1.conexao.celulas().map((c) => c.corrida)).toEqual([idDe('A')]);
    expect(p2.conexao.celulas().map((c) => c.corrida)).toEqual([idDe('B')]);
    expect(p3.conexao.celulas()).toHaveLength(0);
    // Quem entra no ao_vivo recebe as corridas que já estão acontecendo.
    expect(
      p3.conexao
        .doTipo('ao_vivo')
        .map((m) => m.corrida)
        .sort(),
    ).toEqual([idDe('A'), idDe('B')].sort());

    amb.distribuicao.receber(p1.painel, { tipo: 'cancelar', corrida: idDe('A') });
    await enviar(robo, [mensagem('celula', 3, { corrida: 'A', y: 2 })]);
    expect(p1.conexao.celulas()).toHaveLength(1);
  });

  it('CT-BE-22: quem entra no meio recebe o snapshot e, depois, só o que vem depois dele', async () => {
    const robo = await conectarRobo();
    const desdeOInicio = painel();
    await enviar(robo, [mensagem('inicio_corrida', 1, { labirinto: '12x4' })]);
    amb.distribuicao.receber(desdeOInicio.painel, { tipo: 'inscrever', corrida: idDe('c-A') });

    const celula = (n: number) =>
      mensagem('celula', n, {
        x: n % 12,
        y: Math.floor(n / 12) % 4,
        paredes: { norte: n % 2 === 0, leste: n % 3 === 0, sul: false, oeste: n % 5 === 0 },
      });
    await enviar(
      robo,
      Array.from({ length: 299 }, (_, i) => celula(i + 2)),
    );

    const atrasado = painel();
    amb.distribuicao.receber(atrasado.painel, { tipo: 'inscrever', corrida: idDe('c-A') });
    await enviar(
      robo,
      Array.from({ length: 200 }, (_, i) => celula(i + 301)),
    );

    const [snap] = atrasado.conexao.doTipo('snapshot');
    expect(snap!.sequencia_corte).toBe(300);
    expect(snap!.labirinto).toBe('12x4');
    const seguintes = atrasado.conexao.celulas().map((c) => c.sequencia);
    expect(seguintes[0]).toBe(301);
    expect(seguintes).toHaveLength(200);

    // O mapa do painel atrasado (snapshot + eventos) é idêntico ao de quem viu tudo.
    const mapa = (celulas: { x: number; y: number; paredes: object }[]) =>
      Object.fromEntries(celulas.map((c) => [`${c.x},${c.y}`, c.paredes]));
    const completo = mapa(desdeOInicio.conexao.celulas());
    const reconstruido = { ...mapa(snap!.mapa), ...mapa(atrasado.conexao.celulas()) };
    expect(reconstruido).toEqual(completo);
  });

  it('CT-BE-25: avisa a perda e a retomada de sinal a quem acompanha a corrida', async () => {
    const robo = await conectarRobo();
    await enviar(robo, [mensagem('inicio_corrida', 1)]);
    const p = painel();
    amb.distribuicao.receber(p.painel, { tipo: 'inscrever', corrida: idDe('c-A') });

    amb.relogio = 3000;
    await amb.servico.verificarSilencio(robo);
    await enviar(robo, [mensagem('posicao', 2)]);
    expect(p.conexao.doTipo('sinal')).toEqual([
      { tipo: 'sinal', corrida: idDe('c-A'), estado: 'PERDIDO' },
      { tipo: 'sinal', corrida: idDe('c-A'), estado: 'RETOMADO' },
    ]);
  });

  it('CT-BE-25: a conexão cai e o robô volta por outra; RETOMADO sai no hello, antes de qualquer mensagem', async () => {
    const antes = await conectarRobo();
    await enviar(antes, [mensagem('inicio_corrida', 1)]);
    const p = painel();
    amb.distribuicao.receber(p.painel, { tipo: 'inscrever', corrida: idDe('c-A') });

    await amb.servico.encerrar(antes);
    expect(p.conexao.doTipo('sinal').map((m) => m.estado)).toEqual(['PERDIDO']);

    const depois = await conectarRobo();
    expect(p.conexao.doTipo('sinal').map((m) => m.estado)).toEqual(['PERDIDO', 'RETOMADO']);
    expect(amb.eventos.filter((e) => e.tipo === 'SINAL_RETOMADO')).toEqual([
      { tipo: 'SINAL_RETOMADO', corridaId: idDe('c-A'), boot: 'b1' },
    ]);

    // A corrida é a ativa da conexão nova: o silêncio nela volta a ser perda de sinal.
    amb.relogio = 3000;
    await amb.servico.verificarSilencio(depois);
    expect(p.conexao.doTipo('sinal').map((m) => m.estado)).toEqual([
      'PERDIDO',
      'RETOMADO',
      'PERDIDO',
    ]);
  });

  it('a perda e a retomada saem uma vez só, mesmo com duas conexões do mesmo robô', async () => {
    const a = await conectarRobo();
    await enviar(a, [mensagem('inicio_corrida', 1)]);
    const p = painel();
    amb.distribuicao.receber(p.painel, { tipo: 'inscrever', corrida: idDe('c-A') });
    const b = await conectarRobo();
    await enviar(b, [mensagem('posicao', 2)]);

    amb.relogio = 3000;
    await amb.servico.verificarSilencio(a);
    await amb.servico.verificarSilencio(b);
    await enviar(b, [mensagem('posicao', 3)]);
    await enviar(a, [mensagem('posicao', 4)]);
    expect(p.conexao.doTipo('sinal').map((m) => m.estado)).toEqual(['PERDIDO', 'RETOMADO']);
  });

  it('a conexão antiga muda não gera perda falsa quando o robô já fala pela nova', async () => {
    const a = await conectarRobo();
    await enviar(a, [mensagem('inicio_corrida', 1)]);
    const p = painel();
    amb.distribuicao.receber(p.painel, { tipo: 'inscrever', corrida: idDe('c-A') });

    // A fica muda (socket meio aberto); 1 s depois o robô volta por B e envia mensagens.
    amb.relogio = 1000;
    const b = await conectarRobo();
    amb.relogio = 2000;
    await enviar(b, [mensagem('posicao', 2)]);
    // Aos 3 s, o monitor vê A muda: a declaração é de uma conexão antiga.
    amb.relogio = 3000;
    await amb.servico.verificarSilencio(a);
    // O fechamento atrasado de A também não é perda.
    await amb.servico.encerrar(a);
    expect(p.conexao.doTipo('sinal')).toEqual([]);

    // B é quem vigia a corrida agora: se B ficar muda, aí sim é perda.
    amb.relogio = 5000;
    await amb.servico.verificarSilencio(b);
    expect(p.conexao.doTipo('sinal').map((m) => m.estado)).toEqual(['PERDIDO']);
  });

  it('o hello pela conexão nova já basta: a antiga fechando depois não é perda', async () => {
    const a = await conectarRobo();
    await enviar(a, [mensagem('inicio_corrida', 1)]);
    const p = painel();
    amb.distribuicao.receber(p.painel, { tipo: 'inscrever', corrida: idDe('c-A') });

    amb.relogio = 1000;
    const b = await conectarRobo();
    amb.relogio = 1500;
    await amb.servico.encerrar(a);
    expect(p.conexao.doTipo('sinal')).toEqual([]);

    // A conexão nova assumiu a corrida mesmo sem mensagem nem perda anterior.
    amb.relogio = 4000;
    await amb.servico.verificarSilencio(b);
    expect(p.conexao.doTipo('sinal').map((m) => m.estado)).toEqual(['PERDIDO']);
  });

  it('com uma corrida abandonada do mesmo boot, a conexão nova vigia a mais recente e não segura a antiga', async () => {
    const a = await conectarRobo();
    await enviar(a, [mensagem('inicio_corrida', 1, { corrida: 'velha' })]);
    amb.relogio = 1000;
    await enviar(a, [mensagem('inicio_corrida', 1, { corrida: 'atual' })]);
    const p = painel();
    amb.distribuicao.receber(p.painel, { tipo: 'inscrever', corrida: idDe('atual') });
    await amb.servico.encerrar(a);

    amb.relogio = 2000;
    const b = await conectarRobo();
    amb.relogio = 6000;
    await amb.servico.verificarSilencio(b);
    expect(p.conexao.doTipo('sinal').map((m) => m.estado)).toEqual([
      'PERDIDO',
      'RETOMADO',
      'PERDIDO',
    ]);

    // O hello não renovou a corrida abandonada: ela é interrompida aos 123 s da última mensagem.
    amb.relogio = 123_000;
    amb.corrida.verificarInterrupcoes();
    await amb.esvaziar();
    expect(amb.porIdRobo('velha').status).toBe('INTERROMPIDA');
  });

  it('o snapshot diz se o sinal está perdido', async () => {
    const robo = await conectarRobo();
    await enviar(robo, [mensagem('inicio_corrida', 1)]);
    await amb.servico.encerrar(robo);

    const p = painel();
    amb.distribuicao.receber(p.painel, { tipo: 'inscrever', corrida: idDe('c-A') });
    expect(p.conexao.doTipo('snapshot')[0]).toMatchObject({ sinal: 'PERDIDO' });

    await conectarRobo();
    const outro = painel();
    amb.distribuicao.receber(outro.painel, { tipo: 'inscrever', corrida: idDe('c-A') });
    expect(outro.conexao.doTipo('snapshot')[0]).toMatchObject({ sinal: 'NORMAL' });
  });

  it('um robô reiniciado (outro boot) não retoma o sinal: a corrida é interrompida', async () => {
    const antes = await conectarRobo('b1');
    await enviar(antes, [mensagem('inicio_corrida', 1)]);
    const p = painel();
    amb.distribuicao.receber(p.painel, { tipo: 'inscrever', corrida: idDe('c-A') });
    await amb.servico.encerrar(antes);

    await conectarRobo('b2');
    await amb.esvaziar();
    expect(p.conexao.doTipo('sinal').map((m) => m.estado)).toEqual(['PERDIDO']);
    expect(p.conexao.doTipo('evento').at(-1)).toMatchObject({ status: 'INTERROMPIDA' });
  });

  it('status final aos inscritos e ao canal ao_vivo, e aviso de ranking ao concluir', async () => {
    const robo = await conectarRobo();
    const inscrito = painel();
    const canal = painel();
    amb.distribuicao.receber(canal.painel, { tipo: 'inscrever', canal: 'ao_vivo' });
    await enviar(robo, [mensagem('inicio_corrida', 1, { labirinto: '8x4' })]);
    amb.distribuicao.receber(inscrito.painel, { tipo: 'inscrever', corrida: idDe('c-A') });
    await enviar(robo, [mensagem('fim_corrida', 2, { tempo_ms: 9000 })]);

    expect(inscrito.conexao.doTipo('evento').at(-1)).toMatchObject({
      evento: 'status',
      status: 'CONCLUIDA',
      motivo_termino: 'SUCESSO',
      sequencia: 2,
      tempo_ms: 9000,
    });
    expect(canal.conexao.doTipo('ao_vivo').map((m) => m.status)).toEqual([
      'EM_ANDAMENTO',
      'CONCLUIDA',
    ]);
    expect(canal.conexao.doTipo('leaderboard')).toEqual([
      { tipo: 'leaderboard', labirinto: '8x4' },
    ]);
    // Só o canal recebe o aviso de ranking: o inscrito só na corrida, não (RF-88).
    expect(inscrito.conexao.doTipo('leaderboard')).toEqual([]);
  });

  it('a interrupção chega com sequência nula, para o painel não descartá-la', async () => {
    const robo = await conectarRobo();
    await enviar(robo, [mensagem('inicio_corrida', 1)]);
    const p = painel();
    amb.distribuicao.receber(p.painel, { tipo: 'inscrever', corrida: idDe('c-A') });
    await conectarRobo('b2');
    await amb.esvaziar();
    expect(p.conexao.doTipo('evento').at(-1)).toMatchObject({
      evento: 'status',
      status: 'INTERROMPIDA',
      motivo_termino: 'REINICIO_ROBO',
      sequencia: null,
    });
  });

  it('alerta de tensão baixa aos inscritos', async () => {
    const robo = await conectarRobo();
    await enviar(robo, [mensagem('inicio_corrida', 1)]);
    const p = painel();
    amb.distribuicao.receber(p.painel, { tipo: 'inscrever', corrida: idDe('c-A') });
    await enviar(robo, [mensagem('energia', 2, { tensao_v: 6.9 })]);
    expect(p.conexao.doTipo('alerta')).toEqual([
      { tipo: 'alerta', corrida: idDe('c-A'), alerta: 'TENSAO_BAIXA', tensao_v: 6.9 },
    ]);
  });

  it('ignora a inscrição numa corrida que não está carregada', () => {
    const p = painel();
    amb.distribuicao.receber(p.painel, {
      tipo: 'inscrever',
      corrida: '0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33',
    });
    expect(p.conexao.recebidas).toEqual([]);
  });
});

describe('ServicoDistribuicao: ritmo dos contínuos e painéis lentos', () => {
  const CORRIDA = 'corrida-1';
  let agora: number;
  let distribuicao: ServicoDistribuicao;
  const derivacao = new DerivacaoCorrida('4x4', CONFIGURACAO_PADRAO);
  const estado: EstadoAoVivo = {
    corridaId: CORRIDA,
    labirinto: '4x4',
    sequenciaCorte: 0,
    tempoInicioMs: 0,
    mapa: { celulas: [], posicao: null },
    metricas: derivacao.metricas,
    sinalPerdido: false,
    status: 'EM_ANDAMENTO',
    motivo: null,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    agora = 0;
    distribuicao = new ServicoDistribuicao({
      corridas: { estadoAoVivo: () => estado, corridasEmAndamento: () => [estado] },
      log: { info: () => {}, warn: () => {}, error: () => {} },
      agora: () => agora,
    });
  });
  afterEach(() => {
    distribuicao.parar();
    vi.useRealTimers();
  });

  const aplicada = (m: Record<string, unknown>): MapaEventos['mensagem-aplicada'] => ({
    corridaId: CORRIDA,
    labirinto: '4x4',
    mensagem: { versao: 1, corrida: 'r1', ...m } as MapaEventos['mensagem-aplicada']['mensagem'],
    revisita: false,
    metricas: derivacao.metricas,
  });
  const posicao = (sequencia: number, x: number) =>
    aplicada({
      tipo: 'posicao',
      sequencia,
      tempo_ms: sequencia * 20,
      x,
      y: 0,
      orientacao: 'LESTE',
      celulas: x,
    });
  const celula = (sequencia: number) =>
    aplicada({
      tipo: 'celula',
      sequencia,
      tempo_ms: sequencia * 20,
      x: 0,
      y: 0,
      paredes: { norte: true, leste: false, sul: false, oeste: true },
    });
  async function avancar(ms: number) {
    agora += ms;
    await vi.advanceTimersByTimeAsync(ms);
  }
  /** Maior número de instantes numa janela de 1 s (CT-BE-23: nunca mais de 10). */
  function maiorJanelaDe1s(instantes: number[]): number {
    return Math.max(
      0,
      ...instantes.map((t) => instantes.filter((u) => u >= t && u < t + 1000).length),
    );
  }
  function inscrito() {
    const conexao = new ConexaoFalsa(() => agora);
    const painel = distribuicao.conectar(conexao);
    distribuicao.receber(painel, { tipo: 'inscrever', corrida: CORRIDA });
    return conexao;
  }

  it('CT-BE-23: 50 posições/s viram no máximo 10 contínuos/s, sempre com a mais recente; as células chegam todas', async () => {
    const p = inscrito();
    let seq = 0;
    for (let i = 0; i < 50; i++) {
      distribuicao.aoAplicar(posicao(++seq, i));
      // No meio do segundo, 5 células em 100 ms.
      if (i >= 20 && i < 25) distribuicao.aoAplicar(celula(++seq));
      await avancar(20);
    }
    await avancar(200);

    const continuos = p.doTipo('continuo');
    expect(continuos.length).toBeGreaterThanOrEqual(9);
    expect(maiorJanelaDe1s(p.instantesDe('continuo'))).toBeLessThanOrEqual(10);
    expect(continuos.at(-1)!.posicao).toMatchObject({ x: 49 });
    expect(p.celulas().map((c) => c.sequencia)).toEqual([22, 24, 26, 28, 30]);
  });

  it('cada contínuo leva a última posição e a última energia conhecidas', async () => {
    const p = inscrito();
    distribuicao.aoAplicar(posicao(1, 1));
    await avancar(150);
    distribuicao.aoAplicar(
      aplicada({
        tipo: 'energia',
        sequencia: 2,
        tempo_ms: 40,
        tensao_v: 8,
        corrente_a: 0.4,
        potencia_w: 3.2,
      }),
    );
    await avancar(150);
    const [primeiro, segundo] = p.doTipo('continuo');
    expect(primeiro).toMatchObject({ posicao: { x: 1 }, energia: null });
    expect(segundo).toMatchObject({ posicao: { x: 1 }, energia: { tensao_v: 8 } });
  });

  const fim = (status: 'CONCLUIDA' | 'FALHOU' = 'CONCLUIDA') =>
    distribuicao.aoMudarStatus({
      corridaId: CORRIDA,
      labirinto: '4x4',
      status,
      motivo: status === 'CONCLUIDA' ? 'SUCESSO' : 'FALHA_REPORTADA',
      detalhe: null,
      sequencia: 99,
      tempoMs: 9000,
      metricas: derivacao.metricas,
    });

  it('o fim da corrida não fura o limite de 10/s: o último contínuo sai depois do status, no seu tempo', async () => {
    const p = inscrito();
    for (let i = 0; i < 10; i++) {
      distribuicao.aoAplicar(posicao(i + 1, i));
      await avancar(100);
    }
    distribuicao.aoAplicar(posicao(11, 10));
    await avancar(30);
    distribuicao.aoAplicar(posicao(12, 11));
    fim();
    await avancar(200);

    expect(maiorJanelaDe1s(p.instantesDe('continuo'))).toBeLessThanOrEqual(10);
    expect(p.doTipo('continuo').at(-1)!.posicao).toMatchObject({ x: 11 });
  });

  it('o contínuo que sai depois do status final leva as métricas do status (RF-87)', async () => {
    const p = inscrito();
    distribuicao.aoAplicar(posicao(1, 1));
    await avancar(30);
    distribuicao.aoAplicar(posicao(2, 2));
    const finais = { ...derivacao.metricas, tempoConclusaoMs: 9000, tempoDecorridoMs: 9000 };
    distribuicao.aoMudarStatus({
      corridaId: CORRIDA,
      labirinto: '4x4',
      status: 'CONCLUIDA',
      motivo: 'SUCESSO',
      detalhe: null,
      sequencia: 3,
      tempoMs: 9000,
      metricas: finais,
    });
    await avancar(200);

    const ultimo = p.doTipo('continuo').at(-1)!;
    const status = p.doTipo('evento').at(-1)!;
    // O contínuo agendado saiu depois do status, com a posição final e as métricas finais.
    expect(p.recebidas.indexOf(ultimo)).toBeGreaterThan(p.recebidas.indexOf(status));
    expect(ultimo.posicao).toMatchObject({ x: 2 });
    expect(ultimo.metricas).toEqual(status.metricas);
    expect(ultimo.metricas.tempo_conclusao_ms).toBe(9000);
  });

  it('o temporizador que dispara antes do intervalo é reagendado, sem enviar antes da hora', async () => {
    const p = inscrito();
    distribuicao.aoAplicar(posicao(1, 1));
    distribuicao.aoAplicar(posicao(2, 2));
    // O temporizador dispara aos 100 ms do relógio do Node, mas o monotônico marca 99.
    agora += 99;
    await vi.advanceTimersByTimeAsync(100);
    expect(p.doTipo('continuo')).toHaveLength(1);
    await avancar(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(p.instantesDe('continuo')).toEqual([0, 100]);
  });

  it('o primeiro contínuo de uma corrida já em andamento leva a posição conhecida, mesmo se for de energia', async () => {
    estado.mapa = { celulas: [], posicao: { x: 2, y: 1, orientacao: 'SUL' } };
    try {
      const p = inscrito();
      distribuicao.aoAplicar(
        aplicada({
          tipo: 'energia',
          sequencia: 5,
          tempo_ms: 100,
          tensao_v: 8,
          corrente_a: 0.4,
          potencia_w: 3.2,
        }),
      );
      expect(p.doTipo('continuo')[0]).toMatchObject({
        posicao: { x: 2, y: 1, orientacao: 'SUL' },
        energia: { tensao_v: 8 },
      });
    } finally {
      estado.mapa = { celulas: [], posicao: null };
    }
  });

  it('descarta o estado contínuo da corrida depois do fim', async () => {
    inscrito();
    distribuicao.aoAplicar(posicao(1, 1));
    fim('FALHOU');
    await avancar(200);
    const interno = distribuicao as unknown as { continuos: Map<string, unknown> };
    expect(interno.continuos.size).toBe(0);
  });

  it('anuncia no ao_vivo uma corrida cujo inicio_corrida se perdeu, na primeira mensagem', () => {
    const canal = new ConexaoFalsa();
    distribuicao.receber(distribuicao.conectar(canal), { tipo: 'inscrever', canal: 'ao_vivo' });
    canal.recebidas.length = 0;
    distribuicao.aoAplicar(celula(3));
    distribuicao.aoAplicar(celula(4));
    expect(canal.doTipo('ao_vivo')).toEqual([
      { tipo: 'ao_vivo', corrida: CORRIDA, labirinto: '4x4', status: 'EM_ANDAMENTO' },
    ]);
  });

  it('não reenvia o contínuo se nada mudou', async () => {
    const p = inscrito();
    distribuicao.aoAplicar(posicao(1, 1));
    await avancar(500);
    distribuicao.aoMudarStatus({
      corridaId: CORRIDA,
      labirinto: '4x4',
      status: 'FALHOU',
      motivo: 'FALHA_REPORTADA',
      detalhe: null,
      sequencia: 2,
      tempoMs: 40,
      metricas: derivacao.metricas,
    });
    expect(p.doTipo('continuo')).toHaveLength(1);
  });

  it('o contínuo junta a posição e a energia mais recentes', async () => {
    const p = inscrito();
    distribuicao.aoAplicar(posicao(1, 1));
    distribuicao.aoAplicar(
      aplicada({
        tipo: 'energia',
        sequencia: 2,
        tempo_ms: 40,
        tensao_v: 8,
        corrente_a: 0.4,
        potencia_w: 3.2,
      }),
    );
    distribuicao.aoAplicar(posicao(3, 2));
    await avancar(150);
    const ultimo = p.doTipo('continuo').at(-1)!;
    expect(ultimo.posicao).toMatchObject({ x: 2 });
    expect(ultimo.energia).toEqual({ tensao_v: 8, corrente_a: 0.4, potencia_w: 3.2 });
  });

  it('CT-BE-24: painel lento perde os contínuos, mantém os eventos e cai após 10 s; os outros seguem', async () => {
    const lento = inscrito();
    const normal = inscrito();
    lento.bytes = LIMITE_BUFFER_BYTES + 1;
    distribuicao.verificarPaineis();

    distribuicao.aoAplicar(posicao(1, 1));
    distribuicao.aoAplicar(celula(2));
    await avancar(150);
    expect(lento.doTipo('continuo')).toHaveLength(0);
    expect(lento.celulas()).toHaveLength(1);
    expect(normal.doTipo('continuo')).toHaveLength(1);

    await avancar(PRAZO_PAINEL_LENTO_MS);
    distribuicao.verificarPaineis();
    expect(lento.fechada).toEqual({ codigo: FECHAMENTO_PAINEL_LENTO, motivo: 'painel lento' });
    expect(normal.fechada).toBeNull();

    distribuicao.aoAplicar(celula(3));
    expect(normal.celulas()).toHaveLength(2);
    expect(lento.celulas()).toHaveLength(1);
  });

  it('o painel que se recupera volta a receber os contínuos', async () => {
    const p = inscrito();
    p.bytes = LIMITE_BUFFER_BYTES + 1;
    distribuicao.verificarPaineis();
    p.bytes = 0;
    distribuicao.verificarPaineis();
    distribuicao.aoAplicar(posicao(1, 1));
    await avancar(150);
    expect(p.doTipo('continuo')).toHaveLength(1);
  });

  it('keepalive para todos os painéis a cada verificação', () => {
    const conexao = new ConexaoFalsa();
    distribuicao.conectar(conexao);
    distribuicao.verificarPaineis();
    distribuicao.verificarPaineis();
    expect(conexao.doTipo('keepalive')).toHaveLength(2);
  });
});
