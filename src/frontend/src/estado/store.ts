import { create } from 'zustand';
import type {
  AmostraEnergia,
  CelulaMapa,
  DadosExecucao,
  ErroDetalhe,
  ErroHistorico,
  EstadoConexao,
  FiltroTipoLabirinto,
  LeituraDepuracao,
  PontoTrajeto,
  SinalRobo,
  SituacaoDetalhe,
} from '../dominio';
import { LIMITE_AMOSTRAS_ENERGIA, TAMANHO_PAGINA_HISTORICO, execucaoInicial } from '../dominio';
import type { CorridaResumo } from '../protocolo';

/** Saúde do backend (GET /health): prova de vida do ambiente. */
export interface SaudeBackend {
  backend: 'ok' | 'indisponivel' | 'desconhecido';
  banco: 'ok' | 'indisponivel' | 'desconhecido';
}

/** Fatia `historico`: consulta atual e o resultado dela (HU-FE-09, HU-FE-10). */
export interface FatiaHistorico {
  filtro: FiltroTipoLabirinto;
  /** Começa em 1. */
  pagina: number;
  tamanhoPagina: number;
  /** Só contém itens da consulta atual: é esvaziada sempre que uma nova consulta começa. */
  itens: CorridaResumo[];
  /** Total de corridas do filtro atual (todas as páginas). */
  total: number;
  carregando: boolean;
  erro: ErroHistorico | null;
}

export const historicoInicial: FatiaHistorico = {
  filtro: 'TODOS',
  pagina: 1,
  tamanhoPagina: TAMANHO_PAGINA_HISTORICO,
  itens: [],
  total: 0,
  carregando: true,
  erro: null,
};

/** Execução do histórico já convertida para os dados da tela (HU-FE-11). */
export interface ResultadoDetalhe {
  dados: DadosExecucao;
  /** Instante de início da execução, ISO 8601. */
  iniciadaEm: string;
}

/**
 * Fatia `detalhe`: a execução passada aberta em `/historico/:id`. Fica separada de `aoVivo`,
 * então mensagens do WebSocket nunca a alteram (HU-FE-11 CA2).
 */
export interface FatiaDetalhe {
  /** Id da execução solicitada; `null` fora da tela de detalhe. */
  corrida: string | null;
  situacao: SituacaoDetalhe;
  erro: ErroDetalhe | null;
  iniciadaEm: string | null;
  dados: DadosExecucao;
}

export const detalheInicial: FatiaDetalhe = {
  corrida: null,
  situacao: 'carregando',
  erro: null,
  iniciadaEm: null,
  dados: execucaoInicial,
};

/** Fatia `alertas`: avisos de comunicação que não cabem no estado da execução (HU-FE-13). */
export interface FatiaAlertas {
  /** Instante (ms) em que o sinal do robô foi retomado após uma perda; `null` se não houve. */
  retomadaEm: number | null;
}

/**
 * Store única do painel. Fatias previstas: conexao, aoVivo, detalhe, historico e alertas
 * (arquitetura do frontend, §3.1). No esqueleto, só a fatia `conexao` existe.
 * A store é usada também fora do React (adaptadores despacham ações por `getState()`).
 */
