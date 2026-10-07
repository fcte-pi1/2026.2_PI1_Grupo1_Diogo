/**
 * Composição da aplicação (injeção manual de dependências) e inicialização.
 */
import { construirApp } from './app.js';
import { carregarConfig } from './config/index.js';
import { criarBanco, verificarBanco } from './infra/banco.js';
import { opcoesLogger } from './infra/logger.js';

const config = carregarConfig();
const banco = criarBanco(config.bancoUrl);

const app = await construirApp({
  logger: opcoesLogger(config.nivelLog),
  verificarBanco: () => verificarBanco(banco),
});

app.addHook('onClose', async () => banco.end());

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sinal, () => {
    app.log.info({ sinal }, 'encerrando');
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ port: config.porta, host: config.host });
