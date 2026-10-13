/**
 * ServicoIngestao — orquestra o caminho de uma mensagem do robô (RF-72 a RF-77):
 * autenticação → esquema → corrida → regras de domínio → idempotência → gravação → ack.
 *
 * O estado vivo de cada corrida fica em memória e é acessado só pelo event loop. As
 * mensagens de uma mesma conexão são entregues uma de cada vez (a fila fica no gateway).
 */
import {
  SequenciaCorrida,
  verificarRegras,
  type DadosParaRegras,
  type TipoLabirinto,
} from '../dominio/index.js';
import { CodigoFechamento, type Ack, type MensagemCorrida } from '../../protocolo/tipos.js';
import {
  interpretarJson,
  type CodigoRejeicao,
  type ValidadorProtocolo,
} from '../../protocolo/validador.js';
import type {
  Contadores,
  GravadorMensagens,
  RegistroAuditoria,
  RegistroLog,
  RepositorioCorridas,
  RepositorioDispositivos,
  VerificadorToken,
} from './portas.js';

/** Tempo sem mensagens, durante uma corrida, para declarar o sinal perdido (RF-73). */
export const LIMITE_SILENCIO_MS = 3000;

export interface DependenciasIngestao {
  dispositivos: RepositorioDispositivos;
  tokens: VerificadorToken;
  corridas: RepositorioCorridas;
  gravador: GravadorMensagens;
  auditoria: RegistroAuditoria;
  validador: ValidadorProtocolo;
  contadores: Contadores;
  log: RegistroLog;
  agora?: () => number;
}

export type ResultadoHello =
  { ok: true; sessao: SessaoRobo } | { ok: false; codigoFechamento: number; motivo: string };

/** Uma conexão autenticada de um robô (ou do simulador, ou da ponte). */
export class SessaoRobo {
  /** Corrida em andamento nesta conexão: é a que o monitor de sinal acompanha. */
  corridaAtiva: EstadoCorrida | null = null;
  ultimaMensagemEm: number;
  sinalPerdido = false;
  readonly acksPendentes = new Set<EstadoCorrida>();

  constructor(
    readonly dispositivoId: string,
    readonly identificador: string,
    readonly boot: string,
    readonly versaoProtocolo: number,
    /** Envia uma confirmação ao robô. É informativa: o robô pode ignorá-la. */
    readonly enviarAck: (ack: Ack) => void,
    agora: number,
  ) {
    this.ultimaMensagemEm = agora;
  }
}

interface EstadoCorrida {
  id: string;
  idRobo: string;
  labirinto: TipoLabirinto | null;
  sequencias: SequenciaCorrida;
  /** Conexões que enviaram duplicata de uma mensagem ainda na fila de gravação. */
  aguardandoGravacao: Set<SessaoRobo>;
}

export class ServicoIngestao {
  /** Estado vivo por corrida, compartilhado entre conexões do mesmo robô. */
  private readonly corridas = new Map<string, Promise<EstadoCorrida>>();
  private readonly agora: () => number;

  constructor(private readonly deps: DependenciasIngestao) {
    this.agora = deps.agora ?? Date.now;
  }

  /** Valida a primeira mensagem da conexão e autentica o dispositivo (RF-72). */
  async autenticar(texto: string, enviarAck: (ack: Ack) => void): Promise<ResultadoHello> {
    const { validador, dispositivos, tokens, contadores, log, auditoria } = this.deps;
    const json = interpretarJson(texto);
    const hello = json.ok ? validador.hello(json.mensagem) : json;

    if (!hello.ok) {
      contadores.conexoesRecusadas++;
      log.warn({ codigo: hello.codigo, detalhe: hello.detalhe }, 'hello recusado');
      return hello.codigo === 'VERSAO_NAO_SUPORTADA'
        ? {
            ok: false,
            codigoFechamento: CodigoFechamento.VERSAO_NAO_SUPORTADA,
            motivo: 'versão não suportada',
          }
        : {
            ok: false,
            codigoFechamento: CodigoFechamento.HELLO_INVALIDO,
            motivo: 'hello inválido',
          };
    }

    const { dispositivo: identificador, token, boot, versao } = hello.mensagem;
    const dispositivo = await dispositivos.buscarPorIdentificador(identificador);
    const autorizado =
      dispositivo !== null &&
      dispositivo.ativo &&
      (await tokens.confere(token, dispositivo.tokenHash));

    if (!dispositivo || !autorizado) {
      contadores.conexoesRecusadas++;
      log.warn({ dispositivo: identificador }, 'hello recusado: dispositivo ou token inválido');
      return {
        ok: false,
        codigoFechamento: CodigoFechamento.TOKEN_INVALIDO,
        motivo: 'token inválido',
      };
    }

    const sessao = new SessaoRobo(
      dispositivo.id,
      identificador,
      boot,
      versao,
      enviarAck,
      this.agora(),
    );
    await auditoria.eventoConexao({
      dispositivoId: dispositivo.id,
      corridaId: null,
      tipo: 'CONECTADO',
      boot,
    });
    log.info({ dispositivo: identificador, boot }, 'robô conectado');
    return { ok: true, sessao };
  }

