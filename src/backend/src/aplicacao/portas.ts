/**
 * Portas (interfaces) que a aplicação exige da infraestrutura. As implementações ficam em
 * `infra/`; os testes unitários usam versões em memória.
 */
import type {
  Efeito,
  Metricas,
  MotivoTermino,
  StatusCorrida,
  TipoLabirinto,
} from '../dominio/index.js';
import type {
  CorridaResumo,
  DetalheCorrida,
  ItemLinhaDoTempo,
  PosicaoLeaderboard,
} from '../../protocolo/tipos.js';

export interface Dispositivo {
  id: string;
  identificador: string;
  tokenHash: string;
  ativo: boolean;
}

export interface RepositorioDispositivos {
  buscarPorIdentificador(identificador: string): Promise<Dispositivo | null>;
}

export interface VerificadorToken {
  confere(token: string, hash: string): Promise<boolean>;
}

export interface DadosNovaCorrida {
  dispositivoId: string;
  /** Id da corrida gerado pelo robô. */
  idCorridaRobo: string;
  boot: string;
  versaoProtocolo: number;
  /** Nulo quando a primeira mensagem recebida não é o `inicio_corrida`. */
  labirinto: TipoLabirinto | null;
  tempoInicioRoboMs: number | null;
}

export interface CorridaPersistida {
  id: string;
  labirinto: TipoLabirinto | null;
  boot: string;
  status: StatusCorrida;
  motivo: MotivoTermino | null;
}

export interface MensagemGravada {
  sequencia: number;
  tempoMs: number;
  /** A mensagem como chegou do robô, para reconstruir o estado (RNF-52). */
  payload: unknown;
}

/** Corrida em andamento no banco, carregada quando o backend inicia (RNF-52). */
export interface CorridaEmAndamento {
  id: string;
  dispositivoId: string;
  idCorridaRobo: string;
  boot: string;
  versaoProtocolo: number;
  /** Quando chegou a última mensagem da corrida, em ms desde 1970; `null` se nenhuma. */
  ultimaMensagemEm: number | null;
}

/** Valores que a corrida guarda enquanto está em andamento. */
export interface ProgressoCorrida {
  ultimaContigua: number;
  faltantes: number;
  metricas: Metricas;
}

/** Valores gravados quando a corrida termina, de uma vez, antes de ela ficar imutável. */
export interface EncerramentoCorrida extends ProgressoCorrida {
  status: StatusCorrida;
  motivo: MotivoTermino;
  detalhe: string | null;
  /** Relógio do robô no `fim_corrida`; `null` quando a corrida foi interrompida. */
  tempoFimRoboMs: number | null;
}

export interface RepositorioCorridas {
  /**
   * Cria a corrida se ainda não existir para o par (dispositivo, id do robô) — RF-78. A
   * corrida nova entra na apresentação ativa e, se o labirinto já é conhecido, recebe o número
   * da tentativa (RF-97).
   */
  obterOuCriar(dados: DadosNovaCorrida): Promise<CorridaPersistida>;
  /**
   * Preenche o labirinto de uma corrida criada antes de o `inicio_corrida` chegar, e a numera
   * na apresentação (RF-97).
   */
  definirInicio(
    corridaId: string,
    labirinto: TipoLabirinto,
    tempoInicioRoboMs: number,
  ): Promise<void>;
  /** Mensagens já gravadas, em ordem de sequência, para reconstruir o estado (RNF-52). */
  mensagensGravadas(corridaId: string): Promise<MensagemGravada[]>;
  /** Atualiza o progresso de uma corrida que ainda não terminou. */
  registrarProgresso(corridaId: string, progresso: ProgressoCorrida): Promise<void>;
  /** Grava o status final, o motivo e as métricas finais (RF-81, RF-87). */
  encerrar(corridaId: string, encerramento: EncerramentoCorrida): Promise<void>;
  corridasEmAndamento(): Promise<CorridaEmAndamento[]>;
}

/** Projeções das mensagens, para consultas rápidas (arquitetura do backend, §7.1). */
export interface RepositorioProjecoes {
  passagem(corridaId: string, passagem: Extract<Efeito, { tipo: 'passagem' }>): Promise<void>;
  leituraEnergia(
    corridaId: string,
    leitura: Extract<Efeito, { tipo: 'leitura_energia' }>,
  ): Promise<void>;
  snapshot(corridaId: string, snapshot: Extract<Efeito, { tipo: 'snapshot' }>): Promise<void>;
}

export interface MensagemParaGravar {
  corridaId: string;
  sequencia: number;
  tipo: string;
  tempoRoboMs: number;
  versaoProtocolo: number;
  /** A mensagem exatamente como chegou (RF-79). */
  payload: unknown;
}

export interface GravadorMensagens {
  /**
   * Grava a mensagem de forma durável. Resolve com `true` se ela foi inserida e `false`
   * se já existia (duplicata detectada pela chave do banco). Só resolve após o commit.
   */
  gravar(mensagem: MensagemParaGravar): Promise<boolean>;
}

export type TipoEventoConexao =
  'CONECTADO' | 'SINAL_PERDIDO' | 'SINAL_RETOMADO' | 'DESCONECTADO' | 'REINICIO_DETECTADO';

export interface Rejeicao {
  dispositivoId: string | null;
  corridaRobo: string | null;
  sequencia: number | null;
  motivoCodigo: string;
  detalhe: string;
  payload: unknown;
}

export interface RegistroAuditoria {
  eventoConexao(evento: {
    dispositivoId: string;
    corridaId: string | null;
    tipo: TipoEventoConexao;
    boot: string;
  }): Promise<void>;
  rejeicao(rejeicao: Rejeicao): Promise<void>;
}

export interface Contadores {
  mensagensAceitas: number;
  mensagensDuplicadas: number;
  mensagensRejeitadas: number;
  conexoesRecusadas: number;
}

export interface RegistroLog {
  info(dados: object, mensagem: string): void;
  warn(dados: object, mensagem: string): void;
  error(dados: object, mensagem: string): void;
}

/** Filtros da listagem já interpretados: os ausentes são `null`. */
export interface FiltrosListagem {
  tipo: TipoLabirinto | null;
  status: StatusCorrida | null;
  /** Corridas iniciadas a partir deste instante (inclusive). */
  de: Date | null;
  /** Corridas iniciadas antes deste instante (exclusive). */
  antesDe: Date | null;
  limite: number;
  deslocamento: number;
}

/** Consultas de leitura para a API HTTP (ServicoConsulta, arquitetura do backend §3.1). */
export interface RepositorioConsulta {
  /** Uma página da listagem, da mais recente para a mais antiga, e o total dos filtros (RF-93). */
  listarCorridas(filtros: FiltrosListagem): Promise<{ itens: CorridaResumo[]; total: number }>;
  /** `null` quando a corrida não existe. */
  detalheCorrida(corridaId: string): Promise<DetalheCorrida | null>;
  /** Corridas CONCLUIDA e não anuladas do labirinto, já com a posição (RF-95). */
  leaderboard(
    labirinto: TipoLabirinto,
    apresentacaoId: string | null,
  ): Promise<PosicaoLeaderboard[]>;
}

/** As mensagens gravadas de uma corrida, em lotes por sequência (RF-94, RF-98). */
export interface RepositorioLinhaDoTempo {
  corridaExiste(corridaId: string): Promise<boolean>;
  /** Até `limite` mensagens com sequência maior que `depoisDe`, em ordem de sequência. */
  mensagensDepoisDe(
    corridaId: string,
    depoisDe: number,
    limite: number,
  ): Promise<ItemLinhaDoTempo[]>;
}
