import { create } from 'zustand';
import type { EstadoConexao, SinalRobo } from '../dominio';

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
  conexao: {
    estado: EstadoConexao;
    sinal: SinalRobo;
    saude: SaudeBackend;
  };
  acoes: {
    definirEstadoConexao: (estado: EstadoConexao) => void;
    definirSinal: (sinal: SinalRobo) => void;
    definirSaude: (saude: SaudeBackend) => void;
  };
}

export const usePainel = create<EstadoPainel>()((set) => ({
  conexao: {
    estado: 'CONECTANDO',
    sinal: 'DESCONHECIDO',
    saude: { backend: 'desconhecido', banco: 'desconhecido' },
  },
  acoes: {
    definirEstadoConexao: (estado) => set((s) => ({ conexao: { ...s.conexao, estado } })),
    definirSinal: (sinal) => set((s) => ({ conexao: { ...s.conexao, sinal } })),
    definirSaude: (saude) => set((s) => ({ conexao: { ...s.conexao, saude } })),
  },
}));
