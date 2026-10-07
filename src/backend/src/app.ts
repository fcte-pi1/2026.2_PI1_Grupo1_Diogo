import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { rotasHealth, type DependenciasHealth } from './adaptadores/http/health.js';
import { rotasPainel } from './adaptadores/ws-painel/index.js';
import { rotasTelemetria } from './adaptadores/ws-telemetria/index.js';

export interface DependenciasApp extends DependenciasHealth {
  logger?: FastifyServerOptions['logger'];
}

/** Monta o servidor HTTP + WebSocket. Separado de main.ts para poder ser testado sem rede. */
export async function construirApp(deps: DependenciasApp): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false });

  await app.register(fastifyWebsocket);
  await app.register(rotasHealth, deps);
  await app.register(rotasTelemetria);
  await app.register(rotasPainel);

  return app;
}
