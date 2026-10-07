import type { FastifyInstance } from 'fastify';

/**
 * WS /ws/telemetria — conexão do robô ou do simulador (RF-72 a RF-74).
 * Esqueleto: aceita a conexão e registra as mensagens. GatewayTelemetria e MonitorHeartbeat
 * serão implementados aqui.
 */
export async function rotasTelemetria(app: FastifyInstance): Promise<void> {
  app.get('/ws/telemetria', { websocket: true }, (socket, req) => {
    req.log.info('telemetria: conexão aberta');
    socket.on('message', (dados) =>
      req.log.debug({ tamanho: dados.toString().length }, 'telemetria: mensagem'),
    );
    socket.on('close', (codigo) => req.log.info({ codigo }, 'telemetria: conexão fechada'));
  });
}
