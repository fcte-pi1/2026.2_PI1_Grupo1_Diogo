/**
 * Linha de comando do simulador de robô (RNF-53):
 *
 *   npm run simulador -- --labirinto 4x4
 *   npm run simulador -- --labirinto 12x4 --semente 42 --taxa 50
 *   npm run simulador -- --labirinto 8x4 --resultado falha
 *   npm run simulador -- --url ws://localhost:8080/ws/telemetria --dispositivo sim-01 --token T-VALIDO
 *
 * Cenários de falha (Fase 2): --queda, --silencio, --reinicio, --sem-reenvio, --anomalias,
 * --tensoes, --atraso e dois dispositivos ao mesmo tempo (--dispositivo sim-01,sim-02).
 *
 * Dentro do Docker: `docker compose exec backend npm run simulador -- --labirinto 4x4`.
 */
import { parseArgs } from 'node:util';
import type { TipoLabirinto } from '../protocolo/tipos.js';
import { SEMENTE_MAXIMA } from './aleatorio.js';
import {
  GRUPOS_ANOMALIA,
  REACAO_ESPERADA,
  TIPOS_ANOMALIA,
  type TipoAnomalia,
} from './anomalias.js';
import { RETENCAO_PADRAO_MS } from './buffer.js';
import { ehTipoLabirinto, TIPOS_LABIRINTO, type CantoPartida } from './labirinto.js';
import {
  criarSimulador,
  ErroSimulador,
  PRAZO_CONFIRMACAO_MS,
  TAXA_PADRAO,
  URL_PADRAO,
  type AtrasoRede,
  type OpcoesSimulador,
  type ProgressoCorrida,
  type Roteiro,
  type Simulador,
} from './simulador.js';

const INTERVALO_PROGRESSO_MS = 5000;
const DURACAO_INTERRUPCAO_PADRAO_MS = 5000;
/** Depois de um reinício, tempo para o backend registrar o novo `boot` antes de fechar. */
const ESPERA_APOS_REINICIO_MS = 1500;

const AJUDA = `Simulador de robô do Rato Borrachudo (RNF-53)

Corrida
  --url <url>               backend (padrão: ${URL_PADRAO})
  --dispositivo <id>        identificador cadastrado no backend (padrão: sim-01). Vários,
                            separados por vírgula (sim-01,sim-02), correm ao mesmo tempo
  --token <token>           token do dispositivo (padrão: T-VALIDO)
  --labirinto <tipo>        ${TIPOS_LABIRINTO.join(', ')} (padrão: 4x4)
  --taxa <n>                mensagens por segundo; 0 = sem pausa (padrão: ${TAXA_PADRAO}, como o robô)
  --resultado <r>           sucesso ou falha (padrão: sucesso)
  --semente <n>             inteiro de 0 a ${SEMENTE_MAXIMA}: repete o mesmo labirinto e percurso
  --partida <canto>         oeste ou leste (padrão: oeste), como o DIP 3 do robô

Cenários de falha
  --queda <seq>             derruba a conexão depois da sequência <seq> e reconecta (mesmo boot)
  --duracao-queda <ms>      tempo fora do ar (padrão: ${DURACAO_INTERRUPCAO_PADRAO_MS})
  --silencio <seq>          para de enviar e de responder ao ping, com a conexão aberta
  --duracao-silencio <ms>   tempo em silêncio (padrão: ${DURACAO_INTERRUPCAO_PADRAO_MS}; o backend percebe em 3 s)
  --sem-reenvio             não reenvia o buffer ao voltar: o que se perdeu fica como lacuna
  --buffer <ms>             retenção do buffer circular (padrão: ${RETENCAO_PADRAO_MS})
  --reinicio <seq>          reinicia o robô depois da sequência <seq> (novo boot)
  --anomalias <lista>       ${TIPOS_ANOMALIA.slice(0, 5).join(', ')},
                            ${TIPOS_ANOMALIA.slice(5).join(', ')}
                            ou os grupos ${Object.keys(GRUPOS_ANOMALIA).join(', ')}
  --tensoes <lista>         tensões da bateria em degraus, em V (ex.: 7.2,6.9,6.8,7.05,6.9,7.2,6.9)
  --atraso <ms>             atraso de rede artificial de 0 a <ms>, ou <min>-<max> (ex.: 0-800)

  --ajuda, -h               mostra esta ajuda`;

