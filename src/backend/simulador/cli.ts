/**
 * Linha de comando do simulador de robô (RNF-53):
 *
 *   npm run simulador -- --labirinto 4x4
 *   npm run simulador -- --labirinto 12x4 --semente 42 --taxa 50
 *   npm run simulador -- --labirinto 8x4 --resultado falha
 *   npm run simulador -- --url ws://localhost:8080/ws/telemetria --dispositivo sim-01 --token T-VALIDO
 *
 * Dentro do Docker: `docker compose exec backend npm run simulador -- --labirinto 4x4`.
 */
import { parseArgs } from 'node:util';
import { SEMENTE_MAXIMA } from './aleatorio.js';
import { ehTipoLabirinto, TIPOS_LABIRINTO, type CantoPartida } from './labirinto.js';
import {
  criarSimulador,
  ErroSimulador,
  PRAZO_CONFIRMACAO_MS,
  TAXA_PADRAO,
  URL_PADRAO,
  type ProgressoCorrida,
} from './simulador.js';

const INTERVALO_PROGRESSO_MS = 5000;

const AJUDA = `Simulador de robô do Rato Borrachudo (RNF-53)

  --url <url>             backend (padrão: ${URL_PADRAO})
  --dispositivo <id>      identificador cadastrado no backend (padrão: sim-01)
  --token <token>         token do dispositivo (padrão: T-VALIDO)
  --labirinto <tipo>      ${TIPOS_LABIRINTO.join(', ')} (padrão: 4x4)
  --taxa <n>              mensagens por segundo; 0 = sem pausa (padrão: ${TAXA_PADRAO}, como o robô)
  --resultado <r>         sucesso ou falha (padrão: sucesso)
  --semente <n>           inteiro de 0 a ${SEMENTE_MAXIMA}: repete o mesmo labirinto e percurso
  --partida <canto>       oeste ou leste (padrão: oeste), como o DIP 3 do robô
  --ajuda, -h             mostra esta ajuda`;

const hora = () => new Date().toISOString().slice(11, 23);
const info = (mensagem: string) => console.log(`${hora()} [simulador] ${mensagem}`);
const erro = (mensagem: string) => console.error(`${hora()} [simulador] ERRO: ${mensagem}`);

function sair(mensagem: string): never {
  erro(mensagem);
  console.error(`\n${AJUDA}`);
  process.exit(1);
}

let valores;
try {
  ({ values: valores } = parseArgs({
    options: {
      url: { type: 'string', default: URL_PADRAO },
      dispositivo: { type: 'string', default: 'sim-01' },
      token: { type: 'string', default: 'T-VALIDO' },
      labirinto: { type: 'string', default: '4x4' },
      taxa: { type: 'string', default: String(TAXA_PADRAO) },
      resultado: { type: 'string', default: 'sucesso' },
      semente: { type: 'string' },
      partida: { type: 'string', default: 'oeste' },
      ajuda: { type: 'boolean', short: 'h', default: false },
    },
  }));
} catch (falha) {
  sair((falha as Error).message);
}

if (valores.ajuda) {
  console.log(AJUDA);
  process.exit(0);
}

const { labirinto, resultado, partida } = valores;
const taxa = Number(valores.taxa);
const semente = valores.semente === undefined ? undefined : Number(valores.semente);

if (!ehTipoLabirinto(labirinto)) sair(`--labirinto deve ser ${TIPOS_LABIRINTO.join(', ')}`);
if (!Number.isFinite(taxa) || taxa < 0) sair('--taxa deve ser um número maior ou igual a 0');
if (resultado !== 'sucesso' && resultado !== 'falha') sair('--resultado deve ser sucesso ou falha');
if (partida !== 'oeste' && partida !== 'leste') sair('--partida deve ser oeste ou leste');
if (
  semente !== undefined &&
  !(Number.isInteger(semente) && semente >= 0 && semente <= SEMENTE_MAXIMA)
) {
  sair(`--semente deve ser um inteiro de 0 a ${SEMENTE_MAXIMA}`);
}

const simulador = criarSimulador({
  url: valores.url,
  dispositivo: valores.dispositivo,
  token: valores.token,
  labirinto,
  taxa,
  resultado,
  partida: partida as CantoPartida,
  ...(semente !== undefined && { semente }),
});

let progresso: ProgressoCorrida = { enviadas: 0, total: 0 };
const ultimoAck = () => simulador.acks.at(-1)?.sequencia ?? '-';

process.once('SIGINT', () => {
  info('interrompido pelo operador');
  void simulador.encerrar().then(() => process.exit(130));
});

try {
  info(
    `${valores.dispositivo} · boot ${simulador.boot} · labirinto ${labirinto} · semente ${simulador.semente}` +
      ` (repita com --semente ${simulador.semente})`,
  );
  info(`conectando em ${valores.url}`);
  await simulador.conectar();
  info('conectado, hello enviado');

  const relatorio = setInterval(() => {
    info(
      `enviadas ${progresso.enviadas}/${progresso.total} · acks ${simulador.acks.length} · último ack ${ultimoAck()}`,
    );
  }, INTERVALO_PROGRESSO_MS);
  relatorio.unref();

  const corrida = await simulador.iniciarCorrida((atual) => (progresso = atual));
  clearInterval(relatorio);
  info(
    `corrida ${corrida.corrida} enviada (resultado simulado: ${corrida.resultado}): ` +
      `${corrida.mensagens} mensagens, ` +
      `${corrida.passos} células percorridas (${corrida.revisitas} revisitas), ` +
      `${(corrida.duracaoMs / 1000).toFixed(1)} s no relógio do robô`,
  );

  // O envio não dependeu do backend (emissor unidirecional). Só agora o simulador confere se o
  // backend gravou tudo: se a conexão tiver sido recusada, isto falha e cai no `catch`.
  await simulador.aguardarConfirmacao(corrida.mensagens);
  await simulador.encerrar();
  info(`confirmada pelo backend: último ack ${ultimoAck()} de ${corrida.mensagens}`);
  process.exit(0);
} catch (falha) {
  erro(falha instanceof ErroSimulador ? falha.message : String(falha));
  const codigo = simulador.fechamento?.codigo;
  if (codigo === 4001)
    erro('dispositivo ou token recusado: rodou o seed? confira --dispositivo e --token');
  if (codigo === 4002) erro('versão do protocolo não suportada pelo backend');
  if (codigo === 4003) erro('o backend não aceitou o hello');
  if (codigo === undefined && simulador.acks.length === 0) {
    erro(`nenhum ack em ${PRAZO_CONFIRMACAO_MS / 1000} s: o backend está gravando a telemetria?`);
  }
  await simulador.encerrar();
  process.exit(1);
}
