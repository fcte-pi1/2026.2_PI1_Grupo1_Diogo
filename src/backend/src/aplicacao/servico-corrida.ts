/**
 * ServicoCorrida — o que acontece com uma corrida depois que as mensagens são gravadas
 * (RF-78 a RF-87):
 *  - aplica as mensagens à derivação em ordem de sequência contígua (arquitetura §4.1);
 *  - grava as projeções (trajeto, energia, snapshots) e o progresso da corrida;
 *  - encerra a corrida no `fim_corrida`, ou a interrompe por silêncio ou reinício;
 *  - publica os eventos para a distribuição aos painéis (#327);
 *  - reconstrói o estado a partir do banco quando o backend reinicia (RNF-52).
 */
import {
  CONFIGURACAO_PADRAO,
  DerivacaoCorrida,
  SequenciaCorrida,
  type ConfiguracaoDerivacao,
  type Efeito,
  type MensagemDerivavel,
} from '../dominio/index.js';
import type { MensagemCorrida } from '../../protocolo/tipos.js';
import type { EstadoCorrida } from './estado.js';
import type { PublicadorEventos } from './eventos.js';
import { INTERRUPCAO_APOS_PERDA_MS, LIMITE_SILENCIO_MS } from './prazos.js';
import type {
  CorridaPersistida,
  RegistroLog,
  RepositorioCorridas,
  RepositorioProjecoes,
} from './portas.js';

/** Tempo de espera por uma lacuna antes de aplicar as mensagens seguintes sem ela. */
export const PRAZO_LACUNA_MS = 5000;
/** Intervalo mínimo entre duas gravações do progresso de uma corrida em andamento. */
export const INTERVALO_PROGRESSO_MS = 1000;

export interface DependenciasCorrida {
  corridas: RepositorioCorridas;
  projecoes: RepositorioProjecoes;
  eventos: PublicadorEventos;
  log: RegistroLog;
  configuracao?: ConfiguracaoDerivacao;
  agora?: () => number;
  prazoLacunaMs?: number;
}

export interface IdentificacaoCorrida {
  dispositivoId: string;
  boot: string;
  versaoProtocolo: number;
}

export class ServicoCorrida {
  /** Corridas em carregamento ou carregadas, por dispositivo e id do robô. */
  private readonly carregando = new Map<string, Promise<EstadoCorrida>>();
  private readonly carregadas = new Map<string, EstadoCorrida>();
  private readonly agora: () => number;
  private readonly configuracao: ConfiguracaoDerivacao;
  private readonly prazoLacunaMs: number;

  constructor(private readonly deps: DependenciasCorrida) {
    this.agora = deps.agora ?? Date.now;
    this.configuracao = deps.configuracao ?? CONFIGURACAO_PADRAO;
    this.prazoLacunaMs = deps.prazoLacunaMs ?? PRAZO_LACUNA_MS;
  }

  /** Estado da corrida: da memória, ou criado/reconstruído a partir do banco (RF-78). */
  obter(id: IdentificacaoCorrida, mensagem: MensagemCorrida): Promise<EstadoCorrida> {
    const chave = chaveDe(id.dispositivoId, mensagem.corrida);
    let carregando = this.carregando.get(chave);
    if (!carregando) {
      carregando = this.carregar(id, mensagem);
      this.carregando.set(chave, carregando);
      // Uma falha ao carregar não pode ficar guardada: a próxima mensagem tenta de novo.
      carregando.catch(() => this.carregando.delete(chave));
    }
    return carregando;
  }

  /** A mensagem foi gravada no banco: aplica-a, junto com as que esperavam por ela. */
  gravada(corrida: EstadoCorrida, mensagem: MensagemCorrida): void {
    // Sequência anterior a uma lacuna já desistida: fica no registro bruto, mas não muda
    // mais a derivação.
    if (mensagem.sequencia < corrida.proximaAplicar) return;
    corrida.retidas.set(mensagem.sequencia, mensagem);
    this.aplicarDisponiveis(corrida);
    this.agendarProgresso(corrida);
  }