  /** Processa uma mensagem de corrida. Nunca lança por causa do conteúdo da mensagem. */
  async receber(sessao: SessaoRobo, texto: string): Promise<void> {
    const { validador, contadores } = this.deps;
    await this.registrarAtividade(sessao);

    const json = interpretarJson(texto);
    if (!json.ok) {
      return this.rejeitar(sessao, json.codigo, json.detalhe, { texto: texto.slice(0, 500) });
    }
    const validada = validador.corrida(json.mensagem);
    if (!validada.ok) {
      return this.rejeitar(sessao, validada.codigo, validada.detalhe, json.mensagem);
    }
    const mensagem = validada.mensagem;

    const corrida = await this.obterCorrida(sessao, mensagem);

    const violacao = verificarRegras(
      dadosParaRegras(mensagem),
      corrida.labirinto,
      corrida.sequencias,
    );
    if (violacao) {
      return this.rejeitar(sessao, violacao.codigo, violacao.detalhe, mensagem);
    }

    if (corrida.sequencias.conhece(mensagem.sequencia)) {
      contadores.mensagensDuplicadas++;
      // Se a original ainda está sendo gravada (por esta ou por outra conexão do mesmo
      // robô), o ack desta conexão sai quando a gravação terminar, já com o valor novo.
      if (corrida.sequencias.gravada(mensagem.sequencia)) this.agendarAck(sessao, corrida);
      else corrida.aguardandoGravacao.add(sessao);
      return;
    }

    corrida.sequencias.aceitar(mensagem.sequencia, mensagem.tempo_ms);
    if (mensagem.tipo === 'inicio_corrida') sessao.corridaAtiva = corrida;
    else if (mensagem.tipo === 'fim_corrida') {
      if (sessao.corridaAtiva === corrida) sessao.corridaAtiva = null;
    } else sessao.corridaAtiva ??= corrida;

    // A gravação é em lote e não segura a fila da conexão: o ack sai quando ela confirmar.
    void this.gravar(sessao, corrida, mensagem);
  }

  /**
   * Chamado periodicamente pelo gateway. Declara o sinal perdido após 3 s sem mensagens
   * durante uma corrida. O pong do WebSocket não conta: ele pode vir da ponte, e não do robô.
   */
  async verificarSilencio(sessao: SessaoRobo): Promise<void> {
    if (sessao.corridaAtiva === null || sessao.sinalPerdido) return;
    if (this.agora() - sessao.ultimaMensagemEm < LIMITE_SILENCIO_MS) return;
    sessao.sinalPerdido = true;
    await this.registrarEvento(sessao, 'SINAL_PERDIDO');
  }

  /** A conexão fechou. Durante uma corrida, isso também é perda de sinal. */
  async encerrar(sessao: SessaoRobo): Promise<void> {
    if (sessao.corridaAtiva !== null && !sessao.sinalPerdido) {
      sessao.sinalPerdido = true;
      await this.registrarEvento(sessao, 'SINAL_PERDIDO');
    }
    await this.registrarEvento(sessao, 'DESCONECTADO');
  }

  private async registrarAtividade(sessao: SessaoRobo): Promise<void> {
    sessao.ultimaMensagemEm = this.agora();
    if (!sessao.sinalPerdido) return;
    sessao.sinalPerdido = false;
    await this.registrarEvento(sessao, 'SINAL_RETOMADO');
  }

  private async registrarEvento(
    sessao: SessaoRobo,
    tipo: 'SINAL_PERDIDO' | 'SINAL_RETOMADO' | 'DESCONECTADO',
  ): Promise<void> {
    this.deps.log.info({ dispositivo: sessao.identificador, tipo }, 'evento de conexão');
    await this.deps.auditoria.eventoConexao({
      dispositivoId: sessao.dispositivoId,
      corridaId: sessao.corridaAtiva?.id ?? null,
      tipo,
      boot: sessao.boot,
    });
  }

  /** Estado da corrida: da memória, ou criado/reconstruído a partir do banco. */
  private obterCorrida(sessao: SessaoRobo, mensagem: MensagemCorrida): Promise<EstadoCorrida> {
    const chave = `${sessao.dispositivoId}\n${mensagem.corrida}`;
    let carregando = this.corridas.get(chave);
    if (!carregando) {
      carregando = this.carregarCorrida(sessao, mensagem);
      this.corridas.set(chave, carregando);
      // Uma falha ao carregar não pode ficar guardada: a próxima mensagem tenta de novo.
      carregando.catch(() => this.corridas.delete(chave));
    }
    return carregando.then((corrida) => this.completarInicio(corrida, mensagem));
  }

