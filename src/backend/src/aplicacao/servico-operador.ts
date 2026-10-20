/**
 * Ações do operador (RF-96, RF-97, RNF-55): login, anulação de corrida e apresentações.
 * São as únicas escritas que não vêm do robô; as rotas exigem o operador autenticado.
 */
import type { AnulacaoCorrida, Apresentacao } from '../../protocolo/tipos.js';
import type { PublicadorEventos } from './eventos.js';
import type {
  RepositorioAnulacao,
  RepositorioApresentacoes,
  RepositorioOperadores,
  VerificadorToken,
} from './portas.js';

/** O operador depois do login: o que vai no token. */
export interface OperadorAutenticado {
  id: string;
  login: string;
  nome: string;
}

/**
 * Hash de uma senha qualquer, para conferir mesmo quando o login não existe: assim, a
 * resposta demora o mesmo nos dois casos e não revela quais logins existem.
 */
const HASH_FALSO =
  '$argon2id$v=19$m=65536,p=4,t=3$G+vJTj/WMh/pHU1lrT8ICQ$1FZglrww75b3XWF4VhhYjQ5F+BAzaFsFZdEvduhchMA';

export class ServicoAutenticacao {
  constructor(
    private readonly deps: { operadores: RepositorioOperadores; senhas: VerificadorToken },
  ) {}

  /** `null` quando o login ou a senha não conferem (a mesma resposta para os dois). */
  async entrar(login: string, senha: string): Promise<OperadorAutenticado | null> {
    const operador = await this.deps.operadores.buscarPorLogin(login);
    const confere = await this.deps.senhas.confere(senha, operador?.senhaHash ?? HASH_FALSO);
    if (!operador || !confere) return null;
    return { id: operador.id, login: operador.login, nome: operador.nome };
  }
}

export type MotivoRecusaAnulacao =
  'MOTIVO_VAZIO' | 'CORRIDA_NAO_ENCONTRADA' | 'CORRIDA_EM_ANDAMENTO' | 'CORRIDA_JA_ANULADA';

/** A anulação foi recusada por uma regra da HU-BE-25. */
export class AnulacaoRecusada extends Error {
  constructor(readonly codigo: MotivoRecusaAnulacao) {
    super(codigo);
  }
}

export class ServicoAnulacao {
  constructor(
    private readonly deps: { anulacoes: RepositorioAnulacao; eventos: PublicadorEventos },
  ) {}

  /**
   * Anula uma corrida terminada, com justificativa (RF-96, HU-BE-25). A corrida não muda: a
   * anulação fica só em `anulacao`, com autor, data e motivo (RNF-54), e tira a corrida do
   * ranking. Uma corrida em andamento não pode ser anulada, e cada corrida, só uma vez.
   */
  async anular(
    corridaId: string,
    operador: OperadorAutenticado,
    motivo: string,
  ): Promise<AnulacaoCorrida> {
    const justificativa = motivo.trim();
    if (justificativa === '') throw new AnulacaoRecusada('MOTIVO_VAZIO');
    const corrida = await this.deps.anulacoes.situacao(corridaId);
    if (!corrida) throw new AnulacaoRecusada('CORRIDA_NAO_ENCONTRADA');
    if (corrida.status === 'EM_ANDAMENTO') throw new AnulacaoRecusada('CORRIDA_EM_ANDAMENTO');
    if (corrida.anulada) throw new AnulacaoRecusada('CORRIDA_JA_ANULADA');

    const anulacao = await this.deps.anulacoes.anular(corridaId, operador.id, justificativa);
    if (!anulacao) throw new AnulacaoRecusada('CORRIDA_JA_ANULADA');
    // Só uma corrida CONCLUIDA estava no ranking: os painéis buscam o ranking de novo.
    if (corrida.status === 'CONCLUIDA' && corrida.labirinto) {
      this.deps.eventos.publicar('ranking-alterado', { corridaId, labirinto: corrida.labirinto });
    }
    return anulacao;
  }
}

export class ServicoApresentacoes {
  constructor(private readonly apresentacoes: RepositorioApresentacoes) {}

  listar(): Promise<Apresentacao[]> {
    return this.apresentacoes.listar();
  }

  /** Abre uma apresentação: as corridas novas entram nela e são numeradas nela (RF-97). */
  abrir(nome: string): Promise<Apresentacao> {
    return this.apresentacoes.abrir(nome.trim());
  }

  /** Encerra a apresentação; as corridas novas ficam sem apresentação até abrir outra. */
  encerrar(id: string): Promise<Apresentacao | null> {
    return this.apresentacoes.encerrar(id);
  }
}
