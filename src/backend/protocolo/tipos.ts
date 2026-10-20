/**
 * Tipos do protocolo de telemetria v1 (arquitetura do backend, §2.5).
 * Compartilhados com o simulador e com o frontend (alias `@protocolo`).
 *
 * ATENÇÃO: este arquivo não pode importar nada — ele é compilado tanto pelo backend
 * quanto pelo bundler do frontend.
 *
 * As mensagens do robô e do painel para o backend são validadas pelos esquemas JSON em
 * `protocolo/v1/` (fonte da verdade, RNF-57). Mantenha os dois em sincronia: o teste
 * `testes/unit/protocolo/validador.test.ts` falha se um exemplo tipado aqui não passar
 * no esquema. Convenções (coordenadas, paredes, tempo) em `protocolo/v1/README.md`.
 */

export const VERSAO_PROTOCOLO = 1 as const;

/** Versões aceitas pelo backend: a atual e a anterior (RNF-57). */
export const VERSOES_SUPORTADAS: readonly number[] = [1];

export type TipoLabirinto = '4x4' | '8x4' | '12x4';

/** Para onde a frente do robô aponta. */
export type Orientacao = 'NORTE' | 'LESTE' | 'SUL' | 'OESTE';

/** Presença de parede em cada lado da célula (`true` = parede presente). */
export interface Paredes {
  norte: boolean;
  leste: boolean;
  sul: boolean;
  oeste: boolean;
}

export type EstadoNavegacao =
  'INICIALIZANDO' | 'AGUARDANDO' | 'MAPEANDO' | 'RESOLVENDO' | 'CONCLUIDO' | 'ERRO';

export type StatusCorrida = 'EM_ANDAMENTO' | 'CONCLUIDA' | 'FALHOU' | 'INTERROMPIDA';

export type MotivoTermino = 'SUCESSO' | 'FALHA_REPORTADA' | 'SEM_SINAL' | 'REINICIO_ROBO';

// ============================================================================
// Robô → Backend (/ws/telemetria)
// ============================================================================

export interface Hello {
  tipo: 'hello';
  versao: typeof VERSAO_PROTOCOLO;
  dispositivo: string;
  token: string;
  /** Valor aleatório gerado a cada boot do ESP32. */
  boot: string;
}

/** Envelope comum a todas as mensagens do robô, exceto `hello`. */
export interface Envelope<T extends string> {
  versao: typeof VERSAO_PROTOCOLO;
  tipo: T;
  /** Id da corrida gerado pelo robô (letras, dígitos, `_` e `-`; até 64 caracteres). */
  corrida: string;
  /** Inteiro ≥ 1, crescente por corrida. */
  sequencia: number;
  /** Milissegundos no relógio do robô (relógio oficial, RF-82). */
  tempo_ms: number;
}

export interface InicioCorrida extends Envelope<'inicio_corrida'> {
  labirinto: TipoLabirinto;
}

/** Célula visitada com as paredes detectadas (evento discreto). */
export interface Celula extends Envelope<'celula'> {
  x: number;
  y: number;
  paredes: Paredes;
}

/** Posição atual (dado contínuo). */
export interface Posicao extends Envelope<'posicao'> {
  x: number;
  y: number;
  orientacao: Orientacao;
  /** Contador de células percorridas. */
  celulas: number;
  /** Informativo: a velocidade oficial é derivada pelo backend (RF-83). */
  velocidade_media_mps?: number;
}

/** Leitura do INA219 (dado contínuo). */
export interface Energia extends Envelope<'energia'> {
  tensao_v: number;
  corrente_a: number;
  potencia_w: number;
}

/** Estado de navegação, enviado a cada transição (evento discreto). */
export interface Estado extends Envelope<'estado'> {
  estado: EstadoNavegacao;
}

export interface FimCorrida extends Envelope<'fim_corrida'> {
  resultado: 'sucesso' | 'falha';
  detalhe?: string;
}

export type MensagemCorrida = InicioCorrida | Celula | Posicao | Energia | Estado | FimCorrida;

export type MensagemRobo = Hello | MensagemCorrida;

export type TipoMensagemRobo = MensagemCorrida['tipo'];

export const TIPOS_MENSAGEM_ROBO: readonly TipoMensagemRobo[] = [
  'inicio_corrida',
  'celula',
  'posicao',
  'energia',
  'estado',
  'fim_corrida',
];

// ============================================================================
// Backend → Robô
// ============================================================================

/** Confirmação cumulativa. Informativa: o robô não é obrigado a processá-la (RF-74). */
export interface Ack {
  tipo: 'ack';
  corrida: string;
  /** Maior sequência contígua gravada. */
  sequencia: number;
}

