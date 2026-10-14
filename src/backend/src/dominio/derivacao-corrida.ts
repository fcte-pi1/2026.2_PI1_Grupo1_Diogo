/**
 * Derivação do estado de uma corrida a partir das mensagens do robô (RF-80 a RF-87).
 *
 * As mensagens chegam aqui já validadas e em ordem de `sequencia`. Cada `aplicar` atualiza
 * o estado e devolve os efeitos a persistir ou distribuir (passagens, leituras, snapshots,
 * mudanças de status e alertas). Não há I/O: quem executa os efeitos é a aplicação.
 */
import type { TipoLabirinto } from './labirinto.js';

export type StatusCorrida = 'EM_ANDAMENTO' | 'CONCLUIDA' | 'FALHOU' | 'INTERROMPIDA';
export type MotivoTermino = 'SUCESSO' | 'FALHA_REPORTADA' | 'SEM_SINAL' | 'REINICIO_ROBO';
export type Lado = 'norte' | 'leste' | 'sul' | 'oeste';
export type ParedesCelula = Record<Lado, boolean>;

/** Valor de cada lado na coluna `paredes` (bits): norte = 1, leste = 2, sul = 4, oeste = 8. */
const BIT_PAREDE: Record<Lado, number> = { norte: 1, leste: 2, sul: 4, oeste: 8 };

export function paredesEmBits(paredes: ParedesCelula): number {
  return (Object.keys(BIT_PAREDE) as Lado[]).reduce(
    (bits, lado) => (paredes[lado] ? bits | BIT_PAREDE[lado] : bits),
    0,
  );
}

export function paredesDeBits(bits: number): ParedesCelula {
  return {
    norte: (bits & BIT_PAREDE.norte) !== 0,
    leste: (bits & BIT_PAREDE.leste) !== 0,
    sul: (bits & BIT_PAREDE.sul) !== 0,
    oeste: (bits & BIT_PAREDE.oeste) !== 0,
  };
}

// ---------------------------------------------------------------------------
// Mensagens que a derivação entende (subconjunto do protocolo v1)
// ---------------------------------------------------------------------------

interface Base {
  sequencia: number;
  tempo_ms: number;
}

export type MensagemDerivavel =
  | (Base & { tipo: 'inicio_corrida'; labirinto: TipoLabirinto })
  | (Base & { tipo: 'celula'; x: number; y: number; paredes: ParedesCelula })
  | (Base & { tipo: 'posicao'; x: number; y: number; orientacao: string })
  | (Base & { tipo: 'energia'; tensao_v: number; corrente_a: number; potencia_w: number })
  | (Base & { tipo: 'estado'; estado: string })
  | (Base & { tipo: 'fim_corrida'; resultado: 'sucesso' | 'falha'; detalhe?: string });

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

/** Ponto da curva tensão → carga estimada da bateria. */
export interface PontoCurvaCarga {
  tensaoV: number;
  cargaPct: number;
}

export interface ConfiguracaoDerivacao {
  /** Curva tensão → carga (RF-85, CA3). A ordem dos pontos não importa. */
  curvaCarga: readonly PontoCurvaCarga[];
  /** Abaixo deste valor, alerta de tensão baixa (RF-86). */
  limiarTensaoBaixaV: number;
  /** O alerta só volta a ser emitido depois de a tensão passar de limiar + histerese. */
  histereseTensaoV: number;
  /** Snapshot do mapa a cada N mensagens `celula` (RF-80). */
  intervaloSnapshot: number;
  /** Lado de uma célula, para a distância e a velocidade (RF-83). */
  tamanhoCelulaM: number;
}

/** Curva padrão de uma LiPo 2S (HU-BE-14). Precisa ser validada com a frente de Energia. */
export const CURVA_CARGA_PADRAO: readonly PontoCurvaCarga[] = [
  { tensaoV: 8.4, cargaPct: 100 },
  { tensaoV: 7.6, cargaPct: 50 },
  { tensaoV: 7.0, cargaPct: 10 },
  { tensaoV: 6.0, cargaPct: 0 },
];

export const CONFIGURACAO_PADRAO: ConfiguracaoDerivacao = {
  curvaCarga: CURVA_CARGA_PADRAO,
  limiarTensaoBaixaV: 7.0,
  histereseTensaoV: 0.1,
  intervaloSnapshot: 20,
  tamanhoCelulaM: 0.18,
};