export interface EstadoPainel {
  aoVivo: DadosExecucao;
  telemetria: {
    mensagensRecebidas: number;
    ultimaMensagemEm: number | null;
  };
  conexao: {
    estado: EstadoConexao;
    sinal: SinalRobo;
    saude: SaudeBackend;
  };
  historico: FatiaHistorico;
  detalhe: FatiaDetalhe;
  alertas: FatiaAlertas;
  /** Última leitura bruta do modo de depuração; fora de `aoVivo`, para não tocar na tentativa (HU-FE-14 CA2). */
  depuracao: LeituraDepuracao | null;
  acoes: {
    atualizarExecucao: (dados: Partial<DadosExecucao>) => void;
    reiniciarExecucao: (dados?: Partial<DadosExecucao>) => void;
    /** Estado completo do backend (snapshot): substitui o mapa e as métricas, não mescla. */
    substituirSnapshot: (dados: Partial<DadosExecucao> & { corrida: string }) => void;
    /** Tipo de labirinto fora de 4x4/8x4/12x4: descarta a grade e sinaliza configuração inválida. */
    definirTipoInvalido: () => void;
    adicionarPontoTrajeto: (ponto: PontoTrajeto) => void;
    adicionarAmostraEnergia: (amostra: AmostraEnergia) => void;
    atualizarCelulaMapa: (celula: CelulaMapa) => void;
    definirEstadoConexao: (estado: EstadoConexao) => void;
    definirSinal: (sinal: SinalRobo) => void;
    definirSaude: (saude: SaudeBackend) => void;
    /** Substitui só a leitura bruta mais recente; a série de energia e o trajeto não mudam. */
    atualizarDepuracao: (leitura: LeituraDepuracao) => void;
    registrarMensagem: () => void;
    /** Troca o filtro: volta à página 1 e descarta a lista anterior. */
    definirFiltroHistorico: (filtro: FiltroTipoLabirinto) => void;
    /** Troca a página mantendo o filtro; descarta os itens da página anterior. */
    definirPaginaHistorico: (pagina: number) => void;
    /** Nova tentativa da consulta atual (após erro). */
    reconsultarHistorico: () => void;
    receberHistorico: (resposta: { itens: CorridaResumo[]; total: number }) => void;
    falharHistorico: (erro: ErroHistorico) => void;
    reiniciarHistorico: () => void;
    /** Começa a abrir uma execução do histórico: descarta a anterior. */
    iniciarDetalhe: (corrida: string) => void;
    /** Ignorada se o usuário já abriu outra execução (resposta atrasada). */
    receberDetalhe: (corrida: string, resultado: ResultadoDetalhe) => void;
    falharDetalhe: (corrida: string, erro: ErroDetalhe) => void;
    reiniciarDetalhe: () => void;
  };
}

