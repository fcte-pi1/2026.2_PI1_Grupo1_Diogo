import { create } from 'zustand';
import type { DadosExecucao, EstadoConexao, PontoTrajeto, SinalRobo } from '../dominio';
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
  conexao: {
    estado: EstadoConexao;
    sinal: SinalRobo;
    saude: SaudeBackend;
  };
  acoes: {
    atualizarExecucao: (dados: Partial<DadosExecucao>) => void;
    adicionarPontoTrajeto: (ponto: PontoTrajeto) => void;
    definirEstadoConexao: (estado: EstadoConexao) => void;
    definirSinal: (sinal: SinalRobo) => void;
    definirSaude: (saude: SaudeBackend) => void;
  };
}

export const usePainel = create<EstadoPainel>()((set) => ({
  aoVivo: execucaoInicial,
  conexao: {
    estado: 'CONECTANDO',
    sinal: 'DESCONHECIDO',
    saude: { backend: 'desconhecido', banco: 'desconhecido' },
  },
  acoes: {
    atualizarExecucao: (dados) => set((s) => ({ aoVivo: { ...s.aoVivo, ...dados } })),
    adicionarPontoTrajeto: (ponto) =>
      set((s) =>
        s.aoVivo.trajeto.some((atual) => atual.seq === ponto.seq)
          ? s
          : { aoVivo: { ...s.aoVivo, trajeto: [...s.aoVivo.trajeto, ponto].sort((a, b) => a.seq - b.seq) } },
      ),
    definirEstadoConexao: (estado) => set((s) => ({ conexao: { ...s.conexao, estado } })),
    definirSinal: (sinal) => set((s) => ({ conexao: { ...s.conexao, sinal } })),
    definirSaude: (saude) => set((s) => ({ conexao: { ...s.conexao, saude } })),
  },
}));
