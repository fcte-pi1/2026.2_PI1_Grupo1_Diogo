/**
 * Ações do operador em memória (RF-96, RF-97), para montar o app nos testes sem banco.
 * O operador `op1` tem a senha `senha-op1` (a conferência é por igualdade, sem argon2).
 */
import type { AnulacaoCorrida, Apresentacao } from '../../protocolo/tipos.js';
import {
  ServicoAnulacao,
  ServicoApresentacoes,
  ServicoAutenticacao,
  type MapaEventos,
  type SituacaoCorrida,
} from '../../src/aplicacao/index.js';

export const SENHA_OP1 = 'senha-op1';
export const SEGREDO_JWT_TESTE = 'segredo-de-teste';

export function operadorEmMemoria() {
  const corridas = new Map<string, SituacaoCorrida>();
  const anulacoes = new Map<string, AnulacaoCorrida & { operadorId: string }>();
  const apresentacoesLista: Apresentacao[] = [];
  const eventos: { evento: keyof MapaEventos; dados: unknown }[] = [];
  let sequencia = 0;

  const autenticacao = new ServicoAutenticacao({
    operadores: {
      buscarPorLogin: async (login) =>
        login === 'op1'
          ? { id: 'operador-1', login: 'op1', nome: 'Operador 1', senhaHash: `hash:${SENHA_OP1}` }
          : null,
    },
    senhas: { confere: async (senha, hash) => hash === `hash:${senha}` },
  });

  const anulacao = new ServicoAnulacao({
    anulacoes: {
      situacao: async (id) => {
        const c = corridas.get(id);
        return c ? { ...c, anulada: anulacoes.has(id) } : null;
      },
      anular: async (id, operadorId, motivo) => {
        if (anulacoes.has(id)) return null;
        const registro = { motivo, anulada_em: new Date(0).toISOString(), operador: 'op1' };
        anulacoes.set(id, { ...registro, operadorId });
        return registro;
      },
    },
    eventos: { publicar: (evento, dados) => eventos.push({ evento, dados }) },
  });

  const apresentacoes = new ServicoApresentacoes({
    listar: async () => [...apresentacoesLista],
    abrir: async (nome) => {
      for (const a of apresentacoesLista) a.ativa = false;
      const nova = {
        id: `00000000-0000-4000-8000-${String(++sequencia).padStart(12, '0')}`,
        nome,
        data: '2026-10-20',
        ativa: true,
        criada_em: new Date(0).toISOString(),
      };
      apresentacoesLista.push(nova);
      return { ...nova };
    },
    encerrar: async (id) => {
      const a = apresentacoesLista.find((x) => x.id === id);
      if (!a) return null;
      a.ativa = false;
      return { ...a };
    },
  });

  return {
    deps: { autenticacao, anulacao, apresentacoes, jwtSegredo: SEGREDO_JWT_TESTE },
    corridas,
    anulacoes,
    apresentacoesLista,
    eventos,
  };
}
