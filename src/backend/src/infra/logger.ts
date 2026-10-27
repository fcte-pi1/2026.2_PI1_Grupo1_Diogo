import type { LoggerOptions } from 'pino';

/** Logs estruturados em JSON (RNF-56). Em desenvolvimento, formatados pelo pino-pretty. */
export function opcoesLogger(nivel: string): LoggerOptions {
  const desenvolvimento = process.env.NODE_ENV !== 'production';
  return {
    level: nivel,
    ...(desenvolvimento && {
      transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l' } },
    }),
  };
}
