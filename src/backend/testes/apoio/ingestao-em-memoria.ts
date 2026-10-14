/**
 * Versões em memória das portas da ingestão e da corrida, para testar os serviços e o
 * gateway sem banco de dados.
 */
import { criarValidadorProtocolo } from '../../protocolo/validador.js';
import type { Ack } from '../../protocolo/tipos.js';
import {
  ServicoCorrida,
  ServicoDistribuicao,
  ServicoIngestao,
  type PublicadorEventos,
  type Contadores,
  type CorridaPersistida,
  type DadosNovaCorrida,
  type Dispositivo,
  type EncerramentoCorrida,
  type MapaEventos,
  type MensagemParaGravar,
  type ProgressoCorrida,
  type Rejeicao,
  type TipoEventoConexao,
} from '../../src/aplicacao/index.js';
import type { Efeito, TipoLabirinto } from '../../src/dominio/index.js';

export const DISPOSITIVO: Dispositivo = {
  id: 'disp-1',
  identificador: 'sim-01',
  tokenHash: 'hash:T-VALIDO',
  ativo: true,
};

type CorridaEmMemoria = CorridaPersistida & { dados: DadosNovaCorrida };
type EventoPublicado = {
  [K in keyof MapaEventos]: { evento: K; dados: MapaEventos[K] };
}[keyof MapaEventos];

export class AmbienteEmMemoria {
  dispositivos = new Map<string, Dispositivo>([[DISPOSITIVO.identificador, { ...DISPOSITIVO }]]);
  corridas = new Map<string, CorridaEmMemoria>();
  /** Mensagens gravadas, por `corridaId:sequencia`, com o instante de recebimento. */
  mensagens = new Map<string, MensagemParaGravar & { recebidaEm: number }>();
  rejeicoes: Rejeicao[] = [];
  eventos: { tipo: TipoEventoConexao; corridaId: string | null; boot: string }[] = [];
  /** Último progresso gravado de cada corrida (só a confirmação e as lacunas). */
  progresso = new Map<string, { ultimaContigua: number; faltantes: number }>();
  progressoCompleto = new Map<string, ProgressoCorrida>();
  encerramentos = new Map<string, EncerramentoCorrida>();
  passagens: (Extract<Efeito, { tipo: 'passagem' }> & { corridaId: string })[] = [];
  leituras: (Extract<Efeito, { tipo: 'leitura_energia' }> & { corridaId: string })[] = [];
  snapshots: (Extract<Efeito, { tipo: 'snapshot' }> & { corridaId: string })[] = [];
  publicados: EventoPublicado[] = [];
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
  prazoLacunaMs = 5000;

  corrida!: ServicoCorrida;
  distribuicao!: ServicoDistribuicao;
  /** Publica no registro dos testes e repassa à distribuição, como o barramento real. */
  readonly eventosPublicados: PublicadorEventos = {
    publicar: (evento, dados) => {
      this.publicados.push({ evento, dados } as EventoPublicado);
      const d = this.distribuicao;
      if (!d) return;
      if (evento === 'mensagem-aplicada') d.aoAplicar(dados as MapaEventos['mensagem-aplicada']);
      if (evento === 'status-alterado') d.aoMudarStatus(dados as MapaEventos['status-alterado']);
      if (evento === 'alerta-tensao') d.aoAlertar(dados as MapaEventos['alerta-tensao']);
      if (evento === 'sinal-alterado') d.aoMudarSinal(dados as MapaEventos['sinal-alterado']);
    },
  };
  readonly servico: ServicoIngestao = this.novoServico();

