import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { rotasCorridas, type DependenciasCorridasHttp } from './adaptadores/http/corridas.js';
import { rotasHealth, type DependenciasHealth } from './adaptadores/http/health.js';
import { rotasOperador, type DependenciasOperadorHttp } from './adaptadores/http/operador.js';
import { rotasPainel, type DependenciasPainel } from './adaptadores/ws-painel/index.js';
import { rotasTelemetria, type DependenciasTelemetria } from './adaptadores/ws-telemetria/index.js';

/** Maior mensagem aceita nos WebSockets. A maior do protocolo tem cerca de 160 bytes. */
const TAMANHO_MAXIMO_MENSAGEM = 4096;

export interface DependenciasApp
  extends
    DependenciasHealth,
    DependenciasTelemetria,
    DependenciasCorridasHttp,
    DependenciasPainel,
    DependenciasOperadorHttp {
  /** Sem logger, o servidor fica silencioso (testes). */
  logger?: FastifyBaseLogger;
}

/** Monta o servidor HTTP + WebSocket. Separado de main.ts para poder ser testado sem rede. */
export async function construirApp(deps: DependenciasApp): Promise<FastifyInstance> {
  const app = Fastify(deps.logger ? { loggerInstance: deps.logger } : { logger: false });

  await app.register(fastifyWebsocket, { options: { maxPayload: TAMANHO_MAXIMO_MENSAGEM } });
  await app.register(rotasHealth, deps);
  await app.register(rotasCorridas, deps);
  await app.register(rotasOperador, deps);
  await app.register(rotasTelemetria, deps);
  await app.register(rotasPainel, deps);

  return app;
}
