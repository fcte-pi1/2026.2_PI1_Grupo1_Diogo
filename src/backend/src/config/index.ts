/**
 * Configuração lida das variáveis de ambiente, validada uma única vez na inicialização.
 */
export interface Config {
  porta: number;
  host: string;
  nivelLog: string;
  bancoUrl: string;
  jwtSegredo: string;
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
  };
}