const hora = () => new Date().toISOString().slice(11, 23);

function sair(mensagem: string): never {
  console.error(`${hora()} [simulador] ERRO: ${mensagem}`);
  console.error(`\n${AJUDA}`);
  process.exit(1);
}

const OPCOES = {
  url: { type: 'string', default: URL_PADRAO },
  dispositivo: { type: 'string', default: 'sim-01' },
  token: { type: 'string', default: 'T-VALIDO' },
  labirinto: { type: 'string', default: '4x4' },
  taxa: { type: 'string', default: String(TAXA_PADRAO) },
  resultado: { type: 'string', default: 'sucesso' },
  semente: { type: 'string' },
  partida: { type: 'string', default: 'oeste' },
  queda: { type: 'string' },
  'duracao-queda': { type: 'string', default: String(DURACAO_INTERRUPCAO_PADRAO_MS) },
  silencio: { type: 'string' },
  'duracao-silencio': { type: 'string', default: String(DURACAO_INTERRUPCAO_PADRAO_MS) },
  'sem-reenvio': { type: 'boolean', default: false },
  buffer: { type: 'string' },
  reinicio: { type: 'string' },
  anomalias: { type: 'string' },
  tensoes: { type: 'string' },
  atraso: { type: 'string' },
  ajuda: { type: 'boolean', short: 'h', default: false },
} as const;

function lerArgumentos() {
  try {
    return parseArgs({ options: OPCOES }).values;
  } catch (falha) {
    sair((falha as Error).message);
  }
}

const valores = lerArgumentos();

if (valores.ajuda) {
  console.log(AJUDA);
  process.exit(0);
}

const { labirinto, resultado, partida } = valores;
const taxa = Number(valores.taxa);
const semente = valores.semente === undefined ? undefined : Number(valores.semente);
const dispositivos = valores.dispositivo
  .split(',')
  .map((d) => d.trim())
  .filter(Boolean);

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
if (dispositivos.length === 0) sair('--dispositivo não pode ficar vazio');
if (new Set(dispositivos).size !== dispositivos.length) sair('--dispositivo tem um id repetido');
// Já validados acima: daqui em diante, com o tipo certo.
const tipoLabirinto: TipoLabirinto = labirinto;
const resultadoCorrida: 'sucesso' | 'falha' = resultado;
const cantoPartida: CantoPartida = partida;

function inteiro(opcao: string, texto: string | undefined, minimo: number): number | undefined {
  if (texto === undefined) return undefined;
  const valor = Number(texto);
  if (!(Number.isInteger(valor) && valor >= minimo)) {
    sair(`--${opcao} deve ser um inteiro maior ou igual a ${minimo}`);
  }
  return valor;
}

function lerAnomalias(texto: string | undefined): TipoAnomalia[] {
  if (texto === undefined) return [];
  const tipos: TipoAnomalia[] = [];
  for (const nome of texto
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean)) {
    const grupo = GRUPOS_ANOMALIA[nome];
    if (grupo) tipos.push(...grupo);
    else if ((TIPOS_ANOMALIA as readonly string[]).includes(nome)) tipos.push(nome as TipoAnomalia);
    else sair(`anomalia desconhecida: ${nome}`);
  }
  return [...new Set(tipos)];
}

function lerTensoes(texto: string | undefined): number[] | undefined {
  if (texto === undefined) return undefined;
  const tensoes = texto.split(',').map((t) => Number(t.trim()));
  if (tensoes.length === 0 || tensoes.some((t) => !(Number.isFinite(t) && t >= 5 && t <= 9))) {
    sair('--tensoes deve ser uma lista de tensões de 5 a 9 V, como 7.2,6.9,6.8');
  }
  return tensoes;
}

