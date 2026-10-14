/**
 * ServicoIngestao — orquestra o caminho de uma mensagem do robô (RF-72 a RF-77):
 * autenticação → esquema → corrida → regras de domínio → idempotência → gravação → ack.
 *
 * O estado vivo de cada corrida fica em memória e é acessado só pelo event loop. As
 * mensagens de uma mesma conexão são entregues uma de cada vez (a fila fica no gateway).
 */
import { verificarRegras, type DadosParaRegras } from '../dominio/index.js';
import {
  CodigoFechamento,
  type Ack,
  type Hello,
  type MensagemCorrida,
} from '../../protocolo/tipos.js';
import {
  interpretarJson,
  type CodigoRejeicao,
  type ValidadorProtocolo,
} from '../../protocolo/validador.js';
import { SessaoRobo, type EstadoCorrida } from './estado.js';
import type {
  Contadores,
  Dispositivo,
  GravadorMensagens,
  RegistroAuditoria,
  RegistroLog,
  RepositorioDispositivos,
  VerificadorToken,
} from './portas.js';
import type { PublicadorEventos } from './eventos.js';
import { LIMITE_SILENCIO_MS } from './prazos.js';
import type { ServicoCorrida } from './servico-corrida.js';

export { SessaoRobo } from './estado.js';

export interface DependenciasIngestao {
  dispositivos: RepositorioDispositivos;
  tokens: VerificadorToken;
  corridas: ServicoCorrida;
  gravador: GravadorMensagens;
  auditoria: RegistroAuditoria;
  /** Opcional: sem ele, a perda e a retomada de sinal só vão para a auditoria. */
  eventos?: PublicadorEventos;
  validador: ValidadorProtocolo;
  contadores: Contadores;
  log: RegistroLog;
  agora?: () => number;
}

export interface PedidoFechamento {
  codigoFechamento: number;
  motivo: string;
}

export type ResultadoHello = { ok: true; sessao: SessaoRobo } | ({ ok: false } & PedidoFechamento);

export class ServicoIngestao {
  private readonly agora: () => number;

  constructor(private readonly deps: DependenciasIngestao) {
    this.agora = deps.agora ?? Date.now;
  }

  /** Valida a primeira mensagem da conexão e autentica o dispositivo (RF-72). */
  async autenticar(texto: string, enviarAck: (ack: Ack) => void): Promise<ResultadoHello> {
    const json = interpretarJson(texto);
    const conferido = await this.conferirHello(json.ok ? json.mensagem : undefined);
    if (!conferido.ok) return conferido;

    const { dispositivo, hello } = conferido;
    const sessao = new SessaoRobo(
      dispositivo.id,
      dispositivo.identificador,
      hello.boot,
      hello.versao,
      enviarAck,
      this.agora(),
    );
    await this.deps.auditoria.eventoConexao({
      dispositivoId: dispositivo.id,
      corridaId: null,
      tipo: 'CONECTADO',
      boot: hello.boot,
    });
    this.deps.log.info(
      { dispositivo: dispositivo.identificador, boot: hello.boot },
      'robô conectado',
    );
    // Uma conexão nova com outro boot interrompe a corrida anterior do robô (RF-81, CA1).
    this.deps.corridas.reinicioDetectado(dispositivo.id, hello.boot);
    return { ok: true, sessao };
  }

  /** Confere a forma do `hello`, o cadastro do dispositivo e o token. */
  private async conferirHello(
    bruto: unknown,
  ): Promise<
    { ok: true; dispositivo: Dispositivo; hello: Hello } | ({ ok: false } & PedidoFechamento)
  > {
    const { validador, dispositivos, tokens, contadores, log } = this.deps;
    const hello = validador.hello(bruto);

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

    const { dispositivo: identificador, token } = hello.mensagem;
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
    return { ok: true, dispositivo, hello: hello.mensagem };
  }

  /**
   * Um `hello` no meio da conexão: o Bluetooth do robô caiu e voltou, e a ponte manteve
   * a conexão com o backend. O robô se identifica de novo antes de reenviar o buffer.
   * Um `boot` diferente significa que ele reiniciou.
   */
  private async reidentificar(
    sessao: SessaoRobo,
    bruto: unknown,
  ): Promise<PedidoFechamento | void> {
    const conferido = await this.conferirHello(bruto);
    if (!conferido.ok) return conferido;
    if (conferido.dispositivo.id !== sessao.dispositivoId) {
      this.deps.contadores.conexoesRecusadas++;
      this.deps.log.warn(
        { era: sessao.identificador, veio: conferido.dispositivo.identificador },
        'hello de outro dispositivo na mesma conexão',
      );
      return { codigoFechamento: CodigoFechamento.HELLO_INVALIDO, motivo: 'dispositivo diferente' };
    }

    const reiniciou = conferido.hello.boot !== sessao.boot;
    sessao.boot = conferido.hello.boot;
    if (reiniciou) this.deps.corridas.reinicioDetectado(sessao.dispositivoId, sessao.boot);
    sessao.versaoProtocolo = conferido.hello.versao;
    await this.deps.auditoria.eventoConexao({
      dispositivoId: sessao.dispositivoId,
      corridaId: sessao.corridaAtiva?.id ?? null,
      tipo: reiniciou ? 'REINICIO_DETECTADO' : 'CONECTADO',
      boot: sessao.boot,
    });
    this.deps.log.info(
      { dispositivo: sessao.identificador, boot: sessao.boot, reiniciou },
      'robô se identificou de novo',
    );
  }