/** Códigos de fechamento enviados ao robô. */
export const CodigoFechamento = {
  /** Dispositivo desconhecido, desativado ou token incorreto. */
  TOKEN_INVALIDO: 4001,
  VERSAO_NAO_SUPORTADA: 4002,
  /** A primeira mensagem não é um `hello` bem formado, ou ele não chegou em 5 s. */
  HELLO_INVALIDO: 4003,
} as const;

// ============================================================================
// Painel → Backend (/ws/painel) — somente leitura (RNF-55)
// ============================================================================

export type MensagemPainelEntrada =
  | { tipo: 'inscrever' | 'cancelar'; corrida: string }
  | { tipo: 'inscrever' | 'cancelar'; canal: 'ao_vivo' };

// ============================================================================
// Backend → Painel (/ws/painel)
// ============================================================================
// `corrida` aqui é sempre o id (UUID) da corrida no backend, não o id gerado pelo robô.

/** Métricas derivadas pelo backend. `null` quando ainda não há amostra (nunca 0 por omissão). */
export interface Metricas {
  tempo_decorrido_ms: number | null;
  /** Definido só quando a corrida termina com sucesso (RF-82). */
  tempo_conclusao_ms: number | null;
  celulas_percorridas: number;
  distancia_m: number;
  velocidade_media_mps: number | null;
  tensao_v: number | null;
  corrente_a: number | null;
  potencia_w: number | null;
  carga_estimada_pct: number | null;
  delta_v: number | null;
}

export interface CelulaMapa {
  x: number;
  y: number;
  paredes: Paredes;
}

export interface PosicaoRobo {
  x: number;
  y: number;
  orientacao: Orientacao;
}

/** Estado completo na entrada do painel ou na reconexão (RF-89). Substitui, não mescla. */
export interface SnapshotPainel {
  tipo: 'snapshot';
  corrida: string;
  /** `null` quando o `inicio_corrida` ainda não chegou. */
  labirinto: TipoLabirinto | null;
  /** Eventos com sequencia ≤ sequencia_corte já estão refletidos neste snapshot. */
  sequencia_corte: number;
  /** Células conhecidas, com as paredes detectadas. */
  mapa: CelulaMapa[];
  posicao: PosicaoRobo | null;
  metricas: Metricas;
  status: StatusCorrida;
  motivo_termino: MotivoTermino | null;
  /** Tempo do robô no início da corrida, âncora do cronômetro do painel. */
  tempo_inicio_ms: number | null;
  /**
   * Estado do sinal do robô agora. Quem se inscreve durante uma perda de sinal já sabe dela,
   * sem esperar o próximo `sinal` (RF-92).
   */
  sinal: 'NORMAL' | 'PERDIDO';
}

export interface EventoCelulaPainel {
  tipo: 'evento';
  evento: 'celula';
  corrida: string;
  sequencia: number;
  tempo_ms: number;
  x: number;
  y: number;
  paredes: Paredes;
  revisita: boolean;
  metricas: Metricas;
}

export interface EventoStatusPainel {
  tipo: 'evento';
  evento: 'status';
  corrida: string;
  /**
   * Sequência do `fim_corrida` que mudou o status. `null` numa interrupção (silêncio ou
   * reinício), que não vem de uma mensagem do robô: o painel não deve descartá-la.
   */
  sequencia: number | null;
  /** Relógio do robô no `fim_corrida`; `null` numa interrupção. */
  tempo_ms: number | null;
  status: StatusCorrida;
  motivo_termino: MotivoTermino | null;
  detalhe: string | null;
  metricas: Metricas;
}

/** Última posição e energia, no máximo 10/s por corrida (RF-90). */
export interface ContinuoPainel {
  tipo: 'continuo';
  corrida: string;
  tempo_ms: number;
  posicao: PosicaoRobo | null;
  energia: { tensao_v: number; corrente_a: number; potencia_w: number } | null;
  metricas: Metricas;
}

export interface SinalPainel {
  tipo: 'sinal';
  corrida: string;
  estado: 'PERDIDO' | 'RETOMADO';
}

export interface AlertaPainel {
  tipo: 'alerta';
  corrida: string;
  alerta: 'TENSAO_BAIXA';
  tensao_v: number;
}

/** Resumo de início, fim e status de qualquer corrida (canal `ao_vivo`). */
export interface AoVivoPainel {
  tipo: 'ao_vivo';
  corrida: string;
  /** `null` quando o `inicio_corrida` ainda não chegou. */
  labirinto: TipoLabirinto | null;
  status: StatusCorrida;
}

export interface LeaderboardPainel {
  tipo: 'leaderboard';
  labirinto: TipoLabirinto;
}

