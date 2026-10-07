import type { SaudeBackend } from '../../estado';

/** Cliente HTTP do backend. URLs relativas: mesma origem em produção, proxy do Vite em dev. */
export async function obterSaude(sinal?: AbortSignal): Promise<SaudeBackend> {
  try {
    const resposta = await fetch('/health', { signal: sinal ?? null });
    const corpo = (await resposta.json()) as { banco?: string };
    return { backend: 'ok', banco: corpo.banco === 'ok' ? 'ok' : 'indisponivel' };
  } catch {
    return { backend: 'indisponivel', banco: 'desconhecido' };
  }
}
