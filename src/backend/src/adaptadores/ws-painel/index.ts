import type { FastifyInstance } from 'fastify';
import type { ServicoDistribuicao } from '../../aplicacao/index.js';
import { interpretarJson, type ValidadorProtocolo } from '../../../protocolo/validador.js';

/** Intervalo do ping do WebSocket: sem o pong até o ping seguinte, a conexão caiu. */
export const INTERVALO_PING_PAINEL_MS = 15_000;
/** Depois do `close`, prazo para o socket ser destruído se o painel não responder. */
export const PRAZO_FECHAMENTO_MS = 2000;

export interface DependenciasPainel {
  distribuicao: ServicoDistribuicao;
  validador: ValidadorProtocolo;
  intervaloPingPainelMs?: number;
}

/**
 * GatewayPainel — WS /ws/painel. Os painéis são somente leitura (RNF-55): só podem se
 * inscrever e cancelar inscrições. A regra fica no ServicoDistribuicao.
 */
export async function rotasPainel(
  app: FastifyInstance,
  { distribuicao, validador, intervaloPingPainelMs = INTERVALO_PING_PAINEL_MS }: DependenciasPainel,
): Promise<void> {
  app.get('/ws/painel', { websocket: true }, (socket, req) => {
    const painel = distribuicao.conectar({
      enviar: (texto) => {
        if (socket.readyState === socket.OPEN) socket.send(texto);
      },
      bytesPendentes: () => socket.bufferedAmount,
      fechar: (codigo, motivo) => {
        // O frame de fechamento entra na fila atrás do buffer cheio: um painel que não lê
        // nunca o recebe. Sem o terminate, o socket e o buffer ficariam presos até o fim do
        // handshake de fechamento (30 s no ws).
        socket.close(codigo, motivo);
        setTimeout(() => socket.terminate(), PRAZO_FECHAMENTO_MS).unref();
      },
    });
    req.log.info('painel conectado');

    // Conexão meio aberta (rede caiu sem o FIN): o keepalive de 1 s só a detectaria quando o
    // buffer passasse de 1 MB. O navegador responde ao ping sozinho.
    let respondeu = true;
    socket.on('pong', () => {
      respondeu = true;
    });
    const ping = setInterval(() => {
      if (!respondeu) {
        req.log.warn('painel sem resposta ao ping: conexão encerrada');
        socket.terminate();
        return;
      }
      respondeu = false;
      socket.ping();
    }, intervaloPingPainelMs);
    ping.unref();

    socket.on('message', (dados, binario) => {
      if (binario) return;
      const json = interpretarJson(dados.toString());
      const mensagem = json.ok ? validador.painel(json.mensagem) : json;
      if (!mensagem.ok) {
        // Mensagem inválida não derruba o painel: ela só é ignorada.
        req.log.warn(
          { codigo: mensagem.codigo, detalhe: mensagem.detalhe },
          'mensagem do painel ignorada',
        );
        return;
      }
      try {
        distribuicao.receber(painel, mensagem.mensagem);
      } catch (erro) {
        // Uma exceção aqui escaparia do listener do ws sem tratamento. Como no barramento,
        // o erro fica no log e o painel segue conectado.
        req.log.error({ erro }, 'falha ao tratar a mensagem do painel');
      }
    });

    socket.on('close', () => {
      clearInterval(ping);
      distribuicao.desconectar(painel);
      req.log.info('painel desconectado');
    });
    socket.on('error', (erro) => req.log.error({ erro }, 'painel: falha na conexão'));
  });
}
