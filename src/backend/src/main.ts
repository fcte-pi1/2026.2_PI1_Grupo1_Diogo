/**
 * Composição da aplicação (injeção manual de dependências) e inicialização.
 */
import { pino } from 'pino';
import { criarValidadorProtocolo } from '../protocolo/validador.js';
import {
  ServicoConsulta,
  ServicoCorrida,
  ServicoDistribuicao,
  ServicoIngestao,
} from './aplicacao/index.js';
import { construirApp } from './app.js';
import { carregarConfig } from './config/index.js';
import { criarBanco, verificarBanco } from './infra/banco.js';
import { BarramentoEventos } from './infra/barramento-eventos.js';
import { RepositorioConsultaPg } from './infra/consulta-pg.js';
import { criarContadores } from './infra/contadores.js';
import { GravadorLote } from './infra/gravador-lote.js';
import { opcoesLogger } from './infra/logger.js';
import {
  RegistroAuditoriaPg,
  RepositorioCorridasPg,
  RepositorioDispositivosPg,
  RepositorioProjecoesPg,
  VerificadorTokenArgon2,
  criarInserirLote,
} from './infra/repositorios-pg.js';

const config = carregarConfig();
const banco = criarBanco(config.bancoUrl);
const contadores = criarContadores();
const gravador = new GravadorLote(criarInserirLote(banco));

const log = pino(opcoesLogger(config.nivelLog));

const eventos = new BarramentoEventos();
const corridas = new ServicoCorrida({
  corridas: new RepositorioCorridasPg(banco),
  projecoes: new RepositorioProjecoesPg(banco),
  eventos,
  log,
  configuracao: config.derivacao,
});

const validador = criarValidadorProtocolo();
const distribuicao = new ServicoDistribuicao({ corridas, log });
eventos.assinar('mensagem-aplicada', (dados) => distribuicao.aoAplicar(dados));
eventos.assinar('status-alterado', (dados) => distribuicao.aoMudarStatus(dados));
eventos.assinar('alerta-tensao', (dados) => distribuicao.aoAlertar(dados));
eventos.assinar('sinal-alterado', (dados) => distribuicao.aoMudarSinal(dados));
eventos.assinar('ranking-alterado', (dados) => distribuicao.aoMudarRanking(dados));

const ingestao = new ServicoIngestao({
  dispositivos: new RepositorioDispositivosPg(banco),
  tokens: new VerificadorTokenArgon2(),
  corridas,
  gravador,
  auditoria: new RegistroAuditoriaPg(banco),
  validador,
  eventos,
  contadores,
  log,
});

const app = await construirApp({
  logger: log,
  verificarBanco: () => verificarBanco(banco),
  contadores,
  ingestao,
  consulta: new ServicoConsulta(new RepositorioConsultaPg(banco)),
  distribuicao,
  validador,
});

// Corridas que estavam em andamento quando o backend parou (RNF-52).
const recuperadas = await corridas.recuperar();
if (recuperadas > 0) log.info({ recuperadas }, 'corridas em andamento recuperadas');

// Interrupção por 120 s sem sinal (RF-81).
const monitor = setInterval(() => corridas.verificarInterrupcoes(), 1000);
// Keepalive e controle dos painéis lentos (RF-91).
const monitorPaineis = setInterval(() => distribuicao.verificarPaineis(), 1000);

app.addHook('onClose', async () => {
  clearInterval(monitor);
  clearInterval(monitorPaineis);
  distribuicao.parar();
  // Grava o que ainda estiver na fila antes de fechar o banco.
  await gravador.esvaziar();
  await corridas.esvaziar();
  await banco.end();
});

for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sinal, () => {
    app.log.info({ sinal }, 'encerrando');
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ port: config.porta, host: config.host });