function lerAtraso(texto: string | undefined): AtrasoRede | undefined {
  if (texto === undefined) return undefined;
  const partes = texto.split('-').map(Number);
  const [minimoMs, maximoMs] = partes.length === 1 ? [0, partes[0]!] : [partes[0]!, partes[1]!];
  if (
    partes.length > 2 ||
    !Number.isInteger(minimoMs) ||
    !Number.isInteger(maximoMs) ||
    minimoMs < 0 ||
    maximoMs < minimoMs
  ) {
    sair('--atraso deve ser <ms> ou <min>-<max>, em ms inteiros (ex.: 0-800)');
  }
  return { minimoMs, maximoMs };
}

const queda = inteiro('queda', valores.queda, 1);
const silencio = inteiro('silencio', valores.silencio, 1);
const reinicio = inteiro('reinicio', valores.reinicio, 1);
const duracaoQueda = inteiro('duracao-queda', valores['duracao-queda'], 0)!;
const duracaoSilencio = inteiro('duracao-silencio', valores['duracao-silencio'], 0)!;
const retencao = inteiro('buffer', valores.buffer, 0);
const anomalias = lerAnomalias(valores.anomalias);
const tensoes = lerTensoes(valores.tensoes);
const atraso = lerAtraso(valores.atraso);

const roteiro: Roteiro = {
  ...(queda !== undefined && { quedas: [{ apos: queda, duracaoMs: duracaoQueda }] }),
  ...(silencio !== undefined && { silencios: [{ apos: silencio, duracaoMs: duracaoSilencio }] }),
  ...(reinicio !== undefined && { reinicioApos: reinicio }),
  ...(anomalias.length > 0 && { anomalias: anomalias.map((tipo) => ({ tipo })) }),
};

const simuladores: Simulador[] = [];
process.once('SIGINT', () => {
  console.log(`${hora()} [simulador] interrompido pelo operador`);
  void Promise.all(simuladores.map((s) => s.encerrar())).then(() => process.exit(130));
});