export const usePainel = create<EstadoPainel>()((set) => ({
  aoVivo: execucaoInicial,
  telemetria: { mensagensRecebidas: 0, ultimaMensagemEm: null },
  conexao: {
    estado: 'CONECTANDO',
    sinal: 'DESCONHECIDO',
    saude: { backend: 'desconhecido', banco: 'desconhecido' },
  },
  historico: historicoInicial,
  detalhe: detalheInicial,
  alertas: { retomadaEm: null },
  depuracao: null,
  acoes: {
    atualizarExecucao: (dados) =>
      set((s) => {
        const tipoMudou =
          dados.tipoLabirinto !== undefined && dados.tipoLabirinto !== s.aoVivo.tipoLabirinto;
        return {
          aoVivo: {
            ...s.aoVivo,
            ...dados,
            tipoInvalido: dados.tipoLabirinto
              ? false
              : (dados.tipoInvalido ?? s.aoVivo.tipoInvalido),
            mapa: tipoMudou ? [] : s.aoVivo.mapa,
            trajeto: tipoMudou ? [] : s.aoVivo.trajeto,
            tempoMs: manterTempoMaisRecente(s.aoVivo.tempoMs, dados.tempoMs),
          },
        };
      }),
    reiniciarExecucao: (dados) =>
      set((s) => {
        const outraCorrida = dados?.corrida !== s.aoVivo.corrida;
        return {
          aoVivo: { ...execucaoInicial, ...dados },
          alertas: { retomadaEm: null },
          depuracao: null,
          // O sinal pertence à corrida: a perda de uma não vale para a seguinte.
          conexao: outraCorrida ? { ...s.conexao, sinal: 'DESCONHECIDO' as const } : s.conexao,
        };
      }),
    substituirSnapshot: (dados) =>
      set((s) => {
        const mesmaCorrida = s.aoVivo.corrida === dados.corrida;
        return {
          aoVivo: {
            ...execucaoInicial,
            // O snapshot não traz trajeto nem série de energia: na mesma corrida (reconexão),
            // o que já foi recebido continua válido (os eventos repetidos são descartados por `seq`).
            trajeto: mesmaCorrida ? s.aoVivo.trajeto : [],
            energia: mesmaCorrida ? s.aoVivo.energia : [],
            ...dados,
          },
        };
      }),
    definirTipoInvalido: () =>
      set((s) => ({
        aoVivo: {
          ...s.aoVivo,
          tipoLabirinto: null,
          tipoInvalido: true,
          mapa: [],
          trajeto: [],
          posicao: null,
        },
      })),
    adicionarPontoTrajeto: (ponto) =>
      set((s) =>
        s.aoVivo.trajeto.some((atual) => atual.seq === ponto.seq)
          ? s
          : {
              aoVivo: {
                ...s.aoVivo,
                trajeto: [...s.aoVivo.trajeto, ponto].sort((a, b) => a.seq - b.seq),
              },
            },
      ),
    adicionarAmostraEnergia: (amostra) =>
      set((s) => {
        const repetida =
          amostra.seq !== null && s.aoVivo.energia.some((atual) => atual.seq === amostra.seq);
        if (repetida) return s;
        return {
          aoVivo: {
            ...s.aoVivo,
            cargaPct: amostra.cargaPct,
            tensaoV: amostra.tensaoV,
            correnteA: amostra.correnteA,
            potenciaW: amostra.potenciaW,
            energia: [...s.aoVivo.energia, amostra].slice(-LIMITE_AMOSTRAS_ENERGIA),
          },
        };
      }),
    atualizarCelulaMapa: (celula) =>
      set((s) => {
        const mapa = s.aoVivo.mapa.filter((atual) => atual.x !== celula.x || atual.y !== celula.y);
        return { aoVivo: { ...s.aoVivo, mapa: [...mapa, celula] } };
      }),
    definirEstadoConexao: (estado) => set((s) => ({ conexao: { ...s.conexao, estado } })),
    definirSinal: (sinal) =>
      set((s) => ({
        conexao: { ...s.conexao, sinal },
        // Retomada = sai de PERDIDO para OK; uma nova perda apaga o aviso anterior.
        alertas: {
          retomadaEm:
            s.conexao.sinal === 'PERDIDO' && sinal === 'OK'
              ? Date.now()
              : sinal === 'PERDIDO'
                ? null
                : s.alertas.retomadaEm,
        },
      })),
    definirSaude: (saude) => set((s) => ({ conexao: { ...s.conexao, saude } })),
    atualizarDepuracao: (leitura) => set(() => ({ depuracao: leitura })),
    registrarMensagem: () =>
      set((s) => ({
        telemetria: {
          mensagensRecebidas: s.telemetria.mensagensRecebidas + 1,
          ultimaMensagemEm: Date.now(),
        },
      })),
    definirFiltroHistorico: (filtro) =>
      set((s) => ({
        historico: {
          ...s.historico,
          filtro,
          pagina: 1,
          itens: [],
          total: 0,
          carregando: true,
          erro: null,
        },
      })),
    definirPaginaHistorico: (pagina) =>
      set((s) => ({
        historico: { ...s.historico, pagina, itens: [], carregando: true, erro: null },
      })),
    reconsultarHistorico: () =>
      set((s) => ({
        historico: { ...s.historico, itens: [], total: 0, carregando: true, erro: null },
      })),
    receberHistorico: ({ itens, total }) =>
      set((s) => ({ historico: { ...s.historico, itens, total, carregando: false, erro: null } })),
    falharHistorico: (erro) =>
      set((s) => ({
        historico: { ...s.historico, itens: [], total: 0, carregando: false, erro },
      })),
    reiniciarHistorico: () => set(() => ({ historico: historicoInicial })),
    iniciarDetalhe: (corrida) => set(() => ({ detalhe: { ...detalheInicial, corrida } })),
    receberDetalhe: (corrida, { dados, iniciadaEm }) =>
      set((s) =>
        s.detalhe.corrida !== corrida
          ? s
          : { detalhe: { corrida, situacao: 'pronto', erro: null, iniciadaEm, dados } },
      ),
    falharDetalhe: (corrida, erro) =>
      set((s) =>
        s.detalhe.corrida !== corrida
          ? s
          : { detalhe: { ...detalheInicial, corrida, situacao: 'erro', erro } },
      ),
    reiniciarDetalhe: () => set(() => ({ detalhe: detalheInicial })),
  },
}));

function manterTempoMaisRecente(
  atual: number | null,
  recebido: number | null | undefined,
): number | null {
  if (recebido === undefined) return atual;
  if (atual === null || recebido === null) return recebido;
  return Math.max(atual, recebido);
}
