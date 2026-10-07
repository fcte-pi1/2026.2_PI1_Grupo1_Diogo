import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { FastifyInstance } from 'fastify';

export interface DependenciasHealth {
  verificarBanco: () => Promise<boolean>;
}

/** GET /health — saúde, banco e atraso do event loop (RNF-49, RNF-56). */
export async function rotasHealth(app: FastifyInstance, deps: DependenciasHealth): Promise<void> {
  const RESOLUCAO_MS = 20;
  const atrasoLoop = monitorEventLoopDelay({ resolution: RESOLUCAO_MS });
  atrasoLoop.enable();
  app.addHook('onClose', async () => atrasoLoop.disable());

  app.get('/health', async (_req, reply) => {
    const bancoOk = await deps.verificarBanco();
    // O histograma mede o intervalo entre amostras; o atraso é o que excede a resolução.
    const ms = (ns: number) => Math.max(0, Math.round((ns / 1e6 - RESOLUCAO_MS) * 100) / 100);
    return reply.code(bancoOk ? 200 : 503).send({
      status: bancoOk ? 'ok' : 'degradado',
      banco: bancoOk ? 'ok' : 'indisponivel',
      uptime_s: Math.round(process.uptime()),
      event_loop_atraso_ms: {
        p50: ms(atrasoLoop.percentile(50)),
        p99: ms(atrasoLoop.percentile(99)),
      },
    });
  });
}
