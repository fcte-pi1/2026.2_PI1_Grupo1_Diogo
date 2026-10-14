/**
 * Versões em memória das portas da ingestão, para testar o ServicoIngestao e o gateway
 * sem banco de dados.
 */
import { criarValidadorProtocolo } from '../../protocolo/validador.js';
import type { Ack } from '../../protocolo/tipos.js';
import {
  ServicoIngestao,
  type Contadores,
  type CorridaPersistida,
  type DadosNovaCorrida,
  type Dispositivo,
  type MensagemParaGravar,
  type Rejeicao,
  type TipoEventoConexao,
} from '../../src/aplicacao/index.js';
import type { TipoLabirinto } from '../../src/dominio/index.js';

export const DISPOSITIVO: Dispositivo = {
  id: 'disp-1',
  identificador: 'sim-01',
  tokenHash: 'hash:T-VALIDO',
  ativo: true,
};

export class AmbienteEmMemoria {
  dispositivos = new Map<string, Dispositivo>([[DISPOSITIVO.identificador, { ...DISPOSITIVO }]]);
  corridas = new Map<string, CorridaPersistida & { dados: DadosNovaCorrida }>();
  /** Mensagens gravadas, por `corridaId:sequencia`. */
  mensagens = new Map<string, MensagemParaGravar>();
  rejeicoes: Rejeicao[] = [];
  eventos: { tipo: TipoEventoConexao; corridaId: string | null; boot: string }[] = [];
  progresso = new Map<string, { ultimaContigua: number; faltantes: number }>();
  acks: Ack[] = [];
  contadores: Contadores = {
    mensagensAceitas: 0,
    mensagensDuplicadas: 0,
    mensagensRejeitadas: 0,
    conexoesRecusadas: 0,
  };
  relogio = 0;
  /** Quando definido, a próxima gravação falha com este erro. */
  falhaNaGravacao: Error | null = null;

  readonly servico = this.novoServico();

  /** Um serviço novo sobre os mesmos dados: simula o reinício do backend. */
  novoServico(): ServicoIngestao {
    return new ServicoIngestao({
      validador: criarValidadorProtocolo(),
      contadores: this.contadores,
      agora: () => this.relogio,
      log: { info: () => {}, warn: () => {}, error: () => {} },
      tokens: { confere: async (token, hash) => hash === `hash:${token}` },
      dispositivos: {
        buscarPorIdentificador: async (identificador) =>
          this.dispositivos.get(identificador) ?? null,
      },
      corridas: {
        obterOuCriar: async (dados) => {
          const chave = `${dados.dispositivoId}/${dados.idCorridaRobo}`;
          let corrida = this.corridas.get(chave);
          if (!corrida) {
            corrida = {
              id: `corrida-${this.corridas.size + 1}`,
              labirinto: dados.labirinto,
              dados,
            };
            this.corridas.set(chave, corrida);
          }
          return { id: corrida.id, labirinto: corrida.labirinto };
        },
        definirInicio: async (corridaId, labirinto: TipoLabirinto) => {
          for (const corrida of this.corridas.values()) {
            if (corrida.id === corridaId) corrida.labirinto = labirinto;
          }
        },
        sequenciasGravadas: async (corridaId) =>
          [...this.mensagens.values()]
            .filter((m) => m.corridaId === corridaId)
            .map((m) => ({ sequencia: m.sequencia, tempoMs: m.tempoRoboMs }))
            .sort((a, b) => a.sequencia - b.sequencia),
        registrarProgresso: async (corridaId, ultimaContigua, faltantes) => {
          this.progresso.set(corridaId, { ultimaContigua, faltantes });
        },
      },
      gravador: {
        gravar: async (mensagem) => {
          if (this.falhaNaGravacao) {
            const erro = this.falhaNaGravacao;
            this.falhaNaGravacao = null;
            throw erro;
          }
          const chave = `${mensagem.corridaId}:${mensagem.sequencia}`;
          if (this.mensagens.has(chave)) return false;
          this.mensagens.set(chave, mensagem);
          return true;
        },
      },
      auditoria: {
        eventoConexao: async ({ tipo, corridaId, boot }) => {
          this.eventos.push({ tipo, corridaId, boot });
        },
        rejeicao: async (rejeicao) => {
          this.rejeicoes.push(rejeicao);
        },
      },
    });
  }

  sequenciasGravadasDe(idCorridaRobo: string): number[] {
    const corrida = this.corridas.get(`${DISPOSITIVO.id}/${idCorridaRobo}`);
    return [...this.mensagens.values()]
      .filter((m) => m.corridaId === corrida?.id)
      .map((m) => m.sequencia)
      .sort((a, b) => a - b);
  }

  ultimoAck(): Ack | undefined {
    return this.acks.at(-1);
  }
}

export const hello = (campos: Record<string, unknown> = {}) =>
  JSON.stringify({
    tipo: 'hello',
    versao: 1,
    dispositivo: 'sim-01',
    token: 'T-VALIDO',
    boot: 'b1',
    ...campos,
  });

/** Monta uma mensagem de corrida válida; `campos` sobrescreve ou acrescenta. */
export function mensagem(
  tipo: string,
  sequencia: number,
  campos: Record<string, unknown> = {},
): string {
  const corpo: Record<string, unknown> = {
    inicio_corrida: { labirinto: '4x4' },
    celula: { x: 0, y: 3, paredes: { norte: false, leste: true, sul: true, oeste: true } },
    posicao: { x: 0, y: 3, orientacao: 'NORTE', celulas: 0 },
    energia: { tensao_v: 8.0, corrente_a: 0.4, potencia_w: 3.2 },
    estado: { estado: 'MAPEANDO' },
    fim_corrida: { resultado: 'sucesso' },
  };
  return JSON.stringify({
    versao: 1,
    tipo,
    corrida: 'c-A',
    sequencia,
    tempo_ms: sequencia * 100,
    ...(corpo[tipo] as object),
    ...campos,
  });
}

/** Espera as gravações e os acks agendados terminarem. */
export const assentar = () => new Promise<void>((resolver) => setImmediate(resolver));
