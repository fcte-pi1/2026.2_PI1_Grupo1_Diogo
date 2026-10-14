/**
 * Portas (interfaces) que a aplicação exige da infraestrutura. As implementações ficam em
 * `infra/`; os testes unitários usam versões em memória.
 */
import type { TipoLabirinto } from '../dominio/index.js';

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
}

export interface SequenciaGravada {
  sequencia: number;
  tempoMs: number;
}

export interface RepositorioCorridas {
  /** Cria a corrida se ainda não existir para o par (dispositivo, id do robô) — RF-78. */
  obterOuCriar(dados: DadosNovaCorrida): Promise<CorridaPersistida>;
  /** Preenche o labirinto de uma corrida criada antes de o `inicio_corrida` chegar. */
  definirInicio(
    corridaId: string,
    labirinto: TipoLabirinto,
    tempoInicioRoboMs: number,
  ): Promise<void>;
  /** Sequências já gravadas, para reconstruir o estado após um reinício (RNF-52). */
  sequenciasGravadas(corridaId: string): Promise<SequenciaGravada[]>;
  registrarProgresso(corridaId: string, ultimaContigua: number, faltantes: number): Promise<void>;
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