/**
 * Enviada a cada 1 s, também fora das corridas, para o watchdog de conexão do painel
 * (a API WebSocket do navegador não expõe ping/pong).
 */
export interface KeepalivePainel {
  tipo: 'keepalive';
}

export type MensagemPainelSaida =
  | SnapshotPainel
  | EventoCelulaPainel
  | EventoStatusPainel
  | ContinuoPainel
  | SinalPainel
  | AlertaPainel
  | AoVivoPainel
  | LeaderboardPainel
  | KeepalivePainel;

// ============================================================================
// API HTTP — GET /api/corridas (listagem do histórico, RF-93)
// ============================================================================
// Referência: `protocolo/v1/API.md`.

/** Tamanho de página usado quando `tamanho` não é informado. */
export const TAMANHO_PAGINA_PADRAO = 20;
/** Maior `tamanho` atendido. Pedidos acima disso são limitados a este valor. */
export const TAMANHO_PAGINA_MAXIMO = 100;

/** Parâmetros de consulta de `GET /api/corridas`. Todos são opcionais e combináveis. */
export interface FiltrosListaCorridas {
  /** Só corridas deste tipo de labirinto. Sem o parâmetro, todos os tipos. */
  tipo?: TipoLabirinto;
  status?: StatusCorrida;
  /** Início do período, ISO 8601: corridas iniciadas a partir deste instante. */
  de?: string;
  /** Fim do período, ISO 8601: corridas iniciadas até este instante. */
  ate?: string;
  /** Começa em 1. Padrão: 1. */
  pagina?: number;
  /** Itens por página, de 1 a 100. Padrão: 20. */
  tamanho?: number;
}

/** Uma corrida na listagem do histórico. */
export interface CorridaResumo {
  /** Id (UUID) da corrida no backend. É o mesmo usado em `/api/corridas/{id}` e no painel. */
  id: string;
  /** Instante em que o backend recebeu a corrida, ISO 8601 em UTC. */
  iniciada_em: string;
  /** `null` quando o `inicio_corrida` ainda não chegou (corrida criada após uma perda). */
  tipo_labirinto: TipoLabirinto | null;
  /** Número da tentativa na apresentação; `null` para corridas fora de apresentação. */
  numero_tentativa: number | null;
  status: StatusCorrida;
  /** `null` enquanto a corrida está em andamento. */
  motivo_termino: MotivoTermino | null;
  /** Tempo oficial, pelo relógio do robô. Só existe para corridas concluídas com sucesso. */
  tempo_conclusao_ms: number | null;
  /** A corrida foi anulada por um operador (RF-96). */
  anulada: boolean;
}

/** Resposta de `GET /api/corridas`, da corrida mais recente para a mais antiga. */
export interface RespostaListaCorridas {
  itens: CorridaResumo[];
  /** Total de corridas que atendem aos filtros, somando todas as páginas. */
  total: number;
  /** Página devolvida, começando em 1. */
  pagina: number;
  /** Tamanho de página aplicado, já limitado ao máximo. */
  tamanho: number;
}

// ============================================================================
// API HTTP — GET /api/corridas/{id} (detalhe da corrida, RF-84, RF-85)
// ============================================================================
// Referência: `protocolo/v1/API.md`.

/** Uma passagem por célula: um ponto do trajeto, em ordem de sequência (RF-84). */
export interface PassagemCorrida {
  sequencia: number;
  /** Posição da passagem no trajeto, começando em 1. */
  ordem: number;
  x: number;
  y: number;
  paredes: Paredes;
  tempo_ms: number;
  /** A célula já tinha sido visitada antes nesta corrida. */
  revisita: boolean;
}

/** Uma leitura do INA219 (RF-85). */
export interface LeituraEnergiaCorrida {
  sequencia: number;
  tempo_ms: number;
  tensao_v: number;
  corrente_a: number;
  potencia_w: number;
}

/** Métricas derivadas pelo backend. Numa corrida em andamento, são as mais recentes. */
export interface MetricasCorrida {
  /** Do `inicio_corrida` até o fim (ou até a última mensagem), no relógio do robô. */
  tempo_decorrido_ms: number | null;
  /** Tempo oficial: só existe para corridas concluídas com sucesso (RF-82). */
  tempo_conclusao_ms: number | null;
  /** Movimentos entre células (as passagens menos a de partida). */
  celulas_percorridas: number;
  distancia_m: number;
  revisitas: number;
  velocidade_media_mps: number | null;
  tensao_inicial_v: number | null;
  tensao_final_v: number | null;
  delta_v: number | null;
  carga_inicial_pct: number | null;
  carga_final_pct: number | null;
}

