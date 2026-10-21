/**
 * Linha de comando da ponte Bluetooth → backend. Roda no notebook, fora do Docker:
 *
 *   npm run ponte -- --listar
 *   npm run ponte -- --porta /dev/cu.RatoBorrachudo
 *   npm run ponte -- --porta COM5 --url ws://localhost:8080/ws/telemetria
 *   cat corrida.ndjson | npm run ponte -- --porta -        (sem robô: lê da entrada padrão)
 */
import { parseArgs } from 'node:util';
import { Ponte, type Registro, type SocketPonte } from './ponte.js';
import { SeparadorLinhas } from './separador-linhas.js';

const { values: opcoes } = parseArgs({
  options: {
    porta: { type: 'string', short: 'p' },
    url: { type: 'string', short: 'u', default: 'ws://localhost:8080/ws/telemetria' },
    baud: { type: 'string', default: '115200' },
    listar: { type: 'boolean', default: false },
    ajuda: { type: 'boolean', short: 'h', default: false },
  },
});

const hora = () => new Date().toISOString().slice(11, 23);
const registro: Registro = {
  info: (mensagem) => console.log(`${hora()} [ponte] ${mensagem}`),
  aviso: (mensagem) => console.warn(`${hora()} [ponte] AVISO: ${mensagem}`),
  erro: (mensagem) => console.error(`${hora()} [ponte] ERRO: ${mensagem}`),
};

if (opcoes.ajuda || (!opcoes.listar && !opcoes.porta)) {
  console.log(
    [
      'Ponte Bluetooth → backend do Rato Borrachudo',
      '',
      '  --listar           lista as portas seriais do computador',
      '  --porta, -p <p>    porta serial Bluetooth do robô (ex.: /dev/cu.RatoBorrachudo, COM5)',
      '                     use "-" para ler as mensagens da entrada padrão',
      '  --url, -u <url>    endereço do backend (padrão: ws://localhost:8080/ws/telemetria)',
      '  --baud <n>         velocidade da serial (padrão: 115200; ignorada pelo Bluetooth)',
    ].join('\n'),
  );
  process.exit(opcoes.ajuda ? 0 : 1);
}

if (opcoes.listar) {
  const { SerialPort } = await import('serialport');
  const portas = await SerialPort.list();
  if (portas.length === 0) console.log('Nenhuma porta serial encontrada.');
  for (const porta of portas) {
    console.log([porta.path, porta.manufacturer, porta.pnpId].filter(Boolean).join('  ·  '));
  }
  process.exit(0);
}

const ponte = new Ponte({
  registro,
  criarSocket: () => new WebSocket(opcoes.url) as unknown as SocketPonte,
});
const separador = new SeparadorLinhas();
const receber = (dados: Uint8Array) => {
  for (const linha of separador.alimentar(dados)) ponte.linha(linha);
};

function resumo(): string {
  const c = ponte.contadores;
  return (
    `recebidas ${c.linhasRecebidas} · enviadas ${c.linhasEnviadas} · acks ${c.acksRecebidos}` +
    ` · sem hello ${c.linhasSemHello} · perdidas ${c.linhasPerdidas}` +
    ` · linhas longas demais ${separador.linhasDescartadas}`
  );
}

let ultimoResumo = '';
setInterval(() => {
  const atual = resumo();
  if (atual !== ultimoResumo) registro.info(atual);
  ultimoResumo = atual;
}, 10_000).unref();

function encerrar(): never {
  ponte.encerrarSessao();
  registro.info(`encerrada — ${resumo()}`);
  process.exit(0);
}
process.once('SIGINT', encerrar);
process.once('SIGTERM', encerrar);

registro.info(`backend: ${opcoes.url}`);

if (opcoes.porta === '-') {
  registro.info('lendo as mensagens da entrada padrão');
  ponte.iniciarSessao();
  process.stdin.on('data', receber);
  // Dá tempo de o backend receber o que ficou na fila antes de fechar.
  process.stdin.on('end', () => setTimeout(encerrar, 1000));
} else {
  const { SerialPort } = await import('serialport');
  const caminho = opcoes.porta!;
  const ESPERA_REABERTURA_MS = 1000;
  let avisouFalha = false;

  const abrir = () => {
    const serial = new SerialPort({
      path: caminho,
      baudRate: Number(opcoes.baud),
      autoOpen: false,
    });

    serial.on('open', () => {
      avisouFalha = false;
      separador.reiniciar();
      ponte.iniciarSessao();
    });
    serial.on('data', receber);
    serial.on('close', () => {
      ponte.encerrarSessao();
      setTimeout(abrir, ESPERA_REABERTURA_MS);
    });
    serial.on('error', (erro) => {
      if (!avisouFalha) registro.aviso(`porta ${caminho}: ${erro.message}`);
      avisouFalha = true;
    });

    serial.open((erro) => {
      if (!erro) return;
      if (!avisouFalha) registro.aviso(`não foi possível abrir ${caminho}: ${erro.message}`);
      avisouFalha = true;
      setTimeout(abrir, ESPERA_REABERTURA_MS);
    });
  };

  registro.info(`aguardando o robô em ${caminho}`);
  abrir();
}
