import type { FastifyInstance } from 'fastify';

/** O que um cliente HTTP de verdade (o `fetch` do painel) vê de uma resposta em stream. */
export interface LeituraReal {
  status: number;
  /** O que chegou do corpo antes do fim ou do corte. */
  recebido: string;
  /** O erro ao ler o corpo, ou `null` se ele terminou normalmente. */
  erroAoLer: unknown;
}

/**
 * Sobe o app numa porta livre e lê `caminho` com o `fetch` do Node, pedaço por pedaço, como o
 * painel faria. Serve para conferir o comportamento do lado do cliente, e não o do
 * `app.inject` (`light-my-request`).
 */
export async function lerComFetch(app: FastifyInstance, caminho: string): Promise<LeituraReal> {
  const endereco = await app.listen({ port: 0, host: '127.0.0.1' });
  const resposta = await fetch(`${endereco}${caminho}`);
  const leitor = resposta.body!.getReader();
  const decodificador = new TextDecoder();
  let recebido = '';
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      recebido += decodificador.decode(value, { stream: true });
    }
    return { status: resposta.status, recebido, erroAoLer: null };
  } catch (erro) {
    return { status: resposta.status, recebido, erroAoLer: erro };
  }
}
