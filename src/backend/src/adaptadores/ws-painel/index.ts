import type { FastifyInstance } from 'fastify';
import type { ServicoDistribuicao } from '../../aplicacao/index.js';
import { interpretarJson, type ValidadorProtocolo } from '../../../protocolo/validador.js';

export interface DependenciasPainel {
  distribuicao: ServicoDistribuicao;
  validador: ValidadorProtocolo;
}

/**
 * GatewayPainel — WS /ws/painel. Os painéis são somente leitura (RNF-55): só podem se
 * inscrever e cancelar inscrições. A regra fica no ServicoDistribuicao.
 */
export async function rotasPainel(
  app: FastifyInstance,
  { distribuicao, validador }: DependenciasPainel,
): Promise<void> {
  app.get('/ws/painel', { websocket: true }, (socket, req) => {
    const painel = distribuicao.conectar({
      enviar: (texto) => {
        if (socket.readyState === socket.OPEN) socket.send(texto);
      },
      bytesPendentes: () => socket.bufferedAmount,
      fechar: (codigo, motivo) => socket.close(codigo, motivo),
    });
    req.log.info('painel conectado');

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
      distribuicao.receber(painel, mensagem.mensagem);
    });

    socket.on('close', () => {
      distribuicao.desconectar(painel);
      req.log.info('painel desconectado');
    });
    socket.on('error', (erro) => req.log.error({ erro }, 'painel: falha na conexão'));
  });
}