  /** O `inicio_corrida` chegou: grava o labirinto se a corrida foi criada sem ele. */
  async definirLabirinto(
    corrida: EstadoCorrida,
    inicio: Extract<MensagemCorrida, { tipo: 'inicio_corrida' }>,
  ): Promise<void> {
    if (corrida.labirinto !== null) return;
    corrida.labirinto = inicio.labirinto;
    await this.deps.corridas.definirInicio(corrida.id, inicio.labirinto, inicio.tempo_ms);
  }

  registrarAtividade(corrida: EstadoCorrida): void {
    corrida.ultimaMensagemEm = this.agora();
    corrida.sinalPerdidoEm = null;
  }

  /** A ingestão declarou o sinal perdido em `em`: os 120 s da interrupção contam daí. */
  sinalPerdido(corrida: EstadoCorrida, em: number): void {
    corrida.sinalPerdidoEm ??= em;
  }

  /**
   * O robô se identificou com outro `boot`: as corridas em andamento do mesmo dispositivo
   * iniciadas com o `boot` anterior viram INTERROMPIDA (REINICIO_ROBO) — RF-81, CA1.
   */
  reinicioDetectado(dispositivoId: string, bootNovo: string): void {
    for (const corrida of this.carregadas.values()) {
      if (corrida.dispositivoId !== dispositivoId || corrida.boot === bootNovo) continue;
      this.executar(corrida, corrida.derivacao.interromper('REINICIO_ROBO'));
    }
  }

  /**
   * Chamado a cada segundo: interrompe as corridas 120 s depois da perda de sinal (RF-81,
   * CA4). Sem a perda registrada (corrida recuperada após um reinício do backend, ou ainda
   * não verificada pela ingestão), a perda conta a partir da última mensagem + 3 s.
   */
  verificarInterrupcoes(): void {
    const agora = this.agora();
    for (const corrida of this.carregadas.values()) {
      if (corrida.derivacao.status !== 'EM_ANDAMENTO') continue;
      const perdidoEm = corrida.sinalPerdidoEm ?? corrida.ultimaMensagemEm + LIMITE_SILENCIO_MS;
      if (agora - perdidoEm < INTERRUPCAO_APOS_PERDA_MS) continue;
      this.deps.log.info({ corrida: corrida.id }, 'corrida interrompida por falta de sinal');
      this.executar(corrida, corrida.derivacao.interromper('SEM_SINAL'));
    }
  }

  /**
   * Carrega as corridas que estavam em andamento quando o backend parou (RNF-52), para que
   * a interrupção por silêncio e a detecção de reinício continuem valendo para elas.
   */
  async recuperar(): Promise<number> {
    const emAndamento = await this.deps.corridas.corridasEmAndamento();
    for (const corrida of emAndamento) {
      const id = {
        dispositivoId: corrida.dispositivoId,
        boot: corrida.boot,
        versaoProtocolo: corrida.versaoProtocolo,
      };
      const estado = await this.obterPorId(id, corrida.idCorridaRobo);
      // O relógio do silêncio continua de onde parou, e não do instante da recuperação.
      estado.ultimaMensagemEm = corrida.ultimaMensagemEm ?? this.agora();
    }
    return emAndamento.length;
  }

  /** Espera todos os efeitos pendentes serem gravados (testes e encerramento). */
  async esvaziar(): Promise<void> {
    for (const corrida of this.carregadas.values()) {
      this.gravarProgresso(corrida);
      await corrida.efeitos;
    }
  }

  // -------------------------------------------------------------------------

  private obterPorId(id: IdentificacaoCorrida, idCorridaRobo: string): Promise<EstadoCorrida> {
    // Mensagem mínima, só para identificar a corrida: não é aplicada.
    return this.obter(id, { tipo: 'estado', corrida: idCorridaRobo } as MensagemCorrida);
  }

  private async carregar(
    id: IdentificacaoCorrida,
    mensagem: MensagemCorrida,
  ): Promise<EstadoCorrida> {
    const inicio = mensagem.tipo === 'inicio_corrida' ? mensagem : null;
    const persistida = await this.deps.corridas.obterOuCriar({
      dispositivoId: id.dispositivoId,
      idCorridaRobo: mensagem.corrida,
      boot: id.boot,
      versaoProtocolo: id.versaoProtocolo,
      labirinto: inicio?.labirinto ?? null,
      tempoInicioRoboMs: inicio?.tempo_ms ?? null,
    });
    const corrida = this.novoEstado(id.dispositivoId, mensagem.corrida, persistida);
    await this.reconstruir(corrida, persistida);
    this.carregadas.set(chaveDe(id.dispositivoId, mensagem.corrida), corrida);
    return corrida;
  }

