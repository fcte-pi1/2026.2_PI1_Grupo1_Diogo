/**
 * Composição da aplicação (injeção manual de dependências) e inicialização.
 */
import { pino } from 'pino';
import { criarValidadorProtocolo } from '../protocolo/validador.js';
import { ServicoIngestao } from './aplicacao/index.js';
import { construirApp } from './app.js';
import { carregarConfig } from './config/index.js';
import { criarBanco, verificarBanco } from './infra/banco.js';
import { criarContadores } from './infra/contadores.js';
import { GravadorLote } from './infra/gravador-lote.js';
import { opcoesLogger } from './infra/logger.js';
import {
  RegistroAuditoriaPg,
  RepositorioCorridasPg,
  RepositorioDispositivosPg,
  VerificadorTokenArgon2,
  criarInserirLote,
} from './infra/repositorios-pg.js';

const config = carregarConfig();
const banco = criarBanco(config.bancoUrl);
const contadores = criarContadores();
const gravador = new GravadorLote(criarInserirLote(banco));

const log = pino(opcoesLogger(config.nivelLog));

const ingestao = new ServicoIngestao({
  dispositivos: new RepositorioDispositivosPg(banco),
  tokens: new VerificadorTokenArgon2(),
  corridas: new RepositorioCorridasPg(banco),
  gravador,
  auditoria: new RegistroAuditoriaPg(banco),
  validador: criarValidadorProtocolo(),
  contadores,
  log,
});

const app = await construirApp({
  logger: log,
  verificarBanco: () => verificarBanco(banco),
  contadores,
  ingestao,
});

app.addHook('onClose', async () => {
  // Grava o que ainda estiver na fila antes de fechar o banco.
  await gravador.esvaziar();
  await banco.end();
});

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sinal, () => {
    app.log.info({ sinal }, 'encerrando');
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ port: config.porta, host: config.host });