  /**
   * Processa uma mensagem de uma conexão já autenticada. Nunca lança por causa do conteúdo.
   * Devolve um pedido de fechamento só quando um novo `hello` é recusado.
   */
  async receber(sessao: SessaoRobo, texto: string): Promise<PedidoFechamento | void> {
    const { validador, contadores } = this.deps;
    await this.registrarAtividade(sessao);

    const json = interpretarJson(texto);
    if (!json.ok) {
      return this.rejeitar(sessao, json.codigo, json.detalhe, { texto: texto.slice(0, 500) });
    }
    if ((json.mensagem as { tipo?: unknown } | null)?.tipo === 'hello') {
      return this.reidentificar(sessao, json.mensagem);
    }
    const validada = validador.corrida(json.mensagem);
    if (!validada.ok) {
      return this.rejeitar(sessao, validada.codigo, validada.detalhe, json.mensagem);
    }
    const mensagem = validada.mensagem;

    const corrida = await this.obterCorrida(sessao, mensagem);
    this.deps.corridas.registrarAtividade(corrida);

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

    // Depois da checagem de duplicata: o reenvio do fim original continua confirmado.
    if (mensagem.tipo === 'fim_corrida') {
      if (corrida.fimRecebido || !corrida.derivacao.aceitaFim) {
        const situacao = corrida.fimRecebido ? 'já terminou' : `está ${corrida.derivacao.status}`;
        return this.rejeitar(
          sessao,
          'CORRIDA_FINALIZADA',
          `corrida ${mensagem.corrida} ${situacao}`,
          mensagem,
        );
      }
      corrida.fimRecebido = true;
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
    this.deps.corridas.sinalPerdido(
      sessao.corridaAtiva,
      sessao.ultimaMensagemEm + LIMITE_SILENCIO_MS,
    );
    await this.registrarEvento(sessao, 'SINAL_PERDIDO');
  }

  /** A conexão fechou. Durante uma corrida, isso também é perda de sinal. */
  async encerrar(sessao: SessaoRobo): Promise<void> {
    if (sessao.corridaAtiva !== null && !sessao.sinalPerdido) {
      sessao.sinalPerdido = true;
      this.deps.corridas.sinalPerdido(sessao.corridaAtiva, this.agora());
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
    // Os painéis inscritos na corrida são avisados em até 1 s (RF-92).
    const corridaId = sessao.corridaAtiva?.id;
    if (corridaId && tipo !== 'DESCONECTADO') {
      this.deps.eventos?.publicar('sinal-alterado', {
        corridaId,
        estado: tipo === 'SINAL_PERDIDO' ? 'PERDIDO' : 'RETOMADO',
      });
    }
    this.deps.log.info({ dispositivo: sessao.identificador, tipo }, 'evento de conexão');
    await this.deps.auditoria.eventoConexao({
      dispositivoId: sessao.dispositivoId,
      corridaId: sessao.corridaAtiva?.id ?? null,
      tipo,
      boot: sessao.boot,
    });
  }

  /** Estado da corrida, com o `inicio_corrida` aplicado assim que chega. */
  private async obterCorrida(
    sessao: SessaoRobo,
    mensagem: MensagemCorrida,
  ): Promise<EstadoCorrida> {
    const corrida = await this.deps.corridas.obter(
      {
        dispositivoId: sessao.dispositivoId,
        boot: sessao.boot,
        versaoProtocolo: sessao.versaoProtocolo,
      },
      mensagem,
    );
    // O labirinto vale para as regras de domínio das mensagens seguintes, mesmo antes de o
    // `inicio_corrida` ser aplicado à derivação (por exemplo, quando chega num reenvio).
    if (mensagem.tipo === 'inicio_corrida') {
      await this.deps.corridas.definirLabirinto(corrida, mensagem);
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
      this.deps.corridas.gravada(corrida, mensagem);
      // `false`: outra conexão do mesmo robô gravou a mesma sequência antes (HU-BE-06, CA3).
      if (inserida) contadores.mensagensAceitas++;
      else contadores.mensagensDuplicadas++;
      this.agendarAck(sessao, corrida);
      for (const outra of corrida.aguardandoGravacao) this.agendarAck(outra, corrida);
      corrida.aguardandoGravacao.clear();
    } catch (erro) {
      // Sem confirmação não há ack: o robô reenvia e a mensagem é aceita de novo.
      corrida.sequencias.descartar(mensagem.sequencia);
      if (mensagem.tipo === 'fim_corrida') {
        // O fim não foi gravado: o reenvio dele tem de ser aceito, e não rejeitado como
        // CORRIDA_FINALIZADA, e a corrida continua sendo a ativa desta conexão.
        corrida.fimRecebido = false;
        sessao.corridaAtiva ??= corrida;
      }
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
    for (const corrida of sessao.acksPendentes) {
      const sequencia = corrida.sequencias.ultimaContigua;
      sessao.enviarAck({ tipo: 'ack', corrida: corrida.idRobo, sequencia });
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
