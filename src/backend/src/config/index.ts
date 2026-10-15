/**
 * Configuração lida das variáveis de ambiente, validada uma única vez na inicialização.
 */
import {
  CONFIGURACAO_PADRAO,
  lerCurvaCarga,
  type ConfiguracaoDerivacao,
} from '../dominio/index.js';

export interface Config {
  porta: number;
  host: string;
  nivelLog: string;
  bancoUrl: string;
  jwtSegredo: string;
  /** Curva de carga e limiar de alerta de tensão (RF-85, RF-86). */
  derivacao: ConfiguracaoDerivacao;
}

function obrigatoria(env: NodeJS.ProcessEnv, nome: string): string {
  const valor = env[nome];
  if (valor === undefined || valor.trim() === '') {
    throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
  }
  return valor;
}

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const porta = Number(env.PORT ?? 8080);
  if (!Number.isInteger(porta) || porta <= 0 || porta > 65535) {
    throw new Error(`PORT inválida: ${env.PORT}`);
  }
  return {
    porta,
    host: env.HOST ?? '0.0.0.0',
    nivelLog: env.LOG_LEVEL ?? 'info',
    bancoUrl: obrigatoria(env, 'DATABASE_URL_APP'),
    jwtSegredo: obrigatoria(env, 'JWT_SECRET'),
    derivacao: lerDerivacao(env),
  };
}

/** `CURVA_CARGA=8.4:100,7.6:50,7.0:10,6.0:0` e `LIMIAR_TENSAO_BAIXA_V=7.0`, ambos opcionais. */
function lerDerivacao(env: NodeJS.ProcessEnv): ConfiguracaoDerivacao {
  const limiar = env.LIMIAR_TENSAO_BAIXA_V;
  const limiarTensaoBaixaV =
    limiar === undefined || limiar.trim() === ''
      ? CONFIGURACAO_PADRAO.limiarTensaoBaixaV
      : Number(limiar);
  if (!Number.isFinite(limiarTensaoBaixaV)) {
    throw new Error(`LIMIAR_TENSAO_BAIXA_V inválido: ${limiar}`);
  }
  const curva = env.CURVA_CARGA;
  return {
    ...CONFIGURACAO_PADRAO,
    limiarTensaoBaixaV,
    curvaCarga:
      curva === undefined || curva.trim() === ''
        ? CONFIGURACAO_PADRAO.curvaCarga
        : lerCurvaCarga(curva),
  };
}