  /** Serviços novos sobre os mesmos dados: simula o reinício do backend. */
  novoServico(): ServicoIngestao {
    this.corrida = this.novoServicoCorrida();
    this.distribuicao?.parar();
    this.distribuicao = new ServicoDistribuicao({
      corridas: this.corrida,
      log: SILENCIOSO,
      agora: () => this.relogio,
    });
    return new ServicoIngestao({
      eventos: this.eventosPublicados,
      validador: criarValidadorProtocolo(),
      contadores: this.contadores,
      agora: () => this.relogio,
      log: SILENCIOSO,
      tokens: { confere: async (token, hash) => hash === `hash:${token}` },
      dispositivos: {
        buscarPorIdentificador: async (identificador) =>
          this.dispositivos.get(identificador) ?? null,
      },
      corridas: this.corrida,
      gravador: {
        gravar: async (mensagem) => {
          if (this.falhaNaGravacao) {
            const erro = this.falhaNaGravacao;
            this.falhaNaGravacao = null;
            throw erro;
          }
          const chave = `${mensagem.corridaId}:${mensagem.sequencia}`;
          if (this.mensagens.has(chave)) return false;
          this.mensagens.set(chave, { ...mensagem, recebidaEm: this.relogio });
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

  private novoServicoCorrida(): ServicoCorrida {
    return new ServicoCorrida({
      log: SILENCIOSO,
      agora: () => this.relogio,
      prazoLacunaMs: this.prazoLacunaMs,
      eventos: this.eventosPublicados,
      projecoes: {
        passagem: async (corridaId, p) => {
          if (
            !this.passagens.some((x) => x.corridaId === corridaId && x.sequencia === p.sequencia)
          ) {
            this.passagens.push({ ...p, corridaId });
          }
        },
        leituraEnergia: async (corridaId, l) => {
          if (
            !this.leituras.some((x) => x.corridaId === corridaId && x.sequencia === l.sequencia)
          ) {
            this.leituras.push({ ...l, corridaId });
          }
        },
        snapshot: async (corridaId, s) => {
          if (
            !this.snapshots.some(
              (x) => x.corridaId === corridaId && x.sequenciaCorte === s.sequenciaCorte,
            )
          ) {
            this.snapshots.push({ ...s, corridaId });
          }
        },
      },
      corridas: {
        obterOuCriar: async (dados) => {
          const chave = `${dados.dispositivoId}/${dados.idCorridaRobo}`;
          let corrida = this.corridas.get(chave);
          if (!corrida) {
            corrida = {
              id: `corrida-${this.corridas.size + 1}`,
              labirinto: dados.labirinto,
              boot: dados.boot,
              status: 'EM_ANDAMENTO',
              motivo: null,
              dados,
            };
            this.corridas.set(chave, corrida);
          }
          const { dados: _, ...persistida } = corrida;
          return persistida;
        },
        definirInicio: async (corridaId, labirinto: TipoLabirinto) => {
          const corrida = this.porId(corridaId);
          if (corrida.labirinto === null) corrida.labirinto = labirinto;
        },
        mensagensGravadas: async (corridaId) =>
          [...this.mensagens.values()]
            .filter((m) => m.corridaId === corridaId)
            .sort((a, b) => a.sequencia - b.sequencia)
            .map((m) => ({ sequencia: m.sequencia, tempoMs: m.tempoRoboMs, payload: m.payload })),
        registrarProgresso: async (corridaId, progresso) => {
          if (['CONCLUIDA', 'FALHOU'].includes(this.porId(corridaId).status)) return;
          this.progresso.set(corridaId, {
            ultimaContigua: progresso.ultimaContigua,
            faltantes: progresso.faltantes,
          });
          this.progressoCompleto.set(corridaId, progresso);
        },
        encerrar: async (corridaId, encerramento) => {
          const corrida = this.porId(corridaId);
          if (['CONCLUIDA', 'FALHOU'].includes(corrida.status)) return;
          corrida.status = encerramento.status;
          corrida.motivo = encerramento.motivo;
          this.encerramentos.set(corridaId, encerramento);
          this.progresso.set(corridaId, {
            ultimaContigua: encerramento.ultimaContigua,
            faltantes: encerramento.faltantes,
          });
        },
        corridasEmAndamento: async () =>
          [...this.corridas.values()]
            .filter((c) => c.status === 'EM_ANDAMENTO')
            .map((c) => {
              const recebidas = [...this.mensagens.values()]
                .filter((m) => m.corridaId === c.id)
                .map((m) => m.recebidaEm);
              return {
                id: c.id,
                dispositivoId: c.dados.dispositivoId,
                idCorridaRobo: c.dados.idCorridaRobo,
                boot: c.boot,
                versaoProtocolo: c.dados.versaoProtocolo,
                ultimaMensagemEm: recebidas.length > 0 ? Math.max(...recebidas) : null,
              };
            }),
      },
    });
  }

  porId(corridaId: string): CorridaEmMemoria {
    const corrida = [...this.corridas.values()].find((c) => c.id === corridaId);
    if (!corrida) throw new Error(`corrida ${corridaId} não existe`);
    return corrida;
  }

  porIdRobo(idCorridaRobo: string): CorridaEmMemoria {
    const corrida = this.corridas.get(`${DISPOSITIVO.id}/${idCorridaRobo}`);
    if (!corrida) throw new Error(`corrida ${idCorridaRobo} não existe`);
    return corrida;
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

  /** Espera as gravações, os acks e todos os efeitos pendentes das corridas. */
  async esvaziar(): Promise<void> {
    await assentar();
    await this.corrida.esvaziar();
  }
}

const SILENCIOSO = { info: () => {}, warn: () => {}, error: () => {} };

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