  private novoEstado(
    dispositivoId: string,
    idRobo: string,
    persistida: CorridaPersistida,
  ): EstadoCorrida {
    return {
      id: persistida.id,
      dispositivoId,
      idRobo,
      boot: persistida.boot,
      labirinto: persistida.labirinto,
      sequencias: new SequenciaCorrida(),
      derivacao: new DerivacaoCorrida(persistida.labirinto, this.configuracao),
      retidas: new Map(),
      fimRecebido: false,
      reconstruidas: new Set(),
      proximaAplicar: 1,
      ultimaMensagemEm: this.agora(),
      sinalPerdidoEm: null,
      aguardandoGravacao: new Set(),
      efeitos: Promise.resolve(),
      temporizadorLacuna: null,
      progressoGravadoEm: 0,
      temporizadorProgresso: null,
    };
  }

  /** Reaplica as mensagens gravadas para chegar ao mesmo estado de antes (RNF-52). */
  private async reconstruir(corrida: EstadoCorrida, persistida: CorridaPersistida): Promise<void> {
    const gravadas = await this.deps.corridas.mensagensGravadas(corrida.id);
    for (const { sequencia, tempoMs, payload } of gravadas) {
      corrida.sequencias.aceitar(sequencia, tempoMs);
      corrida.sequencias.confirmar(sequencia);
      corrida.retidas.set(sequencia, payload as MensagemCorrida);
      // Marcadas por mensagem, e não por uma flag do serviço: as que esperam uma lacuna são
      // aplicadas depois, pelo temporizador, e também não podem ser publicadas de novo.
      corrida.reconstruidas.add(sequencia);
      if ((payload as MensagemCorrida).tipo === 'fim_corrida') corrida.fimRecebido = true;
    }
    this.aplicarDisponiveis(corrida);
    // Status que não vem das mensagens: uma interrupção feita antes do reinício.
    corrida.derivacao.restaurarStatus(persistida.status, persistida.motivo);
  }

  private aplicarDisponiveis(corrida: EstadoCorrida): void {
    while (corrida.retidas.has(corrida.proximaAplicar)) {
      const mensagem = corrida.retidas.get(corrida.proximaAplicar)!;
      corrida.retidas.delete(corrida.proximaAplicar);
      corrida.proximaAplicar++;
      this.aplicar(corrida, mensagem);
    }

    if (corrida.retidas.size === 0) {
      if (corrida.temporizadorLacuna) clearTimeout(corrida.temporizadorLacuna);
      corrida.temporizadorLacuna = null;
    } else {
      // Uma lacuna que não se resolve em alguns segundos não vai mais ser preenchida (o robô
      // só reenvia ao reconectar). Sem esta espera, a corrida ficaria parada no painel.
      corrida.temporizadorLacuna ??= setTimeout(
        () => this.desistirDaLacuna(corrida),
        this.prazoLacunaMs,
      );
    }
  }

  /** Aplica as mensagens retidas em ordem, pulando as que faltam. */
  private desistirDaLacuna(corrida: EstadoCorrida): void {
    corrida.temporizadorLacuna = null;
    const sequencias = [...corrida.retidas.keys()].sort((a, b) => a - b);
    this.deps.log.warn(
      { corrida: corrida.id, de: corrida.proximaAplicar, ate: sequencias[0]! - 1 },
      'lacuna não preenchida: seguindo sem ela',
    );
    for (const sequencia of sequencias) {
      const mensagem = corrida.retidas.get(sequencia)!;
      corrida.retidas.delete(sequencia);
      corrida.proximaAplicar = sequencia + 1;
      this.aplicar(corrida, mensagem);
    }
    this.agendarProgresso(corrida);
  }

  private aplicar(corrida: EstadoCorrida, mensagem: MensagemCorrida): void {
    const silencioso = corrida.reconstruidas.delete(mensagem.sequencia);
    const efeitos = corrida.derivacao.aplicar(mensagem as MensagemDerivavel);
    if (!silencioso && !corrida.derivacao.finalizada) {
      // Uma corrida finalizada só publica o próprio encerramento, abaixo.
      this.deps.eventos.publicar('mensagem-aplicada', {
        corridaId: corrida.id,
        labirinto: corrida.derivacao.labirinto,
        mensagem,
        revisita: efeitos.some((e) => e.tipo === 'passagem' && e.revisita),
        metricas: corrida.derivacao.metricas,
      });
    }
    this.executar(corrida, efeitos, silencioso);
  }

