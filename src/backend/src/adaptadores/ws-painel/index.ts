import type { FastifyInstance } from 'fastify';

/**
 * WS /ws/painel — painéis somente leitura (RF-88 a RF-92, RNF-55).
 * Esqueleto: aceita a conexão e registra as mensagens. GatewayPainel e ControleFluxo
 * serão implementados aqui.
 */
export async function rotasPainel(app: FastifyInstance): Promise<void> {
  app.get('/ws/painel', { websocket: true }, (socket, req) => {
    req.log.info('painel: conexão aberta');
    socket.on('message', (dados) =>
      req.log.debug({ mensagem: dados.toString() }, 'painel: mensagem'),
    );
    socket.on('close', (codigo) => req.log.info({ codigo }, 'painel: conexão fechada'));
  });
}