export interface AnulacaoCorrida {
  motivo: string;
  anulada_em: string;
  /** Login do operador que anulou (RF-96). */
  operador: string;
}

/** Resposta de `GET /api/corridas/{id}`. */
export interface DetalheCorrida extends CorridaResumo {
  /** Id da corrida gerado pelo robô (por exemplo, `r9f3a1c-1`). */
  corrida_robo: string;
  encerrada_em: string | null;
  /** Texto enviado pelo robô no `fim_corrida`, quando houver. */
  detalhe_termino: string | null;
  /** Maior sequência recebida sem lacunas antes dela. */
  ultima_sequencia_contigua: number;
  /** Sequências que faltam abaixo da maior recebida (RNF-50). */
  sequencias_faltantes: number;
  metricas: MetricasCorrida;
  /** Ordenado por `sequencia`. */
  trajeto: PassagemCorrida[];
  /** Ordenada por `sequencia`. */
  energia: LeituraEnergiaCorrida[];
  anulacao: AnulacaoCorrida | null;
}

// ============================================================================
// API HTTP — GET /api/leaderboard (ranking por tipo de labirinto, RF-95)
// ============================================================================
// Referência: `protocolo/v1/API.md`.

/** Parâmetros de consulta de `GET /api/leaderboard`. */
export interface FiltrosLeaderboard {
  /** Obrigatório: o ranking é sempre de um tipo de labirinto. */
  labirinto: TipoLabirinto;
  /** Id (UUID) de uma apresentação: só as corridas dela. Sem ele, todas. */
  apresentacao?: string;
}

/** Uma corrida no ranking. */
export interface PosicaoLeaderboard {
  /** A partir de 1. Corridas com o mesmo tempo e a mesma distância dividem a posição. */
  posicao: number;
  /** Id (UUID) da corrida no backend, o mesmo de `/api/corridas/{id}`. */
  id: string;
  /** Id da corrida gerado pelo robô. */
  corrida_robo: string;
  /** Número da tentativa na apresentação; `null` para corridas fora de apresentação. */
  numero_tentativa: number | null;
  /** Tempo oficial, pelo relógio do robô (RF-82). Primeiro critério da ordenação. */
  tempo_conclusao_ms: number;
  /** Transições × 0,18 m. Desempate: a menor distância fica à frente. */
  distancia_m: number;
  velocidade_media_mps: number | null;
  /** Instante do encerramento, ISO 8601 em UTC. */
  encerrada_em: string;
}

/** Resposta de `GET /api/leaderboard`: só corridas CONCLUIDA e não anuladas. */
export interface RespostaLeaderboard {
  labirinto: TipoLabirinto;
  /** A apresentação filtrada, ou `null` quando o ranking é de todas as corridas. */
  apresentacao: string | null;
  /** Em ordem de posição. Vazio quando nenhuma corrida válida foi concluída. */
  itens: PosicaoLeaderboard[];
}

// ============================================================================
// API HTTP — operador: login, anulação e apresentações (RF-96, RF-97, RNF-55)
// ============================================================================
// Referência: `protocolo/v1/API.md`. As rotas de escrita exigem o token do login no
// cabeçalho `Authorization: Bearer <token>`; sem ele, a resposta é `401`.

/** Corpo de `POST /api/auth/login`. */
export interface RequisicaoLogin {
  login: string;
  senha: string;
}

/** Resposta de `POST /api/auth/login`. */
export interface RespostaLogin {
  /** JWT para o cabeçalho `Authorization: Bearer <token>`. */
  token: string;
  /** Quando o token expira, ISO 8601 em UTC. */
  expira_em: string;
  operador: { login: string; nome: string };
}

/** Corpo de `POST /api/corridas/{id}/anulacao`. A resposta `201` é uma `AnulacaoCorrida`. */
export interface RequisicaoAnulacao {
  /** Justificativa, não vazia (por exemplo, "houve toque manual"). */
  motivo: string;
}

/** Uma apresentação: agrupa as corridas e numera as tentativas (RF-97). */
export interface Apresentacao {
  id: string;
  nome: string;
  /** Dia da apresentação, `AAAA-MM-DD`. */
  data: string;
  /** Só uma apresentação fica ativa por vez; as corridas novas entram nela. */
  ativa: boolean;
  criada_em: string;
}

/** Corpo de `POST /api/apresentacoes`: abre uma apresentação e encerra a que estiver ativa. */
export interface RequisicaoAbrirApresentacao {
  nome: string;
}

/** Corpo de `PATCH /api/apresentacoes/{id}`: hoje, só encerrar. */
export interface RequisicaoAlterarApresentacao {
  ativa: false;
}