/** Carga estimada (%) por interpolação linear na curva, limitada a 0–100 (RF-85). */
export function cargaEstimadaPct(tensaoV: number, curva: readonly PontoCurvaCarga[]): number {
  const pontos = [...curva].sort((a, b) => a.tensaoV - b.tensaoV);
  const primeiro = pontos[0];
  const ultimo = pontos.at(-1);
  if (!primeiro || !ultimo) throw new Error('curva de carga vazia');
  if (tensaoV <= primeiro.tensaoV) return primeiro.cargaPct;
  if (tensaoV >= ultimo.tensaoV) return ultimo.cargaPct;

  for (let i = 1; i < pontos.length; i++) {
    const acima = pontos[i]!;
    const abaixo = pontos[i - 1]!;
    if (tensaoV <= acima.tensaoV) {
      const fracao = (tensaoV - abaixo.tensaoV) / (acima.tensaoV - abaixo.tensaoV);
      return arredondar(abaixo.cargaPct + fracao * (acima.cargaPct - abaixo.cargaPct), 2);
    }
  }
  return ultimo.cargaPct;
}

/**
 * Lê a curva no formato `tensão:carga,tensão:carga`, como em `CURVA_CARGA=8.4:100,7.6:50`.
 * Permite trocar a curva só pela configuração (RF-85, CA4).
 */
export function lerCurvaCarga(texto: string): PontoCurvaCarga[] {
  const pontos = texto.split(',').map((par) => {
    const [tensao, carga] = par.split(':').map((valor) => Number(valor.trim()));
    if (!Number.isFinite(tensao) || !Number.isFinite(carga)) {
      throw new Error(`ponto inválido na curva de carga: "${par}"`);
    }
    return { tensaoV: tensao!, cargaPct: carga! };
  });
  if (pontos.length < 2) throw new Error('a curva de carga precisa de pelo menos dois pontos');
  return pontos;
}

// ---------------------------------------------------------------------------
// Efeitos
// ---------------------------------------------------------------------------

export interface Metricas {
  /** Do `inicio_corrida` até a última mensagem aplicada, no relógio do robô. */
  tempoDecorridoMs: number | null;
  /** Só existe quando a corrida termina com sucesso (RF-82). */
  tempoConclusaoMs: number | null;
  /** Movimentos entre células: as mensagens `celula` depois da primeira. */
  transicoes: number;
  distanciaM: number;
  revisitas: number;
  velocidadeMediaMps: number | null;
  tensaoInicialV: number | null;
  tensaoFinalV: number | null;
  deltaV: number | null;
  correnteA: number | null;
  potenciaW: number | null;
  cargaInicialPct: number | null;
  cargaFinalPct: number | null;
}

export interface CelulaConhecida {
  x: number;
  y: number;
  paredes: ParedesCelula;
}

export interface EstadoMapa {
  celulas: CelulaConhecida[];
  posicao: { x: number; y: number; orientacao: string } | null;
}

export type Efeito =
  | {
      tipo: 'passagem';
      sequencia: number;
      ordem: number;
      x: number;
      y: number;
      paredes: number;
      tempoMs: number;
      revisita: boolean;
    }
  | {
      tipo: 'leitura_energia';
      sequencia: number;
      tempoMs: number;
      tensaoV: number;
      correnteA: number;
      potenciaW: number;
    }
  | {
      tipo: 'snapshot';
      sequenciaCorte: number;
      celulasVisitadas: number;
      mapa: EstadoMapa;
      metricas: Metricas;
    }
  | {
      tipo: 'status';
      status: StatusCorrida;
      motivo: MotivoTermino;
      detalhe: string | null;
      /** `fim_corrida` que encerrou a corrida; `null` numa interrupção. */
      sequencia: number | null;
      /** Relógio do robô no `fim_corrida`; `null` numa interrupção. */
      tempoMs: number | null;
    }
  | { tipo: 'alerta_tensao'; sequencia: number; tensaoV: number };

// ---------------------------------------------------------------------------
// Derivação
// ---------------------------------------------------------------------------

export class DerivacaoCorrida {
  status: StatusCorrida = 'EM_ANDAMENTO';
  motivo: MotivoTermino | null = null;
  detalhe: string | null = null;
  labirinto: TipoLabirinto | null;

  private tempoInicioMs: number | null = null;
  private tempoUltimoMs: number | null = null;
  private tempoUltimaCelulaMs: number | null = null;
  private tempoFimMs: number | null = null;
  private passagens = 0;
  private revisitas = 0;
  private readonly visitadas = new Map<string, CelulaConhecida>();
  private posicao: EstadoMapa['posicao'] = null;
  private primeiraLeitura: { tensaoV: number } | null = null;
  private ultimaLeitura: { tensaoV: number; correnteA: number; potenciaW: number } | null = null;
  private alertaArmado = true;
  private ultimaSequenciaAplicada = 0;