/** Uma corrida de um dispositivo. Devolve `true` quando terminou como esperado. */
async function executar(dispositivo: string): Promise<boolean> {
  const rotulo = dispositivos.length > 1 ? `[${dispositivo}]` : '[simulador]';
  const info = (mensagem: string) => console.log(`${hora()} ${rotulo} ${mensagem}`);
  const erro = (mensagem: string) => console.error(`${hora()} ${rotulo} ERRO: ${mensagem}`);

  const opcoes: OpcoesSimulador = {
    url: valores.url,
    dispositivo,
    token: valores.token,
    labirinto: tipoLabirinto,
    taxa,
    resultado: resultadoCorrida,
    partida: cantoPartida,
    reenviar: !valores['sem-reenvio'],
    ...(semente !== undefined && { semente }),
    ...(retencao !== undefined && { buffer: { retencaoMs: retencao } }),
    ...(tensoes && { tensoes }),
    ...(atraso && { atrasoRede: atraso }),
  };

  let simulador: Simulador;
  try {
    simulador = criarSimulador(opcoes);
  } catch (falha) {
    erro((falha as Error).message);
    return false;
  }
  simuladores.push(simulador);

  let progresso: ProgressoCorrida = { enviadas: 0, total: 0 };
  // O `ack` é cumulativo: vale o maior recebido, e não o último a chegar.
  const ultimoAck = () =>
    simulador.acks.length === 0 ? '-' : Math.max(...simulador.acks.map((a) => a.sequencia));

  try {
    info(
      `${dispositivo} · boot ${simulador.boot} · labirinto ${labirinto} · semente ${simulador.semente}` +
        ` (repita com --semente ${simulador.semente})`,
    );
    for (const linha of descreverCenario()) info(linha);
    info(`conectando em ${valores.url}`);
    await simulador.conectar();
    info('conectado, hello enviado');

    const relatorio = setInterval(() => {
      const estado = !simulador.conectado
        ? ' · FORA DO AR'
        : simulador.silenciado
          ? ' · EM SILÊNCIO'
          : '';
      info(
        `emitidas ${progresso.enviadas}/${progresso.total} · acks ${simulador.acks.length}` +
          ` · último ack ${ultimoAck()} · buffer ${simulador.buffer.length}${estado}`,
      );
    }, INTERVALO_PROGRESSO_MS);
    relatorio.unref();

    const corrida = await simulador.iniciarCorrida({
      ...roteiro,
      aoProgredir: (atual) => (progresso = atual),
    });
    clearInterval(relatorio);
    if (corrida.reiniciou) {
      info(
        `corrida ${corrida.corrida} cortada pelo reinício: ${corrida.mensagens} de ` +
          `${corrida.total} mensagens emitidas, sem fim_corrida`,
      );
    } else {
      info(
        `corrida ${corrida.corrida} enviada (resultado simulado: ${corrida.resultado}): ` +
          `${corrida.mensagens} mensagens, ` +
          `${corrida.passos} células percorridas (${corrida.revisitas} revisitas), ` +
          `${(corrida.duracaoMs / 1000).toFixed(1)} s no relógio do robô`,
      );
    }
    if (corrida.interrupcoes > 0) {
      info(
        `${corrida.interrupcoes} interrupção(ões) do enlace; ${corrida.reenviadas} mensagens ` +
          `reenviadas do buffer depois do hello`,
      );
    }
    for (const anomalia of corrida.anomalias) {
      info(
        `anomalia ${anomalia.tipo} na sequência ${anomalia.sequencia}: ` +
          (anomalia.tipo !== 'fora-de-ordem' && anomalia.injetadas === 0
            ? 'não enviada (enlace fora do ar)'
            : `esperado: ${REACAO_ESPERADA[anomalia.tipo]}`),
      );
    }

    if (corrida.reiniciou) {
      // A corrida antiga nunca termina: o backend é que tem de marcá-la como interrompida.
      info(
        `robô reiniciado depois da sequência ${roteiro.reinicioApos}: novo boot ${simulador.boot}. ` +
          `Esperado: ${corrida.corrida} INTERROMPIDA (REINICIO_ROBO)`,
      );
      await new Promise((resolver) => setTimeout(resolver, ESPERA_APOS_REINICIO_MS));
      await simulador.encerrar();
      return true;
    }

    // O envio não dependeu do backend (emissor unidirecional). Só agora o simulador confere se o
    // backend gravou tudo: se a conexão tiver sido recusada, isto falha e cai no `catch`.
    const esperado = corrida.contiguaEnviada;
    if (esperado < corrida.mensagens) {
      info(
        `lacuna esperada: a sequência ${esperado + 1} nunca chegou ao backend (reenvio ` +
          `desligado ou queda mais longa que o buffer). O ack deve parar em ${esperado}`,
      );
    }
    const prazo = PRAZO_CONFIRMACAO_MS + (atraso?.maximoMs ?? 0);
    await simulador.aguardarConfirmacao(Math.max(esperado, 1), prazo);
    await simulador.encerrar();
    info(`confirmada pelo backend: último ack ${ultimoAck()} de ${corrida.mensagens}`);
    return true;
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
    return false;
  }
}

/** Uma linha por cenário ligado, para quem lê a saída saber o que esperar no painel. */
function descreverCenario(): string[] {
  const linhas: string[] = [];
  if (queda !== undefined) {
    linhas.push(`cenário: queda depois da sequência ${queda}, por ${duracaoQueda} ms`);
  }
  if (silencio !== undefined) {
    linhas.push(
      `cenário: silêncio (sem mensagens e sem pong) depois da sequência ${silencio}, ` +
        `por ${duracaoSilencio} ms`,
    );
  }
  if (valores['sem-reenvio']) linhas.push('cenário: reenvio do buffer desligado');
  if (reinicio !== undefined)
    linhas.push(`cenário: reinício do robô depois da sequência ${reinicio}`);
  if (anomalias.length > 0) linhas.push(`cenário: anomalias ${anomalias.join(', ')}`);
  if (tensoes) linhas.push(`cenário: tensões ${tensoes.join(' → ')} V`);
  if (atraso) linhas.push(`cenário: atraso de rede de ${atraso.minimoMs} a ${atraso.maximoMs} ms`);
  return linhas;
}

const resultados = await Promise.all(dispositivos.map(executar));
process.exit(resultados.every(Boolean) ? 0 : 1);