  /**
   * Grava os efeitos na ordem em que foram gerados e publica os eventos. `silencioso` regrava
   * sem publicar (mensagens reaplicadas na reconstrução).
   */
  private executar(corrida: EstadoCorrida, efeitos: Efeito[], silencioso = false): void {
    for (const efeito of efeitos) {
      corrida.efeitos = corrida.efeitos
        .then(() => this.gravarEfeito(corrida, efeito))
        .catch((erro: unknown) =>
          this.deps.log.error(
            { erro, corrida: corrida.id, efeito: efeito.tipo },
            'falha ao gravar efeito',
          ),
        );
      if (!silencioso) this.publicar(corrida, efeito);
    }
  }

  private async gravarEfeito(corrida: EstadoCorrida, efeito: Efeito): Promise<void> {
    const { projecoes, corridas } = this.deps;
    switch (efeito.tipo) {
      case 'passagem':
        return projecoes.passagem(corrida.id, efeito);
      case 'leitura_energia':
        return projecoes.leituraEnergia(corrida.id, efeito);
      case 'snapshot':
        return projecoes.snapshot(corrida.id, efeito);
      case 'status':
        // O encerramento grava status, motivo e métricas finais de uma vez: depois de
        // CONCLUIDA ou FALHOU, o banco recusa qualquer alteração na corrida (RNF-54).
        return corridas.encerrar(corrida.id, {
          ...this.progresso(corrida),
          status: efeito.status,
          motivo: efeito.motivo,
          detalhe: efeito.detalhe,
          tempoFimRoboMs: efeito.tempoMs,
        });
      case 'alerta_tensao':
        return;
    }
  }

  private publicar(corrida: EstadoCorrida, efeito: Efeito): void {
    const { eventos } = this.deps;
    if (efeito.tipo === 'status') {
      eventos.publicar('status-alterado', {
        corridaId: corrida.id,
        labirinto: corrida.derivacao.labirinto,
        status: efeito.status,
        motivo: efeito.motivo,
        detalhe: efeito.detalhe,
        sequencia: efeito.sequencia,
        metricas: corrida.derivacao.metricas,
      });
    } else if (efeito.tipo === 'alerta_tensao') {
      eventos.publicar('alerta-tensao', { corridaId: corrida.id, tensaoV: efeito.tensaoV });
    }
  }

  private progresso(corrida: EstadoCorrida) {
    return {
      ultimaContigua: corrida.sequencias.ultimaContigua,
      faltantes: corrida.sequencias.faltantes,
      metricas: corrida.derivacao.metricas,
    };
  }

  /** Grava o progresso no máximo uma vez por segundo enquanto a corrida está em andamento. */
  private agendarProgresso(corrida: EstadoCorrida): void {
    if (corrida.temporizadorProgresso) return;
    const espera = corrida.progressoGravadoEm + INTERVALO_PROGRESSO_MS - this.agora();
    if (espera <= 0) {
      this.gravarProgresso(corrida);
      return;
    }
    corrida.temporizadorProgresso = setTimeout(() => this.gravarProgresso(corrida), espera);
  }

  private gravarProgresso(corrida: EstadoCorrida): void {
    if (corrida.temporizadorProgresso) clearTimeout(corrida.temporizadorProgresso);
    corrida.temporizadorProgresso = null;
    corrida.progressoGravadoEm = this.agora();
    // Uma corrida finalizada já teve tudo gravado no encerramento.
    if (corrida.derivacao.finalizada) return;
    const progresso = this.progresso(corrida);
    corrida.efeitos = corrida.efeitos
      .then(() => this.deps.corridas.registrarProgresso(corrida.id, progresso))
      .catch((erro: unknown) =>
        this.deps.log.error({ erro, corrida: corrida.id }, 'falha ao registrar progresso'),
      );
  }
}

function chaveDe(dispositivoId: string, idCorridaRobo: string): string {
  return `${dispositivoId}\n${idCorridaRobo}`;
}
