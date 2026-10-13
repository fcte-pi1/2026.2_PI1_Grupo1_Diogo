import { create } from 'zustand';
import type {
  AmostraEnergia,
  CelulaMapa,
  DadosExecucao,
  EstadoConexao,
  PontoTrajeto,
  SinalRobo,
} from '../dominio';
import { execucaoInicial } from '../dominio';

/** Saúde do backend (GET /health): prova de vida do ambiente. */
export interface SaudeBackend {
  backend: 'ok' | 'indisponivel' | 'desconhecido';
  banco: 'ok' | 'indisponivel' | 'desconhecido';
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
    registrarMensagem: () => void;
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
    reiniciarExecucao: (dados) => set(() => ({ aoVivo: { ...execucaoInicial, ...dados } })),
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
