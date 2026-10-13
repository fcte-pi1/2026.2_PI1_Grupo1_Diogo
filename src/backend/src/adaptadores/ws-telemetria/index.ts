import type { FastifyInstance } from 'fastify';
import type { ServicoIngestao, SessaoRobo } from '../../aplicacao/index.js';
import { CodigoFechamento } from '../../../protocolo/tipos.js';

/** Prazo para o robô enviar o `hello` depois de abrir a conexão (HU-BE-01, CA4). */
export const PRAZO_HELLO_MS = 5000;
/** Intervalo do ping e da verificação de silêncio (RF-73). */
export const INTERVALO_MONITOR_MS = 1000;

export interface DependenciasTelemetria {
  ingestao: ServicoIngestao;
  /** Prazo do `hello`; só os testes mudam o padrão. */
  prazoHelloMs?: number;
}

/**
 * GatewayTelemetria — WS /ws/telemetria. Recebe o robô, o simulador ou a ponte Bluetooth.
 * Só cuida da conexão: prazo do `hello`, ordem das mensagens e envio do `ack`. Toda a
 * regra fica no ServicoIngestao.
 */
export async function rotasTelemetria(
  app: FastifyInstance,
  { ingestao, prazoHelloMs = PRAZO_HELLO_MS }: DependenciasTelemetria,
): Promise<void> {
  app.get('/ws/telemetria', { websocket: true }, (socket, req) => {
    let sessao: SessaoRobo | null = null;
    let primeiraMensagem = true;
    // As mensagens de uma conexão são processadas uma de cada vez, na ordem de chegada.
    let fila: Promise<void> = Promise.resolve();

    const prazoHello = setTimeout(() => {
      req.log.warn('telemetria: hello não recebido no prazo');
      socket.close(CodigoFechamento.HELLO_INVALIDO, 'hello não recebido');
    }, prazoHelloMs);

    const monitor = setInterval(() => {
      if (!sessao) return;
      socket.ping();
      const atual = sessao;
      fila = fila.then(() => ingestao.verificarSilencio(atual)).catch(registrarFalha);
    }, INTERVALO_MONITOR_MS);

    const registrarFalha = (erro: unknown) => req.log.error({ erro }, 'telemetria: falha interna');

    const enviarAck = (ack: object) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(ack));
    };

    socket.on('message', (dados, binario) => {
      if (binario) return;
      const texto = dados.toString();

      if (primeiraMensagem) {
        primeiraMensagem = false;
        clearTimeout(prazoHello);
        fila = fila
          .then(async () => {
            const resultado = await ingestao.autenticar(texto, enviarAck);
            if (resultado.ok) sessao = resultado.sessao;
            else socket.close(resultado.codigoFechamento, resultado.motivo);
          })
          .catch((erro: unknown) => {
            registrarFalha(erro);
            socket.close(1011, 'erro interno');
          });
        return;
      }

      fila = fila
        .then(() => (sessao ? ingestao.receber(sessao, texto) : undefined))
        .catch(registrarFalha);
    });

    socket.on('close', () => {
      clearTimeout(prazoHello);
      clearInterval(monitor);
      fila = fila
        .then(() => (sessao ? ingestao.encerrar(sessao) : undefined))
        .catch(registrarFalha);
    });

    socket.on('error', registrarFalha);
  });
}