  constructor(
    labirinto: TipoLabirinto | null,
    private readonly config: ConfiguracaoDerivacao = CONFIGURACAO_PADRAO,
  ) {
    this.labirinto = labirinto;
  }

  /**
   * Só uma corrida em andamento, ou interrompida por falta de sinal (lote tardio), pode
   * terminar com o resultado do robô (RF-87, CA2). Uma interrompida por reinício não.
   */
  get aceitaFim(): boolean {
    return (
      this.status === 'EM_ANDAMENTO' ||
      (this.status === 'INTERROMPIDA' && this.motivo === 'SEM_SINAL')
    );
  }

  /** A corrida terminou com sucesso ou falha: nada mais muda nela (RNF-54). */
  get finalizada(): boolean {
    return this.status === 'CONCLUIDA' || this.status === 'FALHOU';
  }

  get ultimaSequencia(): number {
    return this.ultimaSequenciaAplicada;
  }

  /** Aplica uma mensagem, que deve vir em ordem crescente de `sequencia`. */
  aplicar(mensagem: MensagemDerivavel): Efeito[] {
    if (this.finalizada) return [];
    this.ultimaSequenciaAplicada = mensagem.sequencia;
    this.tempoUltimoMs = mensagem.tempo_ms;
    // Sem `inicio_corrida` (por exemplo, perdido numa queda sem reenvio), o relógio da
    // corrida começa na primeira mensagem aplicada.
    this.tempoInicioMs ??= mensagem.tempo_ms;

    switch (mensagem.tipo) {
      case 'inicio_corrida':
        this.labirinto = mensagem.labirinto;
        this.tempoInicioMs = mensagem.tempo_ms;
        return [];
      case 'celula':
        return this.aplicarCelula(mensagem);
      case 'posicao':
        this.posicao = { x: mensagem.x, y: mensagem.y, orientacao: mensagem.orientacao };
        return [];
      case 'energia':
        return this.aplicarEnergia(mensagem);
      case 'estado':
        return [];
      case 'fim_corrida':
        return this.aplicarFim(mensagem);
    }
  }

  /**
   * Encerra a corrida sem `fim_corrida` (RF-81): 120 s sem sinal ou reinício do robô.
   * Só vale para uma corrida em andamento.
   */
  interromper(motivo: 'SEM_SINAL' | 'REINICIO_ROBO'): Efeito[] {
    if (this.status !== 'EM_ANDAMENTO') return [];
    this.status = 'INTERROMPIDA';
    this.motivo = motivo;
    return [
      {
        tipo: 'status',
        status: 'INTERROMPIDA',
        motivo,
        detalhe: null,
        sequencia: null,
        tempoMs: null,
      },
    ];
  }

  /**
   * Restaura um status gravado que não vem das mensagens, como uma interrupção por falta de
   * sinal feita antes de o backend reiniciar. Usado só na reconstrução do estado (RNF-52).
   */
  restaurarStatus(status: StatusCorrida, motivo: MotivoTermino | null): void {
    if (this.finalizada || status !== 'INTERROMPIDA') return;
    this.status = status;
    this.motivo = motivo;
  }

  get metricas(): Metricas {
    const transicoes = Math.max(0, this.passagens - 1);
    const distanciaM = arredondar(transicoes * this.config.tamanhoCelulaM, 2);
    const fimOuAgora = this.tempoFimMs ?? this.tempoUltimoMs;
    const tempoDecorridoMs =
      this.tempoInicioMs !== null && fimOuAgora !== null ? fimOuAgora - this.tempoInicioMs : null;

    // A velocidade é recalculada a cada transição e fixada no fim da corrida (RF-83).
    const referenciaMs = this.tempoFimMs ?? this.tempoUltimaCelulaMs;
    const decorridoVelocidadeMs =
      this.tempoInicioMs !== null && referenciaMs !== null ? referenciaMs - this.tempoInicioMs : 0;
    const velocidadeMediaMps =
      transicoes > 0 && decorridoVelocidadeMs > 0
        ? arredondar(distanciaM / (decorridoVelocidadeMs / 1000), 3)
        : null;

    const inicial = this.primeiraLeitura?.tensaoV ?? null;
    const final = this.ultimaLeitura?.tensaoV ?? null;
    const curva = this.config.curvaCarga;
    return {
      tempoDecorridoMs,
      tempoConclusaoMs: this.status === 'CONCLUIDA' ? tempoDecorridoMs : null,
      transicoes,
      distanciaM,
      revisitas: this.revisitas,
      velocidadeMediaMps,
      tensaoInicialV: inicial,
      tensaoFinalV: final,
      deltaV: inicial !== null && final !== null ? arredondar(inicial - final, 3) : null,
      correnteA: this.ultimaLeitura?.correnteA ?? null,
      potenciaW: this.ultimaLeitura?.potenciaW ?? null,
      cargaInicialPct: inicial !== null ? cargaEstimadaPct(inicial, curva) : null,
      cargaFinalPct: final !== null ? cargaEstimadaPct(final, curva) : null,
    };
  }