  private async carregarCorrida(
    sessao: SessaoRobo,
    mensagem: MensagemCorrida,
  ): Promise<EstadoCorrida> {
    const inicio = mensagem.tipo === 'inicio_corrida' ? mensagem : null;
    const persistida = await this.deps.corridas.obterOuCriar({
      dispositivoId: sessao.dispositivoId,
      idCorridaRobo: mensagem.corrida,
      boot: sessao.boot,
      versaoProtocolo: mensagem.versao,
      labirinto: inicio?.labirinto ?? null,
      tempoInicioRoboMs: inicio?.tempo_ms ?? null,
    });

    const sequencias = new SequenciaCorrida();
    for (const { sequencia, tempoMs } of await this.deps.corridas.sequenciasGravadas(
      persistida.id,
    )) {
      sequencias.aceitar(sequencia, tempoMs);
      sequencias.confirmar(sequencia);
    }
    return {
      id: persistida.id,
      idRobo: mensagem.corrida,
      labirinto: persistida.labirinto,
      sequencias,
      aguardandoGravacao: new Set(),
    };
  }

  /** O `inicio_corrida` chegou depois da criação da corrida (ex.: num reenvio após queda). */
  private async completarInicio(
    corrida: EstadoCorrida,
    mensagem: MensagemCorrida,
  ): Promise<EstadoCorrida> {
    if (mensagem.tipo === 'inicio_corrida' && corrida.labirinto === null) {
      corrida.labirinto = mensagem.labirinto;
      await this.deps.corridas.definirInicio(corrida.id, mensagem.labirinto, mensagem.tempo_ms);
    }
    return corrida;
  }

  private async gravar(
    sessao: SessaoRobo,
    corrida: EstadoCorrida,
    mensagem: MensagemCorrida,
  ): Promise<void> {
    const { gravador, contadores, log } = this.deps;
    try {
      const inserida = await gravador.gravar({
        corridaId: corrida.id,
        sequencia: mensagem.sequencia,
        tipo: mensagem.tipo,
        tempoRoboMs: mensagem.tempo_ms,
        versaoProtocolo: mensagem.versao,
        payload: mensagem,
      });
      corrida.sequencias.confirmar(mensagem.sequencia);
      // `false`: outra conexão do mesmo robô gravou a mesma sequência antes (HU-BE-06, CA3).
      if (inserida) contadores.mensagensAceitas++;
      else contadores.mensagensDuplicadas++;
      this.agendarAck(sessao, corrida);
      for (const outra of corrida.aguardandoGravacao) this.agendarAck(outra, corrida);
      corrida.aguardandoGravacao.clear();
    } catch (erro) {
      // Sem confirmação não há ack: o robô reenvia e a mensagem é aceita de novo.
      corrida.sequencias.descartar(mensagem.sequencia);
      log.error(
        { erro, corrida: corrida.id, sequencia: mensagem.sequencia },
        'falha ao gravar mensagem',
      );
    }
  }

  /** Junta as confirmações de um mesmo lote em um único ack por corrida. */
  private agendarAck(sessao: SessaoRobo, corrida: EstadoCorrida): void {
    if (sessao.acksPendentes.size === 0) queueMicrotask(() => this.enviarAcks(sessao));
    sessao.acksPendentes.add(corrida);
  }

  private enviarAcks(sessao: SessaoRobo): void {
    const { corridas, log } = this.deps;
    for (const corrida of sessao.acksPendentes) {
      const { ultimaContigua, faltantes } = corrida.sequencias;
      sessao.enviarAck({ tipo: 'ack', corrida: corrida.idRobo, sequencia: ultimaContigua });
      corridas
        .registrarProgresso(corrida.id, ultimaContigua, faltantes)
        .catch((erro: unknown) =>
          log.error({ erro, corrida: corrida.id }, 'falha ao registrar progresso'),
        );
    }
    sessao.acksPendentes.clear();
  }

  private async rejeitar(
    sessao: SessaoRobo,
    codigo: CodigoRejeicao | string,
    detalhe: string,
    payload: unknown,
  ): Promise<void> {
    this.deps.contadores.mensagensRejeitadas++;
    const campos = (payload ?? {}) as { corrida?: unknown; sequencia?: unknown };
    const corridaRobo = typeof campos.corrida === 'string' ? campos.corrida.slice(0, 64) : null;
    const sequencia = Number.isInteger(campos.sequencia) ? (campos.sequencia as number) : null;
    this.deps.log.warn(
      { dispositivo: sessao.identificador, corrida: corridaRobo, sequencia, codigo, detalhe },
      'mensagem rejeitada',
    );
    await this.deps.auditoria.rejeicao({
      dispositivoId: sessao.dispositivoId,
      corridaRobo,
      sequencia,
      motivoCodigo: codigo,
      detalhe,
      payload,
    });
  }
}

function dadosParaRegras(mensagem: MensagemCorrida): DadosParaRegras {
  const dados: DadosParaRegras = {
    tipo: mensagem.tipo,
    sequencia: mensagem.sequencia,
    tempo_ms: mensagem.tempo_ms,
  };
  if (mensagem.tipo === 'celula' || mensagem.tipo === 'posicao') {
    dados.x = mensagem.x;
    dados.y = mensagem.y;
  }
  if (mensagem.tipo === 'energia') dados.tensao_v = mensagem.tensao_v;
  return dados;
}
