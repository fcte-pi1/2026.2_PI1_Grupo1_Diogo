import { create } from 'zustand';
import type {
  AmostraEnergia,
  CelulaMapa,
  DadosExecucao,
  ErroHistorico,
  EstadoConexao,
  FiltroTipoLabirinto,
  PontoTrajeto,
  SinalRobo,
} from '../dominio';
import { TAMANHO_PAGINA_HISTORICO, execucaoInicial } from '../dominio';
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
  acoes: {
    atualizarExecucao: (dados: Partial<DadosExecucao>) => void;
    reiniciarExecucao: (dados?: Partial<DadosExecucao>) => void;
    adicionarPontoTrajeto: (ponto: PontoTrajeto) => void;
    adicionarAmostraEnergia: (amostra: AmostraEnergia) => void;
    atualizarCelulaMapa: (celula: CelulaMapa) => void;
    definirEstadoConexao: (estado: EstadoConexao) => void;
    definirSinal: (sinal: SinalRobo) => void;
    definirSaude: (saude: SaudeBackend) => void;
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
  acoes: {
    atualizarExecucao: (dados) =>
      set((s) => {
        const tipoMudou =
          dados.tipoLabirinto !== undefined && dados.tipoLabirinto !== s.aoVivo.tipoLabirinto;
        return {
          aoVivo: {
            ...s.aoVivo,
            ...dados,
            mapa: tipoMudou ? [] : s.aoVivo.mapa,
            trajeto: tipoMudou ? [] : s.aoVivo.trajeto,
            tempoMs: manterTempoMaisRecente(s.aoVivo.tempoMs, dados.tempoMs),
          },
        };
      }),
    reiniciarExecucao: (dados) => set(() => ({ aoVivo: { ...execucaoInicial, ...dados } })),
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
            energia: [...s.aoVivo.energia, amostra].slice(-6000),
          },
        };
      }),
    atualizarCelulaMapa: (celula) =>
      set((s) => {
        const mapa = s.aoVivo.mapa.filter((atual) => atual.x !== celula.x || atual.y !== celula.y);
        return { aoVivo: { ...s.aoVivo, mapa: [...mapa, celula] } };
      }),
    definirEstadoConexao: (estado) => set((s) => ({ conexao: { ...s.conexao, estado } })),
    definirSinal: (sinal) => set((s) => ({ conexao: { ...s.conexao, sinal } })),
    definirSaude: (saude) => set((s) => ({ conexao: { ...s.conexao, saude } })),
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