  get mapa(): EstadoMapa {
    return { celulas: [...this.visitadas.values()], posicao: this.posicao };
  }

  private aplicarCelula(mensagem: Extract<MensagemDerivavel, { tipo: 'celula' }>): Efeito[] {
    const chave = `${mensagem.x},${mensagem.y}`;
    const revisita = this.visitadas.has(chave);
    this.passagens++;
    if (revisita) this.revisitas++;
    this.tempoUltimaCelulaMs = mensagem.tempo_ms;
    this.visitadas.set(chave, { x: mensagem.x, y: mensagem.y, paredes: { ...mensagem.paredes } });

    const efeitos: Efeito[] = [
      {
        tipo: 'passagem',
        sequencia: mensagem.sequencia,
        ordem: this.passagens,
        x: mensagem.x,
        y: mensagem.y,
        paredes: paredesEmBits(mensagem.paredes),
        tempoMs: mensagem.tempo_ms,
        revisita,
      },
    ];
    if (this.passagens % this.config.intervaloSnapshot === 0) {
      efeitos.push(this.snapshot(mensagem.sequencia));
    }
    return efeitos;
  }

  private aplicarEnergia(mensagem: Extract<MensagemDerivavel, { tipo: 'energia' }>): Efeito[] {
    const { tensao_v: tensaoV, corrente_a: correnteA, potencia_w: potenciaW } = mensagem;
    this.primeiraLeitura ??= { tensaoV };
    this.ultimaLeitura = { tensaoV, correnteA, potenciaW };

    const efeitos: Efeito[] = [
      {
        tipo: 'leitura_energia',
        sequencia: mensagem.sequencia,
        tempoMs: mensagem.tempo_ms,
        tensaoV,
        correnteA,
        potenciaW,
      },
    ];

    // Alerta com histerese (RF-86): dispara ao cair abaixo do limiar e só volta a valer
    // depois de a tensão subir acima de limiar + histerese.
    const { limiarTensaoBaixaV: limiar, histereseTensaoV: histerese } = this.config;
    if (this.alertaArmado && tensaoV < limiar) {
      this.alertaArmado = false;
      efeitos.push({ tipo: 'alerta_tensao', sequencia: mensagem.sequencia, tensaoV });
    } else if (!this.alertaArmado && tensaoV > limiar + histerese) {
      this.alertaArmado = true;
    }
    return efeitos;
  }

  private aplicarFim(mensagem: Extract<MensagemDerivavel, { tipo: 'fim_corrida' }>): Efeito[] {
    if (!this.aceitaFim) return [];

    this.tempoFimMs = mensagem.tempo_ms;
    const sucesso = mensagem.resultado === 'sucesso';
    this.status = sucesso ? 'CONCLUIDA' : 'FALHOU';
    this.motivo = sucesso ? 'SUCESSO' : 'FALHA_REPORTADA';
    this.detalhe = mensagem.detalhe ?? null;

    return [
      {
        tipo: 'status',
        status: this.status,
        motivo: this.motivo,
        detalhe: this.detalhe,
        sequencia: mensagem.sequencia,
        tempoMs: mensagem.tempo_ms,
      },
      // O snapshot final é gravado mesmo fora do múltiplo de 20 (RF-80, CA3).
      this.snapshot(mensagem.sequencia),
    ];
  }

  private snapshot(sequenciaCorte: number): Efeito {
    return {
      tipo: 'snapshot',
      sequenciaCorte,
      // Passagens, e não células distintas: 45 mensagens `celula` dão 45 (CT-BE-11).
      celulasVisitadas: this.passagens,
      mapa: this.mapa,
      metricas: this.metricas,
    };
  }
}

function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}
